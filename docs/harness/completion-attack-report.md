# Completion Attack Report: 운영 무변경 유지보수

- Task ID: `20261019-120000-a491`
- Reviewer: `MaintenanceReview` — **PASS WITH NOTES**, 새 구현의 CRITICAL/HIGH/MEDIUM 결함 없음.
- Verifier: `MaintenanceVerify` — **유지보수 산출물 AC1–AC6 PASS**. AC4는 검증 메커니즘 완료이며, 기존 SQL의 보안 경계 2개 미충족을 노출한 상태다.
- **전체 lint·DB suite·보안 PASS를 주장하지 않는다.**

## 적용 범위와 불변식

- 수정: 설치·제품 문서, PR 전용 검증 워크플로, 개발 전용 PGlite/Node 회귀 테스트, 테스트 파일에만 적용하는 ESLint 설정과 하네스 추적 산출물.
- 미수정: src/, 기존 supabase/migrations/, 기존 deploy.yml, Vite/Vercel/MCP 설정. 보호 대상 **47개 파일 SHA256이 작업 전후 동일**하다. 독립 verifier도 보호 경로 diff 0을 확인했다.
- 운영 DB·사이트·서비스에 접속하지 않았고 Git 설정·브랜치 보호·worktree를 바꾸지 않았다. 커밋·push·병합도 하지 않았다.
- 신규 설치에 필요한 검토된 기준 스키마/export와 적용 이력은 여전히 누락되어 있다. 테스트 fixture를 운영 DDL로 제시하지 않았다.

## 실행 결과

| 검증 | 실제 결과 |
|------|-----------|
| `npm run build` | PASS — tsc 및 Vite 빌드, 2716 modules |
| 새 테스트/설정 대상 ESLint | PASS — `npx --no-install eslint tests/db/fixture.mjs tests/db/permissions.test.mjs eslint.config.js` |
| `npm run lint` | FAIL — 기존 미수정 파일의 25 errors / 4 warnings |
| `npm run test:db` | **20 tests / 18 pass / 2 fail / 0 skipped** |
| README 카탈로그 SQL | 임시 메모리 PostgreSQL에서 SELECT 6개 실행 성공 |
| 잠금 smoke·민감도 | 실제 INSERT·UPDATE 트리거의 차단 확인; 임시 DB에서 각 트리거 제거 시 같은 차단 assertion 실패 확인 |
| PR YAML·권한 | 구문 확인, main 대상 PR 전용, 읽기 전용 토큰, 독립 lint/build/database, 운영 시크릿·배포 없음 |
| 수정 문서 상대 링크 | 25개 대상 존재 확인 |
| 브랜치 목적지 | push dry-run은 origin/marahmik/main을 표시; origin/main 병합·배포는 별도 |

임시 smoke 파일은 실행 후 삭제했고, 각 시나리오를 rollback한 뒤 메모리 DB를 닫았다. GitHub runner·운영 UI·Auth/PostgREST/Realtime·호스팅·완전한 신규 설치는 검증하지 않았다.

## 기존 SQL 결함 — 미수정, 실패 테스트로 유지

1. 직원의 자기 프로필 `role` 변경이 차단되지 않는다. fixture에서 관리자 승격 후 매장 생성까지 성공했다. `profiles_update_own`과 관리자 판정 함수에 관련된다.
2. 잠긴 달의 본인 요청을 잠기지 않은 달로 이동할 수 있다. trigger는 NEW.date를 검사하지만 OLD.date의 잠금을 검사하지 않는다.

두 현상은 저장소 SQL+명시된 fixture 권한에서 관찰했다. 운영 DB의 실제 컬럼 권한·정책·스키마는 확인하지 않았으므로 운영 취약점 확인으로 확대하지 않는다. 테스트를 skip하거나 불안전 동작이 기대값이 되도록 고정하지 않았으며, SQL 수정은 별도 사용자 승인 범위다.

추가로 다른 매장 매니저 본인 요청 INSERT가 기존 정책 조합에서 허용됨을 smoke로 관찰했다. 이를 다른 직원 스케줄 UPDATE 권한과 동일하게 설명하지 않는다.

## Review Notes

- asUser의 operation 실패 시 로컬 역할 복구는 scenario의 transaction rollback에 의존한다. 현재 호출 구조에서는 안전하며, 실패를 내부에서 임의 흡수하는 사용은 하지 않는다.
- denied의 성공 경로에서 차단 assertion이 실패하면 바깥 scenario rollback이 저장 효과를 제거한다.
- reviewer의 추가 heterogeneous agent 호출은 차단되어 기존 PlanAttack(adversary)·TestAttack(security-reviewer) 독립 분석과 자신의 코드 검토를 결합했다. 새 구현의 차단 결함은 발견되지 않았다.

## Verdict

**운영 무변경 유지보수 산출물 검증 완료, 기존 lint·SQL 결함은 명시적으로 미해결.** 현재 PR 검증의 lint/database job은 실패를 그대로 표시한다. 병합·배포·운영 정책 수정 승인은 포함되지 않는다.

## 후속 게시 승인과 커밋

위 본문은 게시 전 검증 시점의 기록이다. 이후 사용자가 비운영 정비의 작업 브랜치 커밋·push와 알려진 실패에 대한 backpressure 게이트 1회 예외를 명시적으로 승인했다.

- 정비 커밋: `6059580` — 19개 파일, 운영 코드·기존 SQL·배포 설정 변경 없음.
- AC 추적과 정확한 staged patch의 GPT·Gemini 교차 리뷰는 정상 수행했다. Claude 모델 호출 실패는 완료된 리뷰로 계산하지 않았다.
- 검증 예외는 한 번 소비되었고, 별도의 문서 전용 마감 커밋으로 추적을 닫는다.
- 원격 대상은 `origin/marahmik/main`뿐이며 main 병합·배포는 승인/수행 범위가 아니다. 실제 push 결과는 Git 명령 출력과 최종 사용자 보고로 확인한다.
