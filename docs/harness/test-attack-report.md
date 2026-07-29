# Test Attack Report: 퇴사자 근무기록 관리자 조회

- Task ID: `20260729-234210-069d`
- Run 1: BLOCK — 전체 관리자/매장 관리자 분리, 비퇴사자 직접 URL, 수동 fixture, 월 경계, 월 이동 경쟁 상태 누락
- Run 2: PASS — CRITICAL 없음

## Added Coverage
- `profiles.role='admin'` 전체 관리자와 매장 관리자 계정을 구분한 직접 URL 접근 검증
- 활성·승인 대기·밴 등 비퇴사 멤버십 직접 URL 차단 및 데이터 미노출
- 동일 사용자·다른 매장, 같은 매장·다른 사용자 비교 fixture
- 월초·월말 포함 및 인접 월 제외 검증
- 네트워크 지연 또는 빠른 월 이동에서 stale response 방지 검증

## Remaining Note
- 월 이동 요청 순서 역전 위험을 구현에서 취소 플래그 또는 동등한 방식으로 방어한다.

## Verdict
PASS
