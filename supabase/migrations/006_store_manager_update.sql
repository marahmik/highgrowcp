-- =============================================
-- 매장 메모/잠금 변경 권한 버그 수정 (2026-04-17)
-- 매장 매니저가 stores 테이블을 업데이트(memo, locked 변경 등) 작동하도록 RLS 개선
-- =============================================

DROP POLICY IF EXISTS "stores_update_admin_or_owner" ON stores;
CREATE POLICY "stores_update_manager_or_owner"
  ON stores FOR UPDATE TO authenticated
  USING (public.is_store_admin(id));
