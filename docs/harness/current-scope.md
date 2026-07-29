# Current Scope: 20260729-234210-069d (P2 thread)

**Created**: 2026-07-29
**Seed**: docs/harness/seed.yaml (task_id 20260729-234210-069d, v2)
**Thread-ID**: T-20260729153313-abb0
**Thread**: iteration on 20260729-234210-069d

## Acceptance Criteria
- [x] AC1: 퇴사자 목록의 각 카드에만 근무기록 버튼이 보인다.
- [x] AC2: 버튼은 선택한 store_members.id를 가진 전체 관리자 전용 페이지로 이동한다.
- [x] AC3: 상세 페이지는 해당 멤버십이 role='resigned'인지 확인하고, 선택 월 스케줄에 그 행의 user_id와 store_id를 모두 적용한다.
- [x] AC4: 상세 페이지 일정표는 항상 조회 전용이다.
- [x] AC5: 기록이 없는 달은 빈 일정표와 0일 합계를 표시한다.
- [x] AC6: 존재하지 않거나 퇴사자가 아닌 멤버십은 스케줄을 표시하지 않고 명확한 오류 상태를 표시한다.
- [x] AC7: 상세 라우트는 profiles.role='admin'이 아니면 자식을 마운트하지 않고 /my로 이동시킨다.
