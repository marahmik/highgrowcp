# Kickoff Summary: 운영 무변경 유지보수

**Date**: 2026-10-19
**Type**: Maintenance

## JTBD
- User: 현재 사이트 운영자와 유지보수 개발자.
- Problem: 설치 안내·프로젝트 설명이 현재 저장소와 어긋나며 배포 전 핵심 규칙 검증이 없다. worktree 브랜치와 main의 관계도 혼동된다.
- Success: 운영 코드·DB·배포 방식은 유지하면서 정확한 안내와 격리된 PR 검증을 제공한다.

## Context
- 단일 React/TypeScript/Vite 앱, Supabase DB·Auth와 RLS 사용.
- 기존 명령: `npm run build`, `npm run lint`, `npm run dev`.
- 기존 배포: `.github/workflows/deploy.yml`의 main push → GitHub Pages, 변경하지 않는다.
- 기존 마이그레이션: 001–008. 파일에 정의되지 않은 stores.memo·locked 등 수동 스키마 의존이 있어 완전한 신규 설치라고 주장할 수 없다.
- 기존 완료 작업의 전체 lint 실패 기록이 있다. 앱을 고치지 않고 현재 결과를 분리해 보고한다.

## Scope / Acceptance
- MUST: seed.yaml의 AC1–AC6 전부 이행.
- MUST NOT: 앱·기존 SQL·배포 설정·운영 DB·Git 설정 변경, 커밋·push·병합.
- OUT: 운영 스키마 복구, 기능 변경, lint 부채 수정, 브랜치 보호 필수화.
- 사용자 승인: 직전 운영 무변경 제안 뒤의 '변경 진행해보자'. 새로운 운영 동작 결정은 없다.

## Backpressure
- 새 검증 코드만 개발 전용 PGlite와 Node 기본 테스트 러너로 추가한다.
- PGlite API는 Context7 `/electric-sql/pglite`와 공식 API 문서로 확인했다.
- 실제 기존 SQL 회귀 테스트, 테스트 민감도 smoke, 기존 build/lint, 워크플로·링크 검증과 보호 대상 해시 비교.
- reviewer·verifier 독립 검증 후 결과 보고. 실제 운영 UI나 GitHub runner 실행으로 과장하지 않는다.

## Branch Evidence
`git push --dry-run --porcelain`은 refs/heads/marahmik/main → refs/heads/marahmik/main (origin)의 새 브랜치 push를 표시했다. origin/main은 별도 병합 대상이다. dry-run은 실제 브랜치를 push하지 않았다.
