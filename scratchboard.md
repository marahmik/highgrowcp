# 📋 HighGrow Schedule 시스템 스크래치보드
> 마지막 갱신: 2026-04-17 (Phase 7 보안 패치 검토 완료)

---

## 🏗️ 기술 스택

| 카테고리 | 기술 |
|---|---|
| 프레임워크 | React 19 + TypeScript (Vite 8) |
| 스타일링 | Tailwind CSS 4 + shadcn/ui |
| 상태 관리 | Zustand 5 |
| 백엔드/DB | Supabase (Auth · PostgreSQL · Realtime) |
| 라우팅 | React Router DOM 7 |
| 배포 | Vercel (SPA rewrite 설정 포함) |
| 기타 | date-fns, lucide-react, sonner(토스트), next-themes(테마), react-hook-form, zod |

---

## 📝 프로젝트 구성 및 상태

### 1. 메인 페이지 (`MainPage.tsx` — `/`)
- 서비스 소개 및 로그인/회원가입 (이메일 + Google OAuth).
- 로그인 시 관리자는 `/admin`, 일반 사용자는 `/my`로 자동 리다이렉트.
- 세션 존재 시 프로필 로딩 처리 중 화면 표시 (race condition 방지).

### 2. 마이 페이지 (`MyPage.tsx` — `/my`)
- 일반 직원이 로그인 후 마주하는 화면.
- **내 매장**: 소속 매장 목록 확인 및 캘린더 바로가기. 퇴사 처리된 매장은 표시되지 않음.
- **승인 대기**: 가입 요청 중인 매장 현황.
- **매장 가입하기**: 미가입 매장에 가입 신청 가능.

### 3. 매장 페이지 (`StorePage.tsx` — `/store/:storeId`)
- **데스크톱**: 1~말일 가로 그리드 (직급별 색상 행, 연차 카운터 포함).
- **모바일**: 주 단위 7열 달력 뷰. 매니저는 멤버 전환 탭으로 타인 스케줄 편집 가능.
- **근무 유형**: 오픈 / 미들 / 마감 / 종일 + 연차·요청 티커.
- **수퍼바이저 매장**: 근무 유형이 파견지(송인/인천/중동/남양)로 자동 대체.
- **단기알바(Ghost)**: 매장당 2슬롯 제공 (수퍼바이저 매장 제외). `ghost_schedules` 테이블 별도 관리.
- **매장 메모**: 월별 JSON 구조(`yyyy-MM` 키). 매니저만 편집, onBlur 자동 저장.
- **잠금 시스템**: 매장 개별 잠금(`stores.locked`) + 전체 월별 잠금(`monthly_locks`). 매니저는 잠금 상태에서도 편집 가능.
- **배치 저장**: 변경사항을 `pendingChanges`에 모아 → 하단 플로팅 바로 일괄 커밋(upsert/delete).
- **실시간 구독**: Supabase Realtime으로 `schedules`, `ghost_schedules`, `stores` 변경 실시간 반영.
- **접근 제한**: 퇴사자는 매장 캘린더 접근 시 차단 메시지 → 근무기록 페이지로 안내.

### 4. 관리자 페이지 (`AdminPage.tsx` — `/admin/*`)
- **통합 캘린더** (`AllSchedulesTab.tsx`): 모든 매장 스케줄 한 눈에 조회 및 편집. 전체 월 잠금 토글. 매장별 메모 표시.
- **직원 관리** (`MembersTab.tsx`):
  - 승인 대기 / 활성 멤버 / 퇴사자 / 밴 목록 분류.
  - 직급 변경 (매니저·시니어·주니어·파트타이머·퇴사자).
  - 전체관리자 권한 부여/해제 (`profiles.role`).
  - 이름 변경, 매장 이동(leave store), 완전 삭제(DB+Auth).
  - **퇴사자 관리**: 퇴사일 지정 → 해당 일자 이후 스케줄 자동 삭제, 복직 처리 가능.
- **매장 관리** (`StoresTab.tsx`): 매장 CRUD (추가/이름 수정/삭제).

### 5. 근무 기록 (`HistoryPage.tsx` — `/history`)
- 개인별 과거 근무 기록 조회 전용 (7열 모바일 달력). 수정 불가.
- 월별 총 근무일수 + 잔여 연차 서머리 표시.
- 퇴사자도 본인 기록 확인 가능.

### 6. 공통 레이아웃 (`Layout.tsx`)
- 상단 네비게이션: 로고, 사용자 이름·관리자 뱃지, 관리/내근무/기록 버튼, 로그아웃.
- 퇴사자는 "내근무" 버튼 비노출 (`hasActiveStore` 체크).
- 하단 푸터: "HDH Hugo Kim & Jason Kim".

