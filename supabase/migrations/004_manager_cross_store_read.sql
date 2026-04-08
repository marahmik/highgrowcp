-- =============================================
-- 매장 매니저가 타 매장(수퍼바이저 등)의 스케줄/멤버를 조회할 수 있도록 RLS 보완
-- 문제: 매니저(store_members.role='admin')가 수퍼바이저 매장 데이터를 볼 수 없음
-- 원인: store_members/schedules SELECT 정책이 해당 매장 소속 또는 super_admin만 허용
-- 해결: 어떤 매장이든 매니저(admin) 직급을 보유한 사용자에게 전체 읽기 권한 부여
-- =============================================

-- 매니저 여부 확인 함수
CREATE OR REPLACE FUNCTION public.is_any_store_manager()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM store_members
    WHERE user_id = auth.uid()
      AND role = 'admin'
      AND status = 'approved'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- store_members: 매니저는 모든 매장의 멤버 조회 가능
DROP POLICY IF EXISTS "store_members_select_any_manager" ON store_members;
CREATE POLICY "store_members_select_any_manager"
  ON store_members FOR SELECT
  TO authenticated
  USING ( public.is_any_store_manager() );

-- schedules: 매니저는 모든 매장의 스케줄 조회 가능
DROP POLICY IF EXISTS "schedules_select_any_manager" ON schedules;
CREATE POLICY "schedules_select_any_manager"
  ON schedules FOR SELECT
  TO authenticated
  USING ( public.is_any_store_manager() );

-- ghost_schedules: 이미 전체 인증 사용자에게 SELECT 허용되어 있으므로 추가 불필요
-- (002_admin_rls.sql의 ghost_schedules_select_all 정책)

-- 매니저가 수퍼바이저 매장의 스케줄을 INSERT할 수 있도록 보완
-- (StorePage에서 수퍼바이저 캘린더 편집 시 필요)
DROP POLICY IF EXISTS "schedules_insert_any_manager" ON schedules;
CREATE POLICY "schedules_insert_any_manager"
  ON schedules FOR INSERT
  TO authenticated
  WITH CHECK ( public.is_any_store_manager() );

-- 매니저가 수퍼바이저 매장의 ghost_schedules를 INSERT/UPDATE/DELETE 할 수 있도록
DROP POLICY IF EXISTS "ghost_schedules_all_any_manager" ON ghost_schedules;
CREATE POLICY "ghost_schedules_all_any_manager"
  ON ghost_schedules FOR ALL
  TO authenticated
  USING ( public.is_any_store_manager() )
  WITH CHECK ( public.is_any_store_manager() );
