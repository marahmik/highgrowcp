---
name: gh-loop
argument-hint: [finding description | issue number to resume]
description: Runs a finding→issue→fix→PR→cross-verify→HITL loop on GitHub (autonomy Q2, option-D PoC). Use when the user says "gh-loop", "이슈 루프", "finding을 이슈로", "자율 수정 루프", "issue fix loop", or wants a finding turned into an issue, fixed, PR'd, and cross-verified with a human decision gate. NEVER auto-merges.
---

# gh-loop — Finding → Issue → Fix → PR → Cross-verify → HITL

## Goal

발견사항을 GitHub 이슈로 만들고, 수정하고, PR을 열고, 교차검증한 뒤, **판단이 필요한 지점에서 멈춰 사용자에게 묻는** 반자율 루프. GitHub(이슈/PR/라벨/댓글)이 곧 상태저장소이자 버스다 — 루프는 프로세스를 점유하지 않고 **stateless-resumable**하다.

이것은 **option-D PoC**다 (analysis `claudedocs/harness-auto-capture-analysis.md#Q2`): 단일 세션에서 네가 킥오프하고, 결정점에선 이슈에 질문을 남기고 **턴을 종료**한다. 준비되면 `/gh-loop <issue-number>`로 재호출해 재개한다. 완전 자율 런타임(GitHub Actions/runner = 옵션 A)은 검증 후 별도 작업이다.

## Non-Negotiables

| Rule | Violation = STOP |
|------|------------------|
| **머지 절대 자동 금지** | 교차검증은 advisory일 뿐. 에이전트는 **자율 단계로 머지하지 않는다**; `gh pr merge`는 **PR별 명시적 인간 승인**(이슈/PR 댓글)이 있을 때만 그 지시로 실행한다. |
| **블로킹 대기 금지** | 결정점에선 질문을 이슈에 게시하고 **턴 종료**. 프로세스를 붙잡고 폴링/sleep 하지 않는다. |
| **dedup/throttle** | 이슈 생성 전 항상 `gh-loop-issue.mjs`로 중복·상한을 판정. 동일 finding 이슈 폭주 금지. 단 `gh issue list`는 **최종일관성**이라 생성 직후 조회가 권위적이지 않음 — Stage 1 주의 참조. |
| **사용자 응답 최우선** | 재개 시 이슈 댓글의 최신 사용자 지시를 memory/계획보다 우선한다 (CLAUDE.md "user > memory"). |
| **파괴 작업 가드** | force-push·history 재작성·대량 삭제는 advisory에 그치지 않고 사용자 확인. |

## Inputs

- `$ARGUMENTS`:
  - **finding 설명** (산문) → 새 루프 시작 (Stage 1부터).
  - **이슈 번호** (예: `42`) → 그 이슈에서 **재개** (needs-decision 응답 처리 또는 다음 단계).
  - 비어 있음 → 사용자에게 finding 또는 재개할 이슈를 묻는다.

## Prerequisites (discover, don't assume)

```bash
gh auth status                 # gh CLI 인증 (compr이 gh pr create로 쓰는 것과 동일)
gh repo view --json nameWithOwner -q .nameWithOwner
```

미인증 → `gh auth login` 안내 후 중단. autopilot/ralph·reviewer 등 재사용 자산은 OMC/하네스가 제공(아래 Reuse Map).

## Process

### Stage 1 — Finding → Issue (dedup + throttle)

**Finding 소스 (둘 중 하나)**:
- **수동 지목** (기본): 네가/사용자가 finding을 직접 제시 → 아래 1·2로 이슈화.
- **자동탐지** (option, Q2.7-4): `gh-loop-detect.mjs`로 소스에서 finding을 추출·계획한 뒤 아래 생성 경로를 재사용한다(신규 생성 로직 없음):
  ```bash
  EXISTING=$(gh issue list --state open --label gh-loop --json number,title,labels,body --limit 100)
  # 소스: breadcrumb의 미해결 FAIL(FAIL 뒤 동일 type PASS면 제외) — 또는 lint/리뷰: --from json --findings-json '[{"title","body","labels"}]'
  node .omp/extensions/harness/gh-loop-detect.mjs detect --from breadcrumb --existing-json "$EXISTING" --cap 5
  ```
  출력 `plan[]`에서 `action=="create"`인 항목마다 그 `payload`(title/body/labels)를 **Stage 1 create 블록과 동일한 안전 패턴**(변수 title + `--body-file` + 라벨 배열)으로 생성한다. `skip`/`block`은 건너뛴다. *언제* 돌릴지(스케줄/트리거)는 option-A 런타임·per-project 몫.

