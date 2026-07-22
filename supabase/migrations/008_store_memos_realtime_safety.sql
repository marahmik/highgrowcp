-- store_memos 실시간 동기화 및 불필요한 직접 삭제 차단

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'store_memos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.store_memos;
  END IF;
END $$;

-- 앱의 메모 비우기는 빈 문자열 UPDATE로 처리하므로 DELETE 권한은 필요하지 않습니다.
DROP POLICY IF EXISTS "store_memos_delete_store_admin" ON public.store_memos;
REVOKE DELETE ON public.store_memos FROM anon, authenticated;
