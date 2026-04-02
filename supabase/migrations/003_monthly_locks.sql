-- =============================================
-- 월별 잠금 시스템 (Monthly Locks)
-- 모든 매장에 공통으로 적용되는 월별(ex: 2026-02) 잠금 여부 저장
-- =============================================

CREATE TABLE IF NOT EXISTS public.monthly_locks (
  month VARCHAR(7) PRIMARY KEY, -- ex: '2026-02'
  is_locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.monthly_locks ENABLE ROW LEVEL SECURITY;

-- 누구나 읽기 가능
DROP POLICY IF EXISTS "monthly_locks_select_all" ON public.monthly_locks;
CREATE POLICY "monthly_locks_select_all"
  ON public.monthly_locks FOR SELECT
  TO authenticated
  USING (true);

-- 수정/생성/삭제는 전체관리자(is_super_admin)만 가능
DROP POLICY IF EXISTS "monthly_locks_insert_super_admin" ON public.monthly_locks;
CREATE POLICY "monthly_locks_insert_super_admin"
  ON public.monthly_locks FOR INSERT
  TO authenticated
  WITH CHECK ( public.is_super_admin() );

DROP POLICY IF EXISTS "monthly_locks_update_super_admin" ON public.monthly_locks;
CREATE POLICY "monthly_locks_update_super_admin"
  ON public.monthly_locks FOR UPDATE
  TO authenticated
  USING ( public.is_super_admin() );

DROP POLICY IF EXISTS "monthly_locks_delete_super_admin" ON public.monthly_locks;
CREATE POLICY "monthly_locks_delete_super_admin"
  ON public.monthly_locks FOR DELETE
  TO authenticated
  USING ( public.is_super_admin() );