1. 루프 라벨을 보장하고(없으면 생성, 멱등) 열린 루프 이슈를 수집한다 (dedup 입력):
   ```bash
   gh label create gh-loop --description "gh-loop automated" --color BFD4F2 2>/dev/null || true
   gh label create needs-decision --description "awaiting human decision" --color D93F0B 2>/dev/null || true
   gh issue list --state open --label gh-loop --json number,title,labels,body --limit 100
   ```
   새 repo엔 라벨이 없어 `--label gh-loop` 조회가 곧장 실패하므로 **먼저 보장**한다 (라이브 검증에서 확인된 게이트).

   **`gh issue list` 최종일관성 주의** (라이브 E2E에서 확인): 이슈 생성 **직후** 같은 쿼리로 재조회하면 방금 만든 이슈가 **누락**될 수 있다 → dedup 입력이 비어 **중복 생성** 위험(+ 빈/stale list는 `gh-loop-issue`의 `existing.length` 기반 **open-count throttle 백스톱**도 과소계상해 상한이 늦게 걸림). 완화: (a) **한 run 안에서는** `planIssues`의 배치 dedup(`seen` 누적)이 gh 조회 없이 중복을 막는다(1차 방어); (b) **연속 run**(자동 cron 등)은 list 지연을 가정 — **직렬화만으론 부족**(다음 run도 stale list를 볼 수 있음): 마커 기반 dedup이 나중에 수렴하게 두거나 직렬화에 **수렴 대기/재시도**를 더한다; (c) 즉시 재조회가 필요하면 카운트가 맞을 때까지 **짧은 재시도**. `gh issue list`를 *즉시* 권위 소스로 가정하지 말 것.
2. 생성 여부를 **헬퍼**로 판정한다 (gh 호출은 seam, 결정은 테스트된 로직). finding 텍스트는 **변수로** 넘기고 쉘 라인에 보간하지 않는다. `--out`은 **호출마다 임시 디렉터리**로 받아(공유 `/tmp/ghloop` 레이스·심링크 회피) **jq 없이**(node만) 소비한다:
   ```bash
   GHLOOP_OUT=$(mktemp -d); trap 'rm -rf "$GHLOOP_OUT"' EXIT
   gh issue list --state open --label gh-loop --json number,title,labels,body --limit 100 > "$GHLOOP_OUT/existing.json" \
     || { echo "gh issue list failed — abort (헬퍼에 손상된 입력 금지)"; exit 1; }
   node .omp/extensions/harness/gh-loop-issue.mjs decide --kind finding \
     --title "$FINDING_TITLE" --body "$FINDING_BODY" --label "$SEV" \
     --cap 5 --created "$CREATED" --existing-json "$(cat "$GHLOOP_OUT/existing.json")" \
     --out "$GHLOOP_OUT" > /dev/null
   action=$(cat "$GHLOOP_OUT/action")
   ```
   - `action == "skip"` → 중복. **`$GHLOOP_OUT/dup`(중복 이슈 번호)** 와 `reason`을 읽어 그 이슈에 코멘트만 남기고 종료.
   - `action == "block"` → `$GHLOOP_OUT/reason` 보고 멈춤 (상한 도달, 또는 **손상된 `--existing-json`** = fail-closed).
   - `action == "create"` → payload 파일로 생성. **finding 텍스트를 쉘 명령줄에 보간하지 말 것** — `$(...)`·백틱이 그대로 실행된다:
     ```bash
     label_args=()
     while IFS= read -r l; do label_args+=(--label "$l"); done < "$GHLOOP_OUT/labels"
     gh issue create --title "$(cat "$GHLOOP_OUT/title")" \
       --body-file "$GHLOOP_OUT/body.md" "${label_args[@]}"
     ```
     `"$(cat …/title)"` 전개 결과는 재스캔되지 않아 finding의 `$(...)`/백틱이 무력화되고, `--body-file`은 본문을 명령줄 밖으로 빼며, 배열은 각 라벨을 한 인자로 안전 전달한다. `body.md`엔 dedup 마커가 박힌다.

