# Plan Attack Report: 퇴사자 근무기록 관리자 조회

- Task ID: `20260729-234210-069d`
- Run 1: WARN — 권한/RLS 경계, 퇴사자 스키마 전제, 멤버십 검증, 라우트 식별자, 합계 기준 보완 요청
- Run 2: BLOCK — 기존 `requireAdmin`이 매장 관리자도 허용하는 코드와 전체 관리자 전용 요구의 충돌 발견
- Run 3: WARN / implementation-ready — CRITICAL 없음

## Resolved Findings
- 원격 Supabase 스키마 조회로 `store_members.role='resigned'` 및 nullable `resignation_date` 존재 확인
- 라우트 식별자를 `store_members.id`로 고정하고 `role='resigned'` 검증 추가
- 확인된 멤버십의 `user_id`와 `store_id`를 월 범위와 함께 스케줄 쿼리에 적용
- 기존 매장 관리자 허용 `requireAdmin`과 별도로 `profiles.role='admin'`만 허용하는 상세 라우트 보호 조건 명시
- 월 합계는 표시된 스케줄 중 `work_type`이 있는 기록 수로 고정

## Remaining Warning
- 구현에서 기존 `isAdmin()`만 재사용하면 매장 관리자가 통과한다. 상세 페이지 자식을 마운트하기 전에 `profile.role === 'admin'`을 검사하는 별도 보호 조건이 필요하다.

## Verdict
WARN — 구현 진행 가능, 위 권한 조건 필수.
