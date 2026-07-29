# Kickoff Summary: 퇴사자 근무기록 관리자 조회

**Date**: 2026-07-29
**Type**: Feature

### JTBD
- User: 전체 관리자
- Problem: 퇴사자의 과거 근무기록을 관리자 페이지에서 직접 확인할 경로가 없다.
- Success: 전체 관리자가 퇴사자 목록에서 대상자를 선택해 해당 매장의 과거 근무기록을 월별·조회 전용으로 확인한다.

### Context
- Repo type: 단일 Vite React 애플리케이션
- Tech stack: React 19, TypeScript 5.9, React Router 7, Supabase, Tailwind CSS
- Build/Test: `npm run build`; 자동 테스트 스크립트 없음
- Lint: `npm run lint`
- Existing patterns: `HistoryPage`의 월 선택 및 조회 전용 `MobileScheduleGrid`; `/admin/*`의 관리자 보호; `MembersTab`의 퇴사자 목록
- Risks/constraints: 기존 `requireAdmin`은 매장 관리자도 허용하므로 상세 라우트에는 `profiles.role='admin'` 전용 조건이 필요함; 퇴사 멤버십에서 사용자·매장을 해석해 다른 매장 기록 혼합을 방지해야 함; DB/RLS 변경 없음

### Scope
- MUST: 퇴사자 카드에 근무기록 조회 버튼 추가
- MUST: 전체 관리자 전용 상세 페이지에서 선택한 퇴사자·매장의 월별 기록 조회
- MUST: 기존 조회 전용 일정표 패턴 재사용
- SHOULD: 이름, 매장, 퇴사일, 월 근무일 합계 표시
- MUST NOT: 근무기록 수정 기능 또는 데이터베이스 변경 추가
- OUT OF SCOPE: 여러 매장 기록 통합, 매장 관리자 접근, 퇴사 처리 방식 변경

### Acceptance Criteria
1. 퇴사자 목록의 각 카드에만 `근무기록` 버튼이 보인다.
2. 버튼을 누르면 선택한 `store_members.id`를 가진 `/admin/resigned/:memberId/history` 페이지로 이동한다.
3. 상세 페이지는 해당 멤버십이 `role='resigned'`인지 확인하고, 선택 월 스케줄에 그 행의 사용자 ID와 매장 ID를 모두 적용한다.
4. 상세 페이지의 일정표는 항상 조회 전용이며 저장·수정 동작을 제공하지 않는다.
5. 기록이 없는 달은 오류 없이 빈 일정표와 0일 합계를 표시한다.
6. 존재하지 않거나 퇴사자가 아닌 멤버십은 스케줄 없이 오류 상태를 표시한다.
7. 전체 관리자가 아닌 사용자는 직접 URL로도 상세 UI에 접근할 수 없다.

### Edge Cases
- 선택 월에 스케줄이 없음
- 잘못되었거나 퇴사자가 아닌 멤버십
- 동일 사용자가 여러 매장에서 근무한 이력 보유

### Backpressure
- Method: TDD 예외 승인에 따른 빌드·린트·브라우저 수동 E2E
- How to run: `npm run build`, `npm run lint`, 개발 서버에서 관리자 로그인 후 직원관리 → 퇴사자 목록 → 근무기록 버튼 → 월 이동 및 조회 전용 상태 확인

---
Kickoff complete. Ready for implementation.