### Stage 2 — Issue → Fix (재사용, 신규 구현 없음)

생성/지정된 이슈를 작업 단위로 **autopilot**(또는 복잡하면 **ralph**)에 넘긴다. 하네스 게이트(context/acceptance/backpressure/review)가 그 안에서 그대로 작동한다. 새 수정 엔진을 만들지 않는다 — 기존 실행 substrate를 배선만 한다 (analysis Q2.4).

### Stage 3 — Fix → PR

`compr` 스킬 절차로 브랜치·커밋·PR을 만든다 (`gh pr create`, `.omp/skills/compr/SKILL.md`). PR 본문에 `Closes #<issue>`를 넣어 이슈와 연결한다.

### Stage 4 — PR → Cross-verify (**advisory**)

PR에 대해 교차검증을 1패스 돌린다 — 결과는 **참고용**이지 머지 게이트가 아니다:
- `reviewer` 에이전트 (`.omp/agents/reviewer.md`) — 적대적 다중패스 리뷰.
- 이종 모델 2차 의견: `adversary` 에이전트 (`.omp/agents/adversary.md`) 또는 OMC `ccg`(claude+codex+gemini).
- 결과 요약을 파일로 써서 PR 코멘트로 게시한다 (`gh pr comment <pr> --body-file /tmp/ghloop-review.md`) — 본문을 쉘 명령줄에 보간하지 않는다.

### Stage 5 — Decision Gate → HITL (the crux)

판단이 필요하면 (예: 교차검증이 HIGH+ 이슈 제기 / 스키마·API 파괴 변경 / 머지 직전 / 파괴 작업) **자동 진행하지 않는다**:

1. 구조화 질문을 **파일**로 작성하고(보간 회피) 끝에 **고유 nonce 마커** `<!-- gh-loop:decision:<nonce> -->`(nonce 예: `$(date +%s)-$RANDOM`)를 붙인다 — 이 마커가 *이 결정점*을 식별해 재개가 stale 댓글을 재사용하지 못하게 한다. 그 뒤 코멘트 게시 + `needs-decision` 라벨:
   ```
   ## Decision needed
   **Context**: <무엇을/왜 멈췄나 — PR·이슈 링크; 머지 질문이면 현재 PR head SHA도>
   **Question**: <하나의 명확한 질문>
   **Options**: A) … (tradeoff) / B) … (tradeoff)
   **Recommendation**: <기본안 + 근거>
   <!-- gh-loop:decision:<nonce> -->
   ```
   ```bash
   gh issue comment <issue> --body-file /tmp/ghloop-question.md
   gh issue edit <issue> --add-label needs-decision
   ```
2. **턴을 종료**한다 (option D: 프로세스 안 붙잡음). 사용자에게: "이슈 #N에 결정 요청을 남겼습니다. 댓글로 답한 뒤 `/gh-loop N`으로 재개하세요."

**재개** (트리거 = `needs-decision` 이슈에 **권한자(write+)**의 새 댓글. option-A: `issue_comment` webhook; option-D: 수동 핑 / `/gh-loop N`):
1. `issue://<n>` 로 이슈+댓글(author·createdAt 포함)을 읽는다.
2. **가장 최근 에이전트 질문 마커**(`<!-- gh-loop:decision:<nonce> -->`)를 찾고, **그 이후에 달린 댓글만** 후보로 본다 — 그 전 댓글은 *이전 결정용 stale*이라 무시. 에이전트 자기 댓글 제외(bot author / `gh-loop:` 마커).
3. 후보 중 **권한자(write+) 댓글만**; **owner 우선, 없으면 최신**. 권한자 간 **명시적 이견**이면 자동결정 말고 되묻기(parked).
4. 그 댓글을 **LLM으로 해석**한다 — **고정 키워드/`grep` 금지**. 자연어로 충분(예: `"B, 검증까지 해야지"` → 옵션 B+검증; grep이었으면 놓쳤다). **모호하면 행동 금지** → 명확화 댓글 + parked 유지.
5. 머지 결정이면: 승인 댓글이 **현재 PR head SHA 이후**여야 하고, **머지 직전 PR head를 다시 읽어** 승인 시점 SHA와 일치할 때만 머지 — `gh pr merge --match-head-commit <approved-sha>`(원자적 head 가드; 그 사이 새 커밋이 들어오면 머지 중단). 자율 단계로는 절대 머지 안 함.
6. 멱등: 행동 **성공 후** `<!-- gh-loop:acted:<nonce> -->` 기록 + `needs-decision` 제거; acted된 nonce면 재실행 무시. acted/라벨 쓰기가 **실패하면 park**(모호하게 두지 말 것). 재개 시엔 마커뿐 아니라 **실제 상태를 재확인**(PR 이미 머지됨 등)해 멱등 보장 — stateless 마커는 원자적이지 않다(Guard policy 직렬화·멱등 참조).

