-- =============================================
-- 전체 관리자(admin) 데이터 조회 및 수정 접근 권한 추가
-- (통합 캘린더에서 전체 관리자가 소속 매장 없이 모든 데이터를 확인할 수 있도록 RLS 수정)
-- =============================================

-- 1. 전체 관리자(profiles.role='admin') 확인용 함수
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. is_store_admin 함수에 전체관리자 조건 추가
CREATE OR REPLACE FUNCTION public.is_store_admin(checking_store_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- 전체관리자는 무조건 권한 허용
  IF public.is_super_admin() THEN
    RETURN TRUE;
  END IF;

  -- 매장 소유자 확인
  IF EXISTS (SELECT 1 FROM stores WHERE id = checking_store_id AND owner_id = auth.uid()) THEN
    RETURN TRUE;
  END IF;
  
  -- 매장 매니저(admin) 확인
  IF EXISTS (
    SELECT 1 FROM store_members
    WHERE store_id = checking_store_id
      AND user_id = auth.uid()
      AND role = 'admin'
      AND status = 'approved'
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 3. schedules 테이블 RLS 정책 (전체관리자 허용)
-- 전체 관리자는 모든 스케줄에 대해 조회/생성/수정/삭제 가능
DROP POLICY IF EXISTS "schedules_select_super_admin" ON schedules;
CREATE POLICY "schedules_select_super_admin"
  ON schedules FOR SELECT
  TO authenticated
  USING ( public.is_super_admin() );

DROP POLICY IF EXISTS "schedules_insert_super_admin" ON schedules;
CREATE POLICY "schedules_insert_super_admin"
  ON schedules FOR INSERT
  TO authenticated
  WITH CHECK ( public.is_super_admin() );

DROP POLICY IF EXISTS "schedules_update_super_admin" ON schedules;
CREATE POLICY "schedules_update_super_admin"
  ON schedules FOR UPDATE
  TO authenticated
  USING ( public.is_super_admin() );

DROP POLICY IF EXISTS "schedules_delete_super_admin" ON schedules;
CREATE POLICY "schedules_delete_super_admin"
  ON schedules FOR DELETE
  TO authenticated
  USING ( public.is_super_admin() );


-- 4. store_members 테이블 RLS 정책 (전체관리자 허용)
DROP POLICY IF EXISTS "store_members_select_super_admin" ON store_members;
CREATE POLICY "store_members_select_super_admin"
  ON store_members FOR SELECT
  TO authenticated
  USING ( public.is_super_admin() );

-- 5. 기존 RLS 수정 시 안전 장치로 ghost_schedules 확인
-- (기존 파일에는 ghost_schedules에 RLS가 없었지만 만약 활성화되었다면 접근 가능하도록 추가)
ALTER TABLE ghost_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ghost_schedules_select_all" ON ghost_schedules;
CREATE POLICY "ghost_schedules_select_all"
  ON ghost_schedules FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ghost_schedules_all_super_admin" ON ghost_schedules;
CREATE POLICY "ghost_schedules_all_super_admin"
  ON ghost_schedules FOR ALL
  TO authenticated
  USING ( public.is_super_admin() )
  WITH CHECK ( public.is_super_admin() );

-- 추가 지원: 매니저(store_admin)가 schedules를 수정/삭제할 수 있도록 보완
-- 기존 정책("schedules_update_store_admin")은 owner_id 만 체크하는 오류가 있어 보완
DROP POLICY IF EXISTS "schedules_update_store_admin" ON schedules;
CREATE POLICY "schedules_update_store_admin"
  ON schedules FOR UPDATE
  TO authenticated
  USING ( public.is_store_admin(schedules.store_id) );

DROP POLICY IF EXISTS "schedules_delete_store_admin" ON schedules;
CREATE POLICY "schedules_delete_store_admin"
  ON schedules FOR DELETE
  TO authenticated
  USING ( public.is_store_admin(schedules.store_id) );
