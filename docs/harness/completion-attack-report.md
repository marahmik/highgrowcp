# Completion Attack Report: 퇴사자 근무기록 관리자 조회

- Task ID: `20260729-234210-069d`
- Reviewer verdict: APPROVE
- Verifier verdict: PASS (AC1–AC7)

## Findings and Resolutions
1. 느린 프로필 조회에서 전체 관리자가 `/my`로 잘못 이동할 수 있음
   - `profileResolved` 상태를 추가해 프로필 판정 완료 전에는 상세 자식을 마운트하지 않음.
2. 로그아웃 후 다른 사용자 로그인 중 이전 관리자 프로필이 게시될 수 있음
   - `profileRequestId` 세대 토큰과 현재 `session.user.id` 일치 검사를 추가함.
   - 새 요청과 로그아웃에서 이전 profile/manager 상태를 비우거나 요청 세대를 무효화함.
   - 상세 가드는 `profile.id === session.user.id && profile.role === 'admin'`을 모두 요구함.

## Verified Acceptance
- 퇴사자 카드에만 버튼 표시 및 `store_members.id` 경로 이동
- `role='resigned'` 멤버십 검증 후 사용자·매장·월 범위 쿼리
- 조회 전용 셀, 기록 있는 달 합계, 빈 달 `0일`
- 존재하지 않는 ID와 비퇴사 멤버십의 오류 상태 및 스케줄 미요청
- 매장 관리자, 느린 프로필, 교차 세션 stale admin에서 상세 자식 미마운트
- 390px 모바일 카드 레이아웃 무가로 스크롤

## Quality Gates
- `npm run build`: PASS
- 변경 코드 6개 파일 표준 ESLint: PASS
- 전체 `npm run lint`: FAIL — 변경되지 않은 기존 파일에서 25 errors / 4 warnings. 전체 lint PASS로 간주하지 않음.
- 자동 테스트: 저장소에 테스트 인프라가 없어 사용자 승인 예외; 브라우저 수동 E2E로 대체.

## Verdict
PASS — scoped AC1–AC7 완료. 기존 전체 lint 부채는 본 기능 범위 밖의 잔여 위험으로 명시한다.