## Loop Safety

- **이슈 상한** = 헬퍼 `--cap`(기본 5). 런당 생성 수(`--created`)가 cap에 도달하거나 **열린 gh-loop 이슈 수가 cap에 도달**하면 `block` — 후자는 호출자 카운팅을 신뢰하지 않는 관측 기반 백스톱.
- **반복 한도**: 같은 이슈에서 fix→verify가 N회(기본 3) 수렴 실패면 멈추고 `needs-decision`으로 사용자에게.
- 파괴 작업은 advisory를 넘어 사용자 확인 (Non-Negotiables).

## Guard policy (확정 — 라이브 검증 후 결정)

option-A에서 "권한자 댓글 = 트리거"의 안전 정책:
- **권한 임계값**: **write 권한 이상**만 루프를 조종할 수 있다 (그 미만 댓글은 무시).
- **봇 아이덴티티**: 전용 **bot 토큰**으로 식별; PAT 모드면 에이전트 댓글의 `<!-- gh-loop:* -->` **마커 prefix fallback**으로 자기 댓글 제외.
- **다중 응답 충돌**: **owner 우선, 없으면 최신** 권한자; 명시적 이견이면 **되묻기**(자동결정 금지).
- **모호성 에스컬레이션**: 명확화 후에도 미결이면 **무기한 parked** — 자동결정하지 않는다 (선택적 리마인더만).
- **동시성·멱등 (option-A)**: runner는 **이슈별 concurrency group**으로 직렬화(동시 `issue_comment` 워커 금지)하고 행동은 **멱등**이어야 한다(이미 머지된 PR 재머지=no-op 등). stateless `acted` 마커만으론 원자성이 보장되지 않으므로 직렬화가 1차 방어, 멱등이 2차.

## Reuse Map (stage → asset → 위치 / provenance)

| Stage | Asset | 위치 |
|---|---|---|
| 1 finding→issue (dedup/throttle/label) | `gh issue create` + 헬퍼 | **harness(신규)**: `.omp/extensions/harness/gh-loop-issue.mjs` |
| 2 issue→fix | autopilot / ralph + 하네스 게이트 | **OMC**(전역 스킬) + `.omp/extensions/harness/gates/` |
| 3 fix→PR | `gh pr create` (compr 절차) | **harness**: `.omp/skills/compr/SKILL.md` |
| 4 cross-verify (advisory) | reviewer · adversary · ccg/codex | **harness**: `.omp/agents/{reviewer,adversary,verifier}.md` · **OMC**: ccg/codex |
| 5 decision gate / resume | `needs-decision` 라벨 + `issue://` read | 본 스킬 컨벤션 + `gh` CLI |

## Substrate note

- **지금(option D)**: 단일 세션, 수동 킥오프·재호출. 본 레포가 만드는 건 **재사용 자산**(이 스킬 + 헬퍼)이고, 실제 실행은 각 프로젝트에서 이 스킬을 호출해 일어난다.
- **검증 후(option A, 별도 작업)**: `.github/workflows/` + self-hosted runner + `issue_comment` 트리거로 재개를 자동화. 본 PoC의 범위 밖.

## State

루프 상태는 **GitHub에 산다** — 이슈/PR 상태, `gh-loop`/`needs-decision` 라벨, 댓글. 별도 로컬 상태 파일을 만들지 않는다 (재개는 이슈 번호만으로 충분).
