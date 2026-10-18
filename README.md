# 쌀체듈러 (SSalcheduler)

매장 직원 근무 스케줄을 월별로 관리하는 웹 애플리케이션입니다.

관리자가 매장을 만들고, 직원들이 자신의 근무/휴일 스케줄을 등록하면 관리자가 최종 승인하는 구조입니다.

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| **로그인/가입** | 이메일+비밀번호 또는 Google 계정으로 로그인 |
| **매장 관리** | 관리자가 매장을 생성/수정/삭제 |
| **멤버십** | 직원이 매장에 가입 요청 → 관리자 승인 |
| **월별 스케줄** | 달력 형태의 그리드에서 근무/휴일을 등록 |
| **근무 타입** | 오픈, 미들, 마감, 종일 (색상으로 구분) |
| **휴일 타입** | 연차, 반차, 대체휴, 병가, 요청 (색상으로 구분) |
| **승인 시스템** | 직원이 제출 → 관리자가 승인/반려 |
| **권한 구분** | 관리자 페이지와 일반 사용자 페이지 분리 |

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | React, TypeScript, Vite |
| 스타일 | Tailwind CSS v4, shadcn/ui |
| 상태관리 | zustand |
| 날짜 | date-fns (한국어 로케일) |
| 백엔드 | Supabase (데이터베이스, 인증, RLS) |
| 배포 | GitHub Pages + GitHub Actions |

---

## 시작하기 (신규 설치 전제 확인)

아래는 설정 참고 절차입니다. **현재 저장소에는 새 DB에서 사이트 전체를 재현할 수 있다고 검증된 완전한 스키마가 없습니다.** 신규 설치는 3단계의 누락 스키마와 검토된 기준 스키마 확보 조건을 먼저 확인해야 합니다. 이미 운영 중인 사이트는 이 문서가 바뀌었다는 이유로 SQL을 실행하거나 설정을 변경하지 마세요.

### 1단계: 프로젝트 가져오기

#### 방법 A: Fork (추천)

1. 이 저장소 페이지 오른쪽 위의 **Fork** 버튼을 클릭합니다.
2. 자신의 GitHub 계정에 저장소가 복제됩니다.
3. 내 컴퓨터에 클론합니다:

```bash
git clone https://github.com/내아이디/ssalcheduler.git
cd ssalcheduler
```

#### 방법 B: 직접 클론

```bash
git clone https://github.com/rae-hugo-kim/ssalcheduler.git
cd ssalcheduler
```

> **참고**: 직접 클론한 경우 push하려면 자신의 저장소로 remote를 변경해야 합니다.

---

### 2단계: Supabase 프로젝트 생성

Supabase는 데이터베이스와 로그인 기능을 제공하는 무료 서비스입니다.

#### 2-1. 계정 만들기

