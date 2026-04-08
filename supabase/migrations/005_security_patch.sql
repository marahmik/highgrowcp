-- =============================================
-- 보안 감사 패치 (2026-04-08)
-- [1] delete_user RPC 권한 검증 추가
-- [2] store_members UPDATE/DELETE RLS 보강
-- [3] stores UPDATE/DELETE에 전체관리자 추가
-- [4] 스케줄 저장 시 잠금 상태 및 근무유형 제한 DB 트리거
-- =============================================

-- ==========================================
-- [1] delete_user RPC에 반드시 관리자 검증 추가
-- ==========================================
CREATE OR REPLACE FUNCTION public.delete_user(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Permission denied: only super admin can delete users';
  END IF;
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ==========================================
-- [2] store_members UPDATE: 전체관리자 + 해당 매장 매니저만
-- ==========================================
DROP POLICY IF EXISTS "store_members_update_store_admin" ON store_members;
CREATE POLICY "store_members_update_store_admin"
  ON store_members FOR UPDATE TO authenticated
  USING ( public.is_store_admin(store_members.store_id) );

-- store_members DELETE: 본인 + 전체관리자 + 해당 매장 매니저
DROP POLICY IF EXISTS "store_members_delete_self_or_admin" ON store_members;
CREATE POLICY "store_members_delete_self_or_admin"
  ON store_members FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_store_admin(store_members.store_id)
  );

-- ==========================================
-- [3] stores UPDATE/DELETE에 전체관리자 추가
-- ==========================================
DROP POLICY IF EXISTS "stores_update_owner" ON stores;
CREATE POLICY "stores_update_admin_or_owner"
  ON stores FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS "stores_delete_owner" ON stores;
CREATE POLICY "stores_delete_admin_or_owner"
  ON stores FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.is_super_admin());

-- ==========================================
-- [4] 스케줄 저장 시 잠금 + 근무유형 제한 검증 트리거
-- 비매니저가 잠금 상태에서 저장하거나,
-- '요청' 외 근무 유형을 설정하는 것을 DB 레벨에서 차단
-- ==========================================
CREATE OR REPLACE FUNCTION public.validate_schedule_insert()
RETURNS TRIGGER AS $$
DECLARE
  store_locked BOOLEAN;
  month_locked BOOLEAN;
  is_manager BOOLEAN;
  user_month VARCHAR(7);
BEGIN
  -- 전체 관리자는 무조건 통과
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  -- 매장 매니저 확인
  is_manager := public.is_store_admin(NEW.store_id);

  -- 매니저는 무조건 통과
  IF is_manager THEN
    RETURN NEW;
  END IF;

  -- 잠금 상태 확인: 매장 개별 잠금
  SELECT locked INTO store_locked FROM stores WHERE id = NEW.store_id;
  IF store_locked THEN
    RAISE EXCEPTION 'Calendar is locked by store manager';
  END IF;

  -- 잠금 상태 확인: 전체 월 잠금
  user_month := to_char(NEW.date, 'YYYY-MM');
  SELECT is_locked INTO month_locked FROM monthly_locks WHERE month = user_month;
  IF month_locked THEN
    RAISE EXCEPTION 'Calendar is locked for this month';
  END IF;

  -- 비매니저는 본인 스케줄에 '요청'만 설정 가능
  IF NEW.user_id != auth.uid() THEN
    RAISE EXCEPTION 'Non-managers can only edit their own schedule';
  END IF;

  IF NEW.work_type IS NOT NULL THEN
    RAISE EXCEPTION 'Non-managers can only set request leave type';
  END IF;

  IF NEW.leave_type IS NOT NULL AND NEW.leave_type != 'request' THEN
    RAISE EXCEPTION 'Non-managers can only set request leave type';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- INSERT 트리거
DROP TRIGGER IF EXISTS trg_validate_schedule_insert ON schedules;
CREATE TRIGGER trg_validate_schedule_insert
  BEFORE INSERT ON schedules
  FOR EACH ROW EXECUTE FUNCTION public.validate_schedule_insert();

-- UPDATE 트리거 (같은 검증 적용)
DROP TRIGGER IF EXISTS trg_validate_schedule_update ON schedules;
CREATE TRIGGER trg_validate_schedule_update
  BEFORE UPDATE ON schedules
  FOR EACH ROW EXECUTE FUNCTION public.validate_schedule_insert();

-- 메모 길이 제한 (DB 레벨)
ALTER TABLE stores ADD CONSTRAINT memo_max_length CHECK (length(memo) <= 10000);
