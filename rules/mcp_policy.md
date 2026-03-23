# MCP Server Policies

This document defines when and how to use MCP (Model Context Protocol) servers.

## Priority Order

When multiple tools can accomplish the same task:

1. **MCP tools** (specialized, maintained) over generic alternatives
2. **Symbolic tools** (Serena) over text-based file operations
3. **Cached/indexed sources** (Context7) over live web search

---

## Context7 (Library Documentation)

**Purpose**: Retrieve up-to-date documentation and code examples for libraries/frameworks.

### MUST use when:
- Introducing **new** external APIs, SDKs, or dependencies
- Using version-sensitive syntax or features
- Suspected deprecations or breaking changes
- Unfamiliar library patterns

### MAY skip when:
- In-repo code already demonstrates the same API usage pattern
- Well-known, stable APIs (e.g., `JSON.parse`, `Array.map`)

### Workflow:
1. Call `resolve-library-id` first to get the library ID
2. Then call `query-docs` with specific questions
3. Limit to 3 calls per question

---

## Serena (Symbolic Code Analysis)

**Purpose**: LSP-based code navigation, refactoring, and symbolic editing.

### SHOULD use when:
- Finding symbol definitions and references (`find_symbol`, `find_referencing_symbols`)
- Understanding call hierarchy and dependencies
- Refactoring (rename, extract, move)
- Getting file/symbol overview (`get_symbols_overview`)

### MAY skip when:
- Simple single-line edits where exact location is known
- Non-code files (markdown, config, etc.)

### Best Practices:
- Use `get_symbols_overview` before diving into a new file
- Prefer `find_symbol` with `include_body=True` over reading entire files
- Use `replace_symbol_body` for function/method replacements
- Use `replace_content` with regex for targeted line edits

---

## Supabase (Database Management)

**Purpose**: Manage Supabase projects, execute SQL, apply migrations.

### MUST use migrations (`apply_migration`) for:
- Schema changes (CREATE, ALTER, DROP)
- Index creation/modification
- RLS policy changes

### MAY use direct SQL (`execute_sql`) for:
- Data queries (SELECT)
- Debugging and inspection
- One-off data fixes (with caution)

### Best Practices:
- Always check `get_advisors` for security/performance issues after DDL changes
- Use `generate_typescript_types` after schema changes
- Prefer branches for experimental changes

---

## Web Search (Exa / web-search)

**Purpose**: Search the web for current information, error solutions, latest docs.

### SHOULD use when:
- Current events or recent releases (post knowledge cutoff)
- Error messages not found in repo or Context7
- Comparing multiple solutions/approaches
- Finding community discussions or GitHub issues

### MAY skip when:
- Information is available in repo or offline knowledge
- Context7 has the documentation needed
- Question is about stable, well-documented features

---

## Browser Tools (browser-tools-mcp)

**Purpose**: Browser automation, screenshots, DOM inspection.

### SHOULD use when:
- E2E testing requiring visual verification
- Capturing screenshots for documentation
- Debugging frontend rendering issues
- Inspecting live DOM state

### Caution:
- Requires browser extension running
- May not work in headless environments

---

## Exa (AI Search)

**Purpose**: AI-powered semantic search with better relevance than keyword search.

### SHOULD use when:
- Complex, nuanced queries
- Finding conceptually similar content
- Research requiring synthesis

### MAY skip when:
- Simple keyword searches suffice
- Exact phrase matching needed

---

## React Design Systems (react-design-systems)

**Purpose**: Access design system components and patterns.

### SHOULD use when:
- Building UI components
- Looking for design tokens/variables
- Checking component APIs and props

### Note:
- Requires local server running at `http://10.39.60.65:3010`

---

## Stitch (Proxy)

**Purpose**: MCP proxy/aggregator.

### Usage:
- Transparent proxy layer
- No direct policy needed

---

## General Guidelines

1. **Check availability first**: Not all MCP servers may be running
2. **Prefer specialized tools**: Use the right tool for the job
3. **Cache awareness**: Some tools cache results; re-query if data may be stale
4. **Error handling**: If MCP tool fails, fall back to alternative methods
5. **Rate limits**: Some hosted services have rate limits; batch queries when possible