---

## 🔐 권한 시스템

| 권한 | 결정 기준 | 설명 |
|---|---|---|
| **전체 관리자** | `profiles.role === 'admin'` | 모든 매장·직원 관리 가능 |
| **매장 매니저** | `store_members.role === 'admin'` (매장별) | 해당 매장 내 모든 스케줄 편집, 잠금 제어, 메모 편집 |
| **일반 직원** | 그 외 | 본인 스케줄에 '요청' 티커만 설정 가능 |
| **퇴사자** | `store_members.role === 'resigned'` | 매장 캘린더 접근 차단, 근무기록만 열람 |

- `isAdmin()` = `profiles.role === 'admin'` OR `isStoreManager` (Zustand 글로벌 상태).
- 매장 페이지 내 `isManager` = `isAdmin()` OR 현재 매장에서 `role === 'admin'`.

---

## 🗄️ 데이터베이스 스키마

### 테이블

| 테이블 | 주요 컬럼 | 비고 |
|---|---|---|
| `profiles` | id, display_name, phone, role(`admin`/`user`), created_at, updated_at | Auth 연동 |
| `stores` | id, name, owner_id, locked, memo(JSON string), created_at | |
| `store_members` | id, store_id, user_id, status, role, annual_leave, resignation_date, created_at | 매장-유저 중간 테이블 |
| `schedules` | id, store_id, user_id, date, work_type, leave_type, status, note | Unique: (store_id, user_id, date) |
| `ghost_schedules` | id, store_id, slot, date, work_type, leave_type | Unique: (store_id, slot, date) |
| `monthly_locks` | month(`yyyy-MM`), is_locked, created_at, updated_at | 전체 월 잠금 |

### 주요 타입

```ts
WorkType     = 'open' | 'middle' | 'close' | 'allday'
LeaveType    = 'annual' | 'half' | 'substitute' | 'sick' | 'request'
UserRole     = 'admin' | 'user'
MemberRole   = 'admin' | 'senior' | 'junior' | 'parttimer' | 'resigned'
MemberStatus = 'pending' | 'approved' | 'rejected' | 'banned'
```

---

## 📁 프로젝트 구조

```
src/
├── App.tsx                          # 라우터 설정
├── main.tsx                         # 엔트리 포인트
├── index.css                        # 전역 스타일 (Tailwind)
├── lib/
│   ├── supabase.ts                  # Supabase 클라이언트
│   └── utils.ts                     # cn() 유틸리티
├── types/
│   └── database.ts                  # DB 타입 정의
├── stores/
│   └── authStore.ts                 # Zustand 인증 상태
├── providers/
│   └── AuthProvider.tsx             # Auth 초기화 + 프로필 페치
├── components/
│   ├── auth/
│   │   └── ProtectedRoute.tsx       # 인증/관리자 가드
│   ├── layout/
│   │   └── Layout.tsx               # 헤더·메인·푸터 레이아웃
│   ├── schedule/
│   │   ├── ScheduleGrid.tsx         # 데스크톱 가로 그리드
│   │   ├── MobileScheduleGrid.tsx   # 모바일 7열 달력
│   │   ├── ScheduleCell.tsx         # 개별 셀 컴포넌트
│   │   ├── EditDropdown.tsx         # 근무 유형 선택 드롭다운
│   │   ├── EditModal.tsx            # 편집 모달
│   │   └── MonthPickerDropdown.tsx  # 월 선택 드롭다운
│   └── ui/                          # shadcn/ui 컴포넌트들
└── pages/
    ├── MainPage.tsx                 # 로그인/회원가입
    ├── MyPage.tsx                   # 매장 목록·가입
    ├── StorePage.tsx                # 매장 캘린더
    ├── HistoryPage.tsx              # 근무기록 조회
    └── admin/
        ├── AdminPage.tsx            # 관리자 탭 컨테이너
        ├── AllSchedulesTab.tsx      # 통합 캘린더
        ├── MembersTab.tsx           # 직원 관리
        └── StoresTab.tsx            # 매장 관리
```

---

## ✅ 완료된 작업 내역

