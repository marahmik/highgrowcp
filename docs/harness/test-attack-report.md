# Test Attack Report: 운영 무변경 유지보수

- Task ID: `20261019-120000-a491`
- Reviewer: `TestAttack` (`security-reviewer`), read-only
- Initial verdict: 검증 메커니즘 PASS; 무조건적인 AC4/보안 PASS 주장에는 BLOCK.
- CRITICAL: 0. HIGH: 2. MEDIUM: 1.

## 발견과 대응
1. HIGH — 본인 profiles.role UPDATE를 통한 관리자 승격 경계 누락 (`001_initial_schema.sql:88–91`, `002_admin_rls.sql:7–15`). 기대하는 승격 차단을 영구 회귀 테스트로 추가했다. 실제 SQL이 허용하므로 테스트는 실패하며, 임시 메모리 smoke에서 승격 후 매장 생성까지 재현했다. 운영 취약점으로 단정하지 않고 fixture 권한·SQL 범위를 명시했다.
2. HIGH — 잠긴 달에서 잠기지 않은 달로 요청 날짜 이동 경계 누락 (`005_security_patch.sql:79–88,116–118`). 기대하는 이동 차단을 영구 회귀 테스트로 추가했다. 실제 SQL이 허용하므로 실패하며, 임시 메모리 smoke로 이동 후 저장 상태를 확인했다.
3. MEDIUM — 잠금이 켜져 있을 때 인접 월·승인된 다른 매장의 정상 쓰기 대조군 부족. 두 성공/경계 테스트를 추가했고 통과했다. 다른 매장 매니저 본인 요청 INSERT가 허용되는 기존 정책 조합은 별도 smoke로 관찰하고 UPDATE와 구분해 README에 명시했다.

## 추가 확인
- 실제 마이그레이션을 변경 없이 적용하고 테스트 전용 auth/두 stores 컬럼 전제를 공개했다.
- authenticated 역할은 NOSUPERUSER NOBYPASSRLS이며 시나리오별 rollback과 순차 실행을 사용한다.
- 동일 날짜 INSERT·UPDATE 잠금 차단이 정상 작동함을 확인하고, 임시 메모리 DB에서 각 트리거를 제거하면 동일 차단 assertion이 실패하는 민감도를 증명했다.
- asUser의 성공 시 역할 복구, 실패 시 바깥 rollback 복구는 현재 호출 구조에 적합하다. 향후 시나리오 내부에서 실패를 임의 흡수하지 않아야 한다.

## 현재 결과와 판정
`npm run test:db`: 20 tests / 18 pass / 2 fail / 0 skipped. 실패를 skip하거나 허용 동작으로 고정하지 않았다. 테스트 메커니즘·범위 보강은 완료했지만 기존 SQL의 두 보안 경계는 미충족이다. **보안 PASS 또는 전체 DB 검증 PASS로 보고하지 않는다.** 운영 SQL 수정은 사용자가 승인한 운영 무변경 범위 밖이다.