1. [https://supabase.com](https://supabase.com) 에 접속합니다.
2. **Start your project** 를 클릭합니다.
3. GitHub 계정으로 로그인합니다. (GitHub 계정이 없다면 먼저 만드세요.)

#### 2-2. 새 프로젝트 만들기

1. 로그인 후 **New Project** 를 클릭합니다.
2. 아래 항목을 입력합니다:
   - **Organization**: 기본 조직 선택 (처음이면 하나만 있습니다)
   - **Project name**: 원하는 이름 (예: `ssalcheduler`)
   - **Database Password**: 강력한 비밀번호를 입력하고 **반드시 따로 저장해두세요**
   - **Region**: `Northeast Asia (Seoul)` 선택 (한국에서 사용하므로)
3. **Create new project** 를 클릭합니다.
4. 프로젝트 생성에 1~2분 정도 걸립니다. 기다려주세요.

#### 2-3. API 키 확인하기

프로젝트가 생성되면 키를 확인합니다:

1. 왼쪽 메뉴에서 **Project Settings** (톱니바퀴 아이콘) 을 클릭합니다.
2. **API** 탭을 클릭합니다.
3. 아래 두 가지를 복사해서 메모장에 저장해 두세요:
   - **Project URL** — `https://xxxxxxxx.supabase.co` 형태
   - **Publishable key** — `sb_publishable_...` 형태의 공개 클라이언트 키

> **주의**: `secret` 및 `service_role` 키는 RLS를 우회하므로 브라우저나 저장소에 절대 노출하지 마세요. 클라이언트에는 publishable 키만 사용합니다.

---

### 3단계: DB 기준 스키마와 적용 이력 확인

#### 신규 설치와 운영 DB를 구분하세요

- **신규 설치**: `001_initial_schema.sql`만 실행하거나 테이블 몇 개가 보인다는 이유로 설치 완료로 판단하면 안 됩니다. `001`에는 `ghost_schedules`까지 5개 테이블이 있고, 이후 `monthly_locks`, `store_memos`가 추가됩니다. 그러나 **001–008 순서 실행만으로 완전한 신규 사이트 스키마가 구성된다고 검증되지 않았으며**, 아래 선행 스키마가 저장소에서 빠져 있습니다.
- **기존 운영 DB**: 문서 정정은 마이그레이션 실행 지시가 아닙니다. 001–008을 일괄 재실행하지 마세요. 기존 테이블 생성, 제약조건 추가, 정책 변경, 007의 데이터 이관 등이 포함되어 있습니다. 승인된 변경이 필요한 경우에만 운영자가 적용 이력·백업·현재 스키마를 대조하여 별도 검토해야 합니다.

#### 저장소에 있는 마이그레이션 (의존 순서)

경로는 모두 `supabase/migrations/` 아래입니다. 이 목록은 이력 설명이며 운영 DB에 그대로 실행할 체크리스트가 아닙니다.

| 순서 / 파일 | 목적 및 주요 의존성 |
|-------------|--------------------|
| `001_initial_schema.sql` | `profiles`, `stores`, `store_members`, `schedules`, `ghost_schedules`, 초기 RLS·가입/수정 트리거 생성. Supabase의 `auth.users`, `auth.uid()`, 인증 역할 등이 전제 |
| `002_admin_rls.sql` | `is_super_admin()` 추가, `is_store_admin()` 확장, 전체관리자·매장관리자 정책 및 단기알바 RLS 보완 |
| `003_monthly_locks.sql` | 월별 잠금 테이블과 RLS 추가. 002의 관리자 함수에 의존 |
| `004_manager_cross_store_read.sql` | `is_any_store_manager()` 및 다른 매장 조회·일부 쓰기 정책 추가 |
| `005_security_patch.sql` | `delete_user()` 관리자 검사, 멤버/매장 정책 보완, 스케줄 INSERT/UPDATE 검증 트리거, 메모 길이 제약 추가. `stores.memo`, `stores.locked`, 월별 잠금 및 관리자 함수에 의존 |
| `006_store_manager_update.sql` | `is_store_admin()`을 이용한 매장 UPDATE 정책으로 교체 |
| `007_store_memos_table.sql` | 매장×월 메모 테이블·RLS·수정시각 트리거 추가, 기존 `stores.memo`가 있으면 데이터 이관. 기존 관리자/수정시각 함수 재사용, 원본 메모 컬럼 보존 |
| `008_store_memos_realtime_safety.sql` | Realtime publication이 존재하면 `store_memos` 등록, 메모 DELETE 정책 제거 및 `anon`/`authenticated` DELETE 권한 회수 |

#### 누락된 설치 산출물

현재 001–008 어디에도 다음 차이를 완성하는 DDL이 없습니다.

- `stores.memo`: 005의 `memo_max_length` 제약이 이 컬럼을 직접 참조하므로 없는 DB에서는 해당 구문이 실패합니다. 007의 존재 검사/조건부 이관이 005의 선행 조건을 해결하지는 않습니다.
- `stores.locked`: 005의 `validate_schedule_insert()`가 조회하며, 앱의 `Store` 타입도 필수로 사용합니다. 함수 생성 성공만으로 실행 시 필요한 컬럼이 갖추어졌다고 볼 수 없습니다.
- `store_members.resignation_date`: 앱의 `StoreMember` 타입에 있으나 컬럼 생성 이력이 없습니다.
- `store_members.role`의 `resigned`, `store_members.status`의 `banned`: 앱 타입에는 있으나 001의 CHECK 허용값에는 없고, 후속 파일에도 이를 확장하는 변경이 없습니다.

**필요하지만 누락된 산출물은 이 차이와 실제 운영 권한/제약을 포함하는, 검토된 기준 스키마 또는 스키마 전용 export 및 마이그레이션 적용 이력입니다.** 신규 설치자는 저장소 관리자로부터 이를 확보하고, 민감정보를 제외한 검토본과 설치 순서를 확인한 뒤 별도 비운영 DB에서 설치를 검증해야 합니다. 타입이나 테스트 fixture로 운영용 DDL·기본값·권한을 추측하여 만들지 마세요. 이 문서는 운영 DB 상태를 조회하거나 신규 설치를 완료했다고 주장하지 않습니다.

#### 읽기 전용 카탈로그 확인 예시

아래는 권한 있는 운영자가 **별도 승인된 조회 절차에서** 현재 상태와 검토된 기준 스키마를 비교할 때 사용할 SELECT 예시입니다. 이 문서 변경 작업에서 운영 DB에 실행한 결과가 아니며, 결과가 존재한다는 것만으로 설치/보안 검증이 끝나는 것은 아닙니다. 데이터 행이나 인증 비밀을 조회하지 않습니다.

```sql
-- 컬럼/타입/NULL/기본값: 특히 memo, locked, resignation_date 확인
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'stores', 'store_members', 'schedules',
                     'ghost_schedules', 'monthly_locks', 'store_memos')
ORDER BY table_name, ordinal_position;

-- CHECK/UNIQUE/FK 등: role/status 허용값도 정의를 직접 비교
SELECT c.relname AS table_name, con.conname, con.contype,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
ORDER BY c.relname, con.conname;

-- 함수 본문/SECURITY DEFINER/search_path 및 실행 권한 비교
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer, p.proconfig, p.proacl,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_super_admin', 'is_store_admin', 'is_any_store_manager',
                    'delete_user', 'validate_schedule_insert',
                    'handle_new_user', 'update_updated_at')
ORDER BY p.proname, arguments;

-- RLS 활성화 상태와 정책은 따로 확인
SELECT c.relname AS table_name, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY c.relname;

SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- auth.users의 가입 트리거도 포함 (조회 권한이 필요할 수 있음)
SELECT n.nspname AS schema_name, c.relname AS table_name, t.tgname,
       t.tgenabled, pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND (n.nspname = 'public' OR (n.nspname = 'auth' AND c.relname = 'users'))
ORDER BY n.nspname, c.relname, t.tgname;
```

---

### 4단계: Google 로그인 설정

Google 계정으로 로그인할 수 있도록 설정합니다. (이메일+비밀번호 로그인은 기본 제공됩니다.)

#### 4-1. Google Cloud Console에서 OAuth 클라이언트 만들기

1. [https://console.cloud.google.com](https://console.cloud.google.com) 에 접속합니다.
2. Google 계정으로 로그인합니다.
3. 상단의 프로젝트 선택 드롭다운을 클릭하고 **새 프로젝트** 를 만듭니다.
   - 프로젝트 이름: `ssalcheduler` (원하는 이름)
   - **만들기** 클릭
4. 만든 프로젝트가 선택된 상태에서 왼쪽 메뉴의 **API 및 서비스** → **OAuth 동의 화면** 으로 이동합니다.
5. **시작하기** 를 클릭합니다 (또는 **동의 화면 구성**).
   - 앱 이름: `쌀체듈러`
   - 사용자 지원 이메일: 본인 이메일
   - 대상: **외부** 선택
   - 개발자 연락처 이메일: 본인 이메일
   - **만들기** 클릭
6. 왼쪽 메뉴의 **API 및 서비스** → **사용자 인증 정보** 로 이동합니다.
7. 상단의 **+ 사용자 인증 정보 만들기** → **OAuth 클라이언트 ID** 를 클릭합니다.
8. 아래 항목을 입력합니다:
   - **애플리케이션 유형**: `웹 애플리케이션`
   - **이름**: `ssalcheduler`
   - **승인된 리디렉션 URI**: 아래 URI를 추가합니다:
     ```
     https://내프로젝트ID.supabase.co/auth/v1/callback
     ```
     > `내프로젝트ID`는 2-3단계에서 복사한 Project URL에서 `https://` 와 `.supabase.co` 사이의 문자열입니다.
9. **만들기** 를 클릭합니다.
10. 팝업에서 **클라이언트 ID** 와 **클라이언트 보안 비밀번호** 를 복사해서 저장해 두세요.

#### 4-2. Supabase에 Google OAuth 연결하기

1. Supabase 대시보드로 돌아갑니다.
2. 왼쪽 메뉴에서 **Authentication** → **Providers** 로 이동합니다.
3. **Google** 을 찾아서 클릭합니다.
4. **Enable Sign in with Google** 을 켭니다.
5. 아래 항목을 입력합니다:
   - **Client ID**: Google에서 복사한 클라이언트 ID
   - **Client Secret**: Google에서 복사한 클라이언트 보안 비밀번호
6. **Save** 를 클릭합니다.

> **Google 로그인이 필요 없다면**: 이 단계를 건너뛰어도 됩니다. 이메일+비밀번호 로그인만으로도 사용 가능합니다.

---

### 5단계: 프로젝트 환경 설정

내 컴퓨터에서 프로젝트를 실행하기 위한 설정입니다.

#### 5-1. Node.js 설치 확인

```bash
node --version
# 현재 GitHub Actions와 맞추려면 Node.js 20 사용
```

#### 5-2. 패키지 설치

```bash
npm install
```

#### 5-3. 환경 변수 설정

프로젝트 루트에 `.env` 파일을 만들고 2단계에서 복사한 값을 입력합니다:

```bash
# .env 파일 생성 (프로젝트 루트에)
cp .env.example .env
```

`.env` 파일을 열어서 아래와 같이 수정합니다:

```env
VITE_SUPABASE_URL=https://내프로젝트ID.supabase.co
VITE_SUPABASE_ANON_KEY=내publishable키
```

> **주의**: `.env` 파일은 `.gitignore`에 포함되어 있어서 GitHub에 올라가지 않습니다. 안심하세요.

> **개발 규칙**: 일회성 스크립트는 Git에서 제외된 `scratch/`에 작성하고, 환경변수 fallback에 실제 시크릿을 하드코딩하지 마세요.

#### 5-4. 로컬에서 실행해보기

```bash
npm run dev
```

터미널에 표시되는 주소 (현재 Vite `base: '/'` 기준 보통 `http://localhost:5173/`)를 브라우저에서 엽니다. 로그인과 실제 기능 사용에는 앞서 설명한 DB·인증 전제가 필요합니다.

**첫 번째로 가입하는 사용자가 자동으로 관리자(admin)가 됩니다.**

---

### 6단계: GitHub Pages로 배포하기

인터넷에 공개하여 누구나 접속할 수 있게 만드는 과정입니다.

#### 6-1. GitHub에 코드 올리기

Fork한 경우 이미 GitHub에 저장소가 있습니다. 변경사항을 push합니다:

```bash
git add -A
git commit -m "초기 설정 완료"
git push origin main
```

#### 6-2. GitHub Secrets 설정

GitHub Actions가 빌드할 때 Supabase 키를 사용할 수 있도록 설정합니다.

1. GitHub에서 내 저장소 페이지로 이동합니다.
2. **Settings** 탭을 클릭합니다.
3. 왼쪽 메뉴에서 **Secrets and variables** → **Actions** 를 클릭합니다.
4. **New repository secret** 을 클릭하여 아래 두 개를 추가합니다:

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | `https://내프로젝트ID.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `내publishable키` |

#### 6-3. GitHub Pages 활성화

1. **Settings** → **Pages** 로 이동합니다.
2. **Source** 를 **GitHub Actions** 로 선택합니다.
3. 저장합니다.

#### 6-4. 배포 확인

1. `main` 브랜치에 push하면 자동으로 빌드와 배포가 시작됩니다.
2. **Actions** 탭에서 진행 상황을 확인할 수 있습니다.
3. 배포 작업의 environment URL과 실제 사이트 주소를 확인합니다. 기존 문서의 `https://내아이디.github.io/ssalcheduler/`는 프로젝트 경로 예시이며, 현재 Vite 설정의 `base: '/'`와 일치하지 않습니다.

> **범위 안내**: 이 유지보수에서는 `vite.config.ts`, Pages 설정, OAuth 설정 및 기존 `deploy.yml`을 바꾸지 않으며 실제 호스팅도 검증하지 않습니다. 아래 URL 등록 예시는 실제 서비스 주소를 확인한 경우에만 참고하세요. 문서 예시를 근거로 운영 주소를 변경하지 마세요.

---

### 7단계: Supabase에 배포 URL 등록

배포된 사이트에서 Google 로그인이 작동하려면 URL을 등록해야 합니다.

1. Supabase 대시보드 → **Authentication** → **URL Configuration** 으로 이동합니다.
2. **Site URL** 을 배포 주소로 변경합니다:
   ```
   https://내아이디.github.io/ssalcheduler/
   ```
3. **Redirect URLs** 에도 같은 주소를 추가합니다:
   ```
   https://내아이디.github.io/ssalcheduler/
   ```
4. **Save** 를 클릭합니다.

또한 Google Cloud Console에서도 업데이트합니다:

1. [Google Cloud Console](https://console.cloud.google.com) → **API 및 서비스** → **사용자 인증 정보**
2. 만들어둔 OAuth 클라이언트를 클릭합니다.
3. **승인된 자바스크립트 원본** 에 추가:
   ```
   https://내아이디.github.io
   ```
4. **저장** 을 클릭합니다.

---

## 사용 방법

### 관리자 (첫 번째 가입자)

1. 사이트에 접속하여 가입합니다 (첫 가입자 = 자동 관리자).
2. 관리자 페이지의 **매장관리** 탭에서 매장을 생성합니다.
3. **회원관리** 탭에서 직원들의 가입 요청을 승인합니다.
4. **승인관리** 탭에서 직원들이 제출한 스케줄을 승인/반려합니다.

### 직원 (일반 사용자)

1. 사이트에 접속하여 가입합니다.
2. 마이페이지에서 원하는 매장에 **가입 요청** 을 보냅니다.
3. 관리자가 승인하면 매장 페이지에 입장할 수 있습니다.
4. 스케줄 그리드에서 자신의 행을 클릭하여 근무/휴일을 등록합니다.
5. 등록이 끝나면 **제출** 버튼을 누릅니다.

### 스케줄 색상 가이드

#### 근무 타입
| 색상 | 의미 |
|------|------|
| 노랑 | 오픈 |
| 초록 | 미들 |
| 보라 | 마감 |
| 파랑 | 종일 |

#### 휴일 타입
| 색상 | 의미 |
|------|------|
| 주황 | 연차 |
| 연한 주황 | 반차 |
| 회색 | 대체휴 |
| 빨강 | 병가 |
| 분홍 | 요청 |

#### 상태 표시 (셀 하단 라인)
| 색상 | 의미 |
|------|------|
| 노란 라인 | 제출됨 (승인 대기) |
| 초록 라인 | 승인됨 |
| 빨간 라인 | 반려됨 |

---

## 프로젝트 구조

```
ssalcheduler/
├── src/
│   ├── components/
│   │   ├── auth/              # 인증 관련 (ProtectedRoute)
│   │   ├── layout/            # 공통 레이아웃 (Layout)
│   │   ├── schedule/          # 스케줄 관련 (Grid, Cell, EditModal)
│   │   └── ui/                # shadcn/ui 컴포넌트
│   ├── pages/
│   │   ├── admin/             # 관리자 페이지 (회원/매장/승인 탭)
│   │   ├── MainPage.tsx       # 로그인/가입
│   │   ├── MyPage.tsx         # 매장 선택
│   │   └── StorePage.tsx      # 스케줄 그리드
│   ├── providers/             # AuthProvider
│   ├── stores/                # zustand 상태관리
│   ├── types/                 # TypeScript 타입
│   ├── constants/             # 색상, 라벨 상수
│   ├── lib/                   # Supabase 클라이언트
│   └── App.tsx                # 라우터 설정
├── supabase/
│   └── migrations/            # DB 스키마 SQL
├── .github/
│   └── workflows/             # GitHub Actions 배포
├── .env.example               # 환경변수 예시
└── package.json
```

---

## 자주 묻는 질문 (FAQ)

### Q: 첫 번째 가입자가 아닌 사람을 관리자로 만들고 싶어요.

Supabase 대시보드 → **Table Editor** → `profiles` 테이블에서 해당 사용자의 `role` 값을 `admin`으로 변경하세요.

### Q: Google 로그인 없이 이메일만으로 사용할 수 있나요?

네. 4단계(Google 로그인 설정)를 건너뛰면 됩니다. 이메일+비밀번호 로그인은 기본으로 작동합니다.

### Q: 비밀번호를 잊어버린 직원이 있어요.

Supabase 대시보드 → **Authentication** → **Users** 에서 해당 사용자를 찾아 비밀번호를 재설정하거나, 앱에 비밀번호 찾기 기능을 추가할 수 있습니다.

### Q: 매장을 여러 개 운영할 수 있나요?

네. 관리자 페이지의 매장관리 탭에서 매장을 여러 개 생성할 수 있습니다. 직원은 각 매장에 개별적으로 가입 요청을 보냅니다.

### Q: 배포 후 수정사항이 반영이 안 돼요.

GitHub Actions 탭에서 배포 작업이 실행 중인지 확인하세요. `main` 브랜치에 push할 때마다 자동으로 재배포됩니다. Secrets가 올바르게 설정되어 있는지도 확인하세요.

### Q: 무료로 사용할 수 있나요?

네. Supabase 무료 플랜과 GitHub Pages 모두 무료입니다. 소규모 매장 운영에 충분합니다.

---

## 로컬 개발

```bash
# 패키지 설치
npm install

# 개발 서버 실행
npm run dev

# 타입 체크
npx tsc -b

# 프로덕션 빌드
npm run build

# 빌드 결과 미리보기
npm run preview
```

### 개발 검증과 배포의 경계

```bash
npm run lint
npm run build
npm run test:db
```

- `lint`: 전체 소스의 ESLint 검사입니다. 기존 전체 lint 부채는 이번 유지보수에서 규칙 비활성화·경고 은폐·앱 코드 수정으로 해결하지 않습니다. 실제 명령 결과와 기존 실패 내역은 검증 보고를 확인하세요. 이 문서는 전체 lint 통과를 주장하지 않습니다.
- `build`: TypeScript 검사와 Vite 프로덕션 빌드입니다. 빌드 성공은 운영 DB, OAuth 또는 호스팅 동작 검증을 대신하지 않습니다.
- `test:db`: `node --test tests/db/permissions.test.mjs`로 기존 SQL의 RLS/트리거 회귀 동작을 검사합니다. 개발 전용 `@electric-sql/pglite`의 일회성 메모리 DB를 사용하며 DB URL 환경변수, 네트워크, 운영 DB 연결이 필요 없습니다. 누락 컬럼을 보충하는 **테스트 전용 fixture는 테스트 실행을 위한 최소 전제일 뿐 완전한 운영 스키마나 신규 설치용 baseline이 아닙니다.** 통과하더라도 3단계의 누락 산출물이 해결되지는 않습니다.
- PR 검증 워크플로는 배포하지 않습니다. 기존 `.github/workflows/deploy.yml`은 변경하지 않으며, 배포 트리거는 계속 `origin/main`에 반영되는 `main` push입니다. 작업용 worktree 브랜치 push/PR 검사와 `main` 병합은 별도 단계이고, PR 검사 성공 자체가 병합이나 배포를 뜻하지 않습니다.

### DB 검증의 현재 한계와 발견 사항

현재 저장소 SQL과 테스트 fixture를 사용한 `npm run test:db` 결과는 **20개 중 18개 통과, 2개 실패**입니다. 실패를 skip하거나 허용된 동작으로 고정하지 않고, 보장되어야 할 차단 조건을 회귀 테스트로 남겼습니다.

| 실패하는 차단 조건 | 격리된 메모리 DB에서 관찰한 기존 SQL 동작 |
|-------------------|-----------------------------------------|
| 직원의 본인 관리자 승격 금지 | `profiles_update_own`은 본인 행 UPDATE를 허용하지만 `role` 변경을 별도로 제한하지 않아, 직원이 자신을 `admin`으로 바꾼 뒤 매장 생성에 성공함 |
| 잠긴 달의 요청을 다른 달로 이동 금지 | 검증 트리거가 변경 후 날짜만 검사하여, 직원의 본인 요청이 잠긴 달에서 잠기지 않은 달로 이동함 |

이 결과는 **저장소 SQL과 명시된 fixture 권한에서 재현된 문제**이며, 현재 운영 DB도 취약하다고 확인한 것은 아닙니다. 운영 DB의 실제 스키마·컬럼 권한·정책을 조회하지 않았습니다. 이번 유지보수에서는 운영 동작 보존을 위해 앱·기존 SQL·운영 DB를 수정하지 않았으므로, DB 검증 job은 이 두 결함이 별도 승인된 변경으로 해결되기 전까지 실패합니다. 기존 전체 lint 실패도 그대로 표시하며, 필수 상태 검사 설정은 추가하지 않습니다.

통과한 잠금 검증은 같은 날짜의 INSERT/UPDATE 차단, 인접한 잠기지 않은 달과 승인된 다른 매장의 쓰기 허용, 잠긴 달로의 날짜 이동 차단, 해당 매장 매니저·전체관리자의 허용 작업을 포함합니다. 이 결과를 모든 권한 우회 차단이나 보안 감사 통과로 해석하면 안 됩니다. 기존 매니저의 다른 매장 접근도 동작별로 다릅니다. 004의 정책과 005의 트리거 조합에서는 다른 매장 소속이 없어도 매니저 본인 요청 INSERT는 허용되며, 다른 직원 스케줄 UPDATE 권한과 같지 않습니다.

---

## 라이선스

MIT License