#### Phase 1~3 — 인증·기능 통합 & 모바일 최적화
- ✅ **매니저/직원 권한 분리**: 일반 직급은 본인 스케줄에 '요청'만 가능.
- ✅ **연차 관리**: 매니저가 각 직원의 연차 개수를 직접 수정 가능.
- ✅ **모바일 전용 7열 달력**: 주 단위 끊기 레이아웃 및 근무 유형별 색상 적용.
- ✅ **강력한 권한 시스템**: 전체 관리자/매니저의 타인 스케줄 수정 권한 강화.
- ✅ **미소속 인원 관리**: 어느 매장에도 소속되지 개원 관리 기능.
- ✅ **근무기록 탭**: 개인별 조회 전용 7열 달력 구현 (퇴사자 접근 허용).
- ✅ **캘린더 노출 제외**: 모든 매장 캘린더 멤버 목록에서 퇴사자 자동 제외.

#### Phase 4 — 월별 메모 & 퇴사자 관리
- ✅ **월별 메모 시스템**: `stores.memo`를 `yyyy-MM` 키 JSON 구조로 리팩토링. 월별 독립 저장·조회.
- ✅ **퇴사자 관리 강화**: 퇴사일 지정 시 해당 일자 이후 스케줄 자동 삭제. 복직 처리 기능.

#### Phase 5 — 매니저 권한 강화 및 모바일 최적화 🛠️
- ✅ **매니저 권한 반응성 개선**: 매니저 직급(admin role) 사용자의 캘린더 수정 권한이 즉시 반영되도록 상태 관리 강화.
- ✅ **모바일 단기알바 표시**: 모바일에서 단기알바(Ghost) 스케줄이 정상적으로 표시 및 수정되도록 보완.
- ✅ **PC/모바일 등급별 기능 일치**: 모바일에서도 매니저는 모든 멤버의 스케줄을 자유롭게 전환하며 편집 가능.

#### Phase 6 — 통합 캘린더 접근 및 모바일 UI 개선
- ✅ **통합 캘린더 접근 최적화**: 매장 페이지 하단에 수퍼바이저 통합 캘린더 인라인 삽입.
- ✅ **모바일 캘린더 UI 정제**: 직관적 인터렉션을 위한 세부 UI 개선.
- ✅ **Auth 로딩 버그 수정**: 로그인 시 화면이 멈추는 race condition 문제 해결 (safety timeout 8s 추가).
- ✅ **관리자 대시보 매장별 캘린더 복원**: 관리자 통합 캘린더에서 매장별 독립 그리드 표시.

#### Phase 7 — RLS 보안 강화 및 각종 오류 수정 (2026-04-17)
- ✅ **매니저 타 매장 조회 허용**: `is_any_store_manager()` 함수 추가, 매니저에게 모든 매장의 `store_members`·`schedules` SELECT 권한 부여.
- ✅ **수퍼바이저 매장 전체 공개**: 매장명에 '수퍼바이저'가 포함된 매장의 멤버·스케줄을 모든 인증 사용자에게 공개.
- ✅ **수정 권한 매장 한정**: 매니저는 본인 소속 매장만 수정 가능. 전체관리자만 모든 매장 수정 가능. (`is_store_admin` 기반)
- ✅ **`delete_user` RPC 보안**: 전체관리자만 호출 가능하도록 `is_super_admin()` 검증 추가.
- ✅ **`store_members` RLS 보강**: UPDATE는 `is_store_admin` 기반, DELETE는 본인 + `is_store_admin` 기반으로 변경.
- ✅ **매장 메모 및 잠금 저장 오류 수정**: 매장 매니저가 `stores` 테이블의 `memo` 및 `locked` 상태를 업데이트할 수 있도록 RLS 정책 수정 완료 (`006_store_manager_update.sql`).
- ✅ **스케줄 비즈니스 로직 DB 트리거**: 비매니저의 잠금 상태 저장 차단 + 비매니저의 '요청' 외 근무유형 차단을 DB 레벨에서 강제.
- ✅ **메모 길이 제한**: 프론트엔드 `maxLength={2000}` + DB `CHECK(length(memo) <= 10000)`.

---

## 🔧 다음 작업 / 검토 필요 사항

#### 🟡 단기 과제
- 🟢 **반응형 세부 조정** — 태블릿(iPad 등) 환경 레이아웃 최적화.

#### 🟡 장기 과제
- 🟢 **푸시 알림** — 스케줄 확정 알림 시스템 연동.
- 🟢 **통계 대시보드** — 월별 총 근무 시간 및 연차 현황 시각화.

---

## 📝 작업 지시 메모

> 아래에 다음으로 진행할 작업을 자유롭게 작성하세요. AI에게 이 파일을 참조시키면 바로 작업이 시작됩니다.

1. (현재 모든 요청 사항이 반영되었습니다. 다음 작업을 여기에 적어주세요.)