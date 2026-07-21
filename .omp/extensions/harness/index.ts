// harness/index.ts — OMP extension that wires the harness gates (gates/*.mjs)
// into the OMP event model. This replaces the Claude Code registration that
// lived in `.claude/settings.json` (PreToolUse/PostToolUse/... hooks).
//
// Event mapping (Claude Code -> OMP):
//   PreToolUse  Edit|Write   -> tool_call  edit|write            : context-gate (blocking; an
//     xd://ast_edit device write pre-gates the paths named in its JSON body — read-before-edit holds)
//   PreToolUse  Bash         -> tool_call  bash                 : destructive-guard (advisory), commit-gates (blocking)
//   PreToolUse  mcp__*       -> tool_call  mcp__*               : mcp-gate (advisory)
//   PostToolUse Read         -> tool_result read                : read-tracker
//   PostToolUse Grep         -> tool_result grep                 : read-tracker (batched; search-minted [path#TAG] anchors satisfy context-gate)
//   PostToolUse Bash         -> tool_result bash (ok)           : backpressure-tracker
//   PostToolUse Bash (ok git commit) -> tool_result bash        : harness-version-check (1h window; drift appended to result)
//   BeforeAgentStart -> before_agent_start                      : harness-version-check (1h window; agent-facing reminder) + kickoff-detector
//   PostToolUseFailure Bash  -> tool_result bash (isError)      : backpressure-failure-tracker
//   PostToolUse Edit|Write   -> tool_result edit|write           : mutationRoute -> write-tracker + backpressure-invalidator + mermaid-check
//     (v17 xd:// dispatches ride `write`: ast_edit preview only invalidates backpressure, the REAL
//      apply is tracked via the xd://resolve dispatch envelope; xd grep/ast_grep results record read anchors)
//   UserPromptSubmit         -> before_agent_start              : kickoff-detector (message injection)
//   SessionStart             -> session_start                   : harness-version-check
//
// The gate scripts are unchanged stdin-JSON CLIs (exit 0 = allow, stderr
// "HARNESS WARNING" = advisory; exit 2 = block, stderr = reason) so the
// existing test suite under tests/ keeps covering them directly.
//
// Requires `node` on PATH (gates are spawned with node, NOT process.execPath —
// inside OMP, process.execPath is the omp binary itself).
//
// Exception: the mermaid check (mermaid-check.ts) runs IN-PROCESS, not as a
// spawned gate — it needs omp's bundled @oh-my-pi/pi-utils parser, which only
// resolves inside the compiled omp binary. It appends a warning chunk to the
// tool result (fail-open, never blocks).
//
// Infra failures (node missing, gate crash, timeout) fail OPEN with a loud
// warning, matching the original per-hook fail-open behavior. Only an explicit
// gate exit code 2 blocks a tool call.

import { spawn } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isGitCommit } from "./gates/git-commit-detect.mjs";
import { mutationCallTargets, mutationRoute, readTarget, searchTrackTargets } from "./gates/read-path.mjs";
import { checkMermaidFile, MERMAID_SUPPORTED } from "./mermaid-check";

const GATES_DIR = join(dirname(fileURLToPath(import.meta.url)), "gates");
const GATE_TIMEOUT_MS = 3_000;
const COMMIT_GATES_TIMEOUT_MS = 15_000;
const VERSION_CHECK_TIMEOUT_MS = 15_000;

/** Tools that create or mutate files (Claude Code's Edit|Write matcher). v17 moved
 *  ast_edit behind the xd:// device transport, so it arrives as `write` here. */
const isEditToolName = (name: string): boolean => name === "edit" || name === "write";

interface ContentChunk {
	type: string;
	text?: string;
}

interface ToolCallEvent {
	toolName: string;
	toolCallId?: string;
	input?: Record<string, unknown>;
}

interface ToolResultEvent extends ToolCallEvent {
	content?: ContentChunk[];
	isError?: boolean;
	details?: { exitCode?: number; applied?: boolean } & Record<string, unknown>;
}

/**
 * OMP's bash tool reports a non-zero command exit as a SUCCESSFUL tool result
 * (isError stays false) and carries the code in `details.exitCode` — the field
 * is absent entirely on exit 0. Treat either signal as a failed run so failing
 * verifications route to backpressure-failure-tracker, never to a false PASS.
 */
function bashRunFailed(event: ToolResultEvent): boolean {
	if (event.isError) return true;
	const exitCode = event.details?.exitCode;
	return typeof exitCode === "number" && exitCode !== 0;
}

interface ToolCallBlock {
	block: true;
	reason: string;
}

