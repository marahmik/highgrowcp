# Current Scope: 20261019-120000-a491 (P2 thread)

**Created**: 2026-10-18
**Seed**: docs/harness/seed.yaml (task_id 20261019-120000-a491, v4)
**Thread-ID**: T-20261018195419-6223
**Thread**: Publish approved non-operational maintenance

## Acceptance Criteria
- [x] AC1: README에 001–008 마이그레이션 순서, 저장소에 누락된 선행 스키마, 신규 설치와 기존 운영 DB의 안전한 확인 절차를 명시한다.
- [x] AC2: INDEX와 프로젝트 설명 문서의 다른 제품·템플릿 잔재를 실제 근무 스케줄 앱에 맞게 수정한다.
- [x] AC3: PR 검증에서 기존 lint·build와 신규 test:db를 실행하되 배포 권한·운영 시크릿·운영 DB 연결을 사용하지 않는다. 기존 배포 워크플로는 유지한다.
- [x] AC4: 실제 SQL의 회귀 검증 메커니즘을 구현·실행했다. 18 pass / 2 기존 SQL 경계 fail을 그대로 노출하며 전체 DB·보안 PASS를 주장하지 않는다.
- [x] AC5: 보호 대상 47개 해시 불변을 확인했고 기존 lint 실패와 신규 검증 결과를 구분했다.
- [x] AC6: dry-run으로 origin/marahmik/main push와 별도 origin/main 병합·배포를 구분했다.

## Publication

- 사용자 승인: 운영 무변경 정비 커밋·push, 알려진 검증 실패에 대한 backpressure 게이트 1회 예외.
- AC 및 현재 staged-diff 리뷰 게이트는 정상 수행한다.
- 정비 커밋까지 active 추적을 유지하고, 이어지는 문서 전용 closeout 커밋에서 seed를 done으로 마감한다. 운영 파일은 두 커밋 모두 변경하지 않는다.