/** tool_result middleware patch: returned `content` replaces the original. */
interface ToolResultPatch {
	content: ContentChunk[];
}

interface AgentStartMessage {
	message: {
		customType: string;
		content: string;
		display: boolean;
	};
}

interface SessionMessageLike {
	role?: string;
	content?: unknown;
}

interface SessionEntryLike {
	message?: SessionMessageLike;
	role?: string;
	content?: unknown;
}

interface HarnessCtx {
	cwd: string;
	hasUI: boolean;
	ui?: {
		notify?(message: string, type?: string): void;
	};
	sessionManager?: {
		getBranch?(): SessionEntryLike[];
	};
}

interface HarnessLogger {
	warn?(message: string): void;
	info?(message: string): void;
}

interface HarnessExtensionApi {
	setLabel?(label: string): void;
	logger?: HarnessLogger;
	on(event: "tool_call", handler: (event: ToolCallEvent, ctx: HarnessCtx) => Promise<ToolCallBlock | undefined>): void;
	on(event: "tool_result", handler: (event: ToolResultEvent, ctx: HarnessCtx) => Promise<ToolResultPatch | undefined>): void;
	on(event: "before_agent_start", handler: (event: unknown, ctx: HarnessCtx) => Promise<AgentStartMessage | undefined>): void;
	on(event: "session_start", handler: (event: unknown, ctx: HarnessCtx) => Promise<void>): void;
}

/** Freshness window for mid-session drift rechecks (turn start, post-commit). */
const DRIFT_RECHECK_MAX_AGE_MS = 60 * 60 * 1000;

/** stdin payload in the shape the Claude Code hook protocol fed the gates. */
interface GatePayload {
	tool_name?: string;
	tool_input?: Record<string, unknown>;
	prompt?: string;
	max_age_ms?: number;
	session_state: { cwd: string };
}

interface GateRun {
	status: number | null;
	stdout: string;
	stderr: string;
	/** Spawn-level failure (node missing, timeout kill, ...), not a gate verdict. */
	failure?: string;
}

function runGate(script: string, payload: GatePayload, timeoutMs = GATE_TIMEOUT_MS): Promise<GateRun> {
	const { promise, resolve: settle } = Promise.withResolvers<GateRun>();
	let stdout = "";
	let stderr = "";
	try {
		const child = spawn("node", [join(GATES_DIR, script)], {
			stdio: ["pipe", "pipe", "pipe"],
			timeout: timeoutMs,
		});
		child.stdout?.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		child.on("error", (err: Error) => settle({ status: null, stdout, stderr, failure: err.message }));
		child.on("close", (status: number | null) => settle({ status, stdout, stderr }));
		child.stdin?.end(JSON.stringify(payload));
	} catch (err) {
		settle({ status: null, stdout, stderr, failure: err instanceof Error ? err.message : String(err) });
	}
	return promise;
}

function textChunks(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	let text = "";
	for (const chunk of content) {
		if (chunk && typeof chunk === "object" && (chunk as ContentChunk).type === "text") {
			const part = (chunk as ContentChunk).text;
			if (part) text += (text ? "\n" : "") + part;
		}
	}
	return text;
}

function latestUserText(event: unknown, ctx: HarnessCtx): string {
	const evt = event as { prompt?: unknown; text?: unknown } | undefined;
	if (typeof evt?.prompt === "string" && evt.prompt) return evt.prompt;
	if (typeof evt?.text === "string" && evt.text) return evt.text;
	const branch = ctx.sessionManager?.getBranch?.() ?? [];
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		const message = entry.message ?? entry;
		if (message.role !== "user") continue;
		const text = textChunks(message.content);
		if (text) return text;
	}
	return "";
}

/** Append a HARNESS WARNING chunk when any mermaid block failed to parse. */
function mermaidResultPatch(event: ToolResultEvent, problems: string[]): ToolResultPatch | undefined {
	if (!problems.length) return undefined;
	const text = [
		"HARNESS WARNING: invalid mermaid diagram(s) in this edit — the OMP bundled parser rejected:",
		...problems.map((problem) => `  - ${problem}`),
		`Supported types: ${MERMAID_SUPPORTED}.`,
		"Fix the block(s) and re-save; docs are rendered by Obsidian/GitHub and the OMP TUI.",
	].join("\n");
	return { content: [...(event.content ?? []), { type: "text", text }] };
}

export default function harness(pi: HarnessExtensionApi): void {
	pi.setLabel?.("Harness Gates");

	const surface = (ctx: HarnessCtx, run: GateRun, gate: string): void => {
		const lines: string[] = [];
		if (run.failure) lines.push(`HARNESS WARNING: gate '${gate}' did not run (${run.failure}); skipping it.`);
		else if (run.status !== 0 && run.status !== 2) lines.push(`HARNESS WARNING: gate '${gate}' exited ${run.status}; skipping it.`);
		const stderr = run.stderr.trim();
		if (stderr && run.status !== 2) lines.push(stderr);
		if (!lines.length) return;
		const message = lines.join("\n");
		if (ctx.hasUI && ctx.ui?.notify) ctx.ui.notify(message, "warning");
		else pi.logger?.warn?.(message);
	};

	pi.on("tool_call", async (event, ctx) => {
		try {
			const session_state = { cwd: ctx.cwd };
			if (event.toolName === "bash") {
				const command = String(event.input?.command ?? "");
				if (!command) return;
				const payload: GatePayload = { tool_name: "Bash", tool_input: { command }, session_state };
				const guard = await runGate("destructive-guard.mjs", payload);
				surface(ctx, guard, "destructive-guard");
				// Cheap in-process pre-check; commit-gates spawns 4 child gates on a real commit.
				if (isGitCommit(command)) {
					const gates = await runGate("commit-gates.mjs", payload, COMMIT_GATES_TIMEOUT_MS);
					if (gates.status === 2) return { block: true, reason: gates.stderr.trim() || "HARNESS BLOCK: commit gate failed." };
					surface(ctx, gates, "commit-gates");
				}
				return;
			}
			if (isEditToolName(event.toolName)) {
				for (const filePath of mutationCallTargets(event.toolName, event.input, ctx.cwd)) {
					const run = await runGate("context-gate.mjs", { tool_name: "Edit", tool_input: { file_path: filePath }, session_state });
					if (run.status === 2) return { block: true, reason: run.stderr.trim() || `HARNESS BLOCK: read '${filePath}' before editing it.` };
					surface(ctx, run, "context-gate");
				}
				return;
			}
			if (/^mcp__/.test(event.toolName)) {
				const run = await runGate("mcp-gate.mjs", { tool_name: event.toolName, tool_input: event.input ?? {}, session_state });
				surface(ctx, run, "mcp-gate");
			}
		} catch (err) {
			// Never fail closed on adapter bugs — gates block only via exit 2.
			pi.logger?.warn?.(`HARNESS WARNING: tool_call adapter error: ${err instanceof Error ? err.message : String(err)}`);
		}
		return;
	});

	pi.on("tool_result", async (event, ctx) => {
		try {
			const session_state = { cwd: ctx.cwd };
			if (event.toolName === "read" && !event.isError) {
				const filePath = readTarget(event.input, ctx.cwd);
				if (filePath) await runGate("read-tracker.mjs", { tool_name: "Read", tool_input: { file_path: filePath }, session_state });
				return;
			}
			// grep/ast_grep mint per-file [path#TAG] edit anchors backed by whole-file
			// snapshots, and OMP's edit tool accepts them ("from your latest read/search") —
			// record the anchored files as read or context-gate false-blocks a grep-anchored
			// edit (live-reproduced on omp 16.3.12, 2026-07-09). One batched spawn per result.
			if (event.toolName === "grep" && !event.isError) {
				const files = searchTrackTargets(event.details, textChunks(event.content), ctx.cwd);
				if (files.length) await runGate("read-tracker.mjs", { tool_name: "Read", tool_input: { file_paths: files }, session_state });
				return;
			}
			if (event.toolName === "bash") {
				const command = String(event.input?.command ?? "");
				if (!command) return;
				const payload: GatePayload = { tool_name: "Bash", tool_input: { command }, session_state };
				const tracker = bashRunFailed(event) ? "backpressure-failure-tracker.mjs" : "backpressure-tracker.mjs";
				await runGate(tracker, payload);
				await runGate("breadcrumb-tracker.mjs", { tool_name: "Bash", tool_input: { command, failed: bashRunFailed(event) }, session_state });
				// Post-commit drift recheck (1h window): a bump published mid-session surfaces at
				// the next commit. Appended to the tool result so the AGENT sees it — surface()/
				// ui.notify is human-facing only. Non-blocking by design: a stale harness never
				// invalidates the commit itself (blocking here would force a remote-wins sync
				// onto a dirty tree — the exact hazard we avoid).
				if (isGitCommit(command) && !bashRunFailed(event)) {
					const drift = await runGate("harness-version-check.mjs", { session_state, max_age_ms: DRIFT_RECHECK_MAX_AGE_MS }, VERSION_CHECK_TIMEOUT_MS);
					const note = drift.stdout.trim();
					if (note) return { content: [...(event.content ?? []), { type: "text", text: note }] };
				}
				return;
			}
			if (isEditToolName(event.toolName) && !event.isError) {
				// v17 xd:// device dispatches ride `write` (details.xdev envelope); mutationRoute
				// classifies them BEFORE plain file targets — structurally fixing the ordering that
				// let device writes fall into the generic branch and track only the bogus device
				// path (live-reproduced on omp 17.0.1, 2026-07-16; contract tests: xdev-dispatch).
				const route = mutationRoute(event.toolName, event.input, event.details, textChunks(event.content), ctx.cwd);
				// xd grep/ast_grep results mint [path#TAG] edit anchors exactly like the top-level
				// grep tool — record them as read or context-gate false-blocks an anchored edit.
				if (route.kind === "read-anchors") {
					if (route.files.length) await runGate("read-tracker.mjs", { tool_name: "Read", tool_input: { file_paths: route.files }, session_state });
					return;
				}
				// Staged ast_edit preview: backpressure-invalidator as a BEST-EFFORT early fallback
				// (from the device args' paths). The breadcrumb (phantom until apply, false on
				// discard) and write-tracker are deferred to the xd://resolve apply below.
				if (route.kind === "preview") {
					for (const filePath of route.files) {
						await runGate("backpressure-invalidator.mjs", { tool_name: "Write", tool_input: { file_path: filePath }, session_state });
					}
					return;
				}
				// Other xd devices (generate_image, MCP tools, …) touch no local files.
				if (route.kind === "device") return;
				// "apply" (the REAL write of a staged preview, resolved from the dispatch envelope's
				// inner file list) and "files" (plain write/edit) share full tracking.
				const mermaidProblems: string[] = [];
				for (const filePath of route.files) {
					const payload: GatePayload = { tool_name: "Write", tool_input: { file_path: filePath }, session_state };
					await runGate("write-tracker.mjs", payload);
					await runGate("backpressure-invalidator.mjs", payload);
					await runGate("breadcrumb-tracker.mjs", payload);
					for (const problem of await checkMermaidFile(filePath)) {
						mermaidProblems.push(`${relative(ctx.cwd, filePath)}: ${problem}`);
					}
				}
				return mermaidResultPatch(event, mermaidProblems);
			}
		} catch (err) {
			pi.logger?.warn?.(`HARNESS WARNING: tool_result adapter error: ${err instanceof Error ? err.message : String(err)}`);
		}
	});

	pi.on("before_agent_start", async (event, ctx) => {
		try {
			const session_state = { cwd: ctx.cwd };
			const notes: string[] = [];
			// Turn-start drift reminder (1h window): cache hits are a fast local read; misses
			// probe ls-remote at most once per window, and failed probes back off via the
			// gate's failure marker. Returned as a message so the AGENT acts on it.
			const drift = await runGate("harness-version-check.mjs", { session_state, max_age_ms: DRIFT_RECHECK_MAX_AGE_MS }, VERSION_CHECK_TIMEOUT_MS);
			const driftNote = drift.stdout.trim();
			if (driftNote) notes.push(driftNote);
			const prompt = latestUserText(event, ctx);
			if (prompt) {
				const run = await runGate("kickoff-detector.mjs", { prompt, session_state });
				const note = run.stdout.trim();
				if (note) notes.push(note);
			}
			if (notes.length) return { message: { customType: "harness-reminder", content: notes.join("\n\n"), display: true } };
		} catch (err) {
			pi.logger?.warn?.(`HARNESS WARNING: before_agent_start adapter error: ${err instanceof Error ? err.message : String(err)}`);
		}
		return;
	});

	pi.on("session_start", async (_event, ctx) => {
		const session_state = { cwd: ctx.cwd };
		try {
			const run = await runGate("harness-version-check.mjs", { session_state }, VERSION_CHECK_TIMEOUT_MS);
			const note = `${run.stdout}\n${run.stderr}`.trim();
			if (note) { if (ctx.hasUI && ctx.ui?.notify) ctx.ui.notify(note, "warning"); else pi.logger?.info?.(note); }
		} catch {
			// Version check is best-effort advisory; stay silent on infra errors.
		}
		try {
			const run = await runGate("breadcrumb-surface.mjs", { session_state });
			const note = run.stdout.trim();
			if (note) { if (ctx.hasUI && ctx.ui?.notify) ctx.ui.notify(note, "info"); else pi.logger?.info?.(note); }
		} catch {
			// Surface is best-effort; prior summaries are a nicety, not a gate.
		}
	});
}
