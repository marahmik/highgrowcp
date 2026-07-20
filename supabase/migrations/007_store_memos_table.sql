-- =============================================
-- 007. 매장 메모 테이블 분리 (store_memos)
-- =============================================
-- 배경: 기존에는 stores.memo TEXT 컬럼에 {"yyyy-MM": "..."} JSON 문자열로
--       전 월 메모를 누적 저장했습니다. 이 방식은 read-modify-write 경합
--       (last-write-wins)에 취약하고, 클라이언트 측 "1회성 초기화" 코드가
--       기기마다 재실행되며 전 매장 메모가 소실되는 사고의 원인이 되었습니다.
-- 조치: 매장×월 단위의 정규화된 store_memos 테이블로 분리합니다.

-- 1. 테이블 생성
CREATE TABLE IF NOT EXISTS store_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  month TEXT NOT NULL CHECK (month ~ '^[0-9]{4}-[0-9]{2}$'),
  content TEXT NOT NULL DEFAULT '' CHECK (length(content) <= 10000),
  updated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, month)
);

CREATE INDEX IF NOT EXISTS idx_store_memos_store_id ON store_memos(store_id);

-- 2. updated_at 자동 갱신 (001_initial_schema.sql의 기존 함수 재사용)
DROP TRIGGER IF EXISTS store_memos_updated_at ON store_memos;
CREATE TRIGGER store_memos_updated_at
  BEFORE UPDATE ON store_memos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 3. RLS
ALTER TABLE store_memos ENABLE ROW LEVEL SECURITY;

-- 조회: 인증된 사용자 전원 (기존 stores SELECT 정책과 동일 수위)
DROP POLICY IF EXISTS "store_memos_select_authenticated" ON store_memos;
CREATE POLICY "store_memos_select_authenticated"
  ON store_memos FOR SELECT
  TO authenticated
  USING (true);

-- 쓰기: 해당 매장 매니저/전체관리자만 (002_admin_rls.sql의 is_store_admin 재사용)
DROP POLICY IF EXISTS "store_memos_insert_store_admin" ON store_memos;
CREATE POLICY "store_memos_insert_store_admin"
  ON store_memos FOR INSERT
  TO authenticated
  WITH CHECK ( public.is_store_admin(store_id) );

DROP POLICY IF EXISTS "store_memos_update_store_admin" ON store_memos;
CREATE POLICY "store_memos_update_store_admin"
  ON store_memos FOR UPDATE
  TO authenticated
  USING ( public.is_store_admin(store_id) )
  WITH CHECK ( public.is_store_admin(store_id) );

DROP POLICY IF EXISTS "store_memos_delete_store_admin" ON store_memos;
CREATE POLICY "store_memos_delete_store_admin"
  ON store_memos FOR DELETE
  TO authenticated
  USING ( public.is_store_admin(store_id) );

-- 4. 기존 stores.memo 데이터 이관 (멱등: 재실행해도 기존 row는 건드리지 않음)
--    stores.memo 컬럼은 마이그레이션 파일이 아닌 대시보드에서 추가된 것으로
--    추정되므로, 컬럼 존재 여부를 먼저 확인하고 동적 SQL로만 접근합니다.
DO $$
DECLARE
  r RECORD;
  parsed JSONB;
  k TEXT;
  v TEXT;
  cur_month TEXT := to_char(now(), 'YYYY-MM');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores' AND column_name = 'memo'
  ) THEN
    RAISE NOTICE 'stores.memo 컬럼이 없어 데이터 이관을 건너뜁니다.';
    RETURN;
  END IF;

  FOR r IN EXECUTE
    'SELECT id, memo FROM public.stores WHERE memo IS NOT NULL AND memo <> '''''
  LOOP
    -- JSON 파싱 시도 (실패 시 레거시 평문으로 처리)
    BEGIN
      parsed := r.memo::jsonb;
      IF jsonb_typeof(parsed) <> 'object' THEN
        parsed := NULL;
      END IF;
    EXCEPTION WHEN others THEN
      parsed := NULL;
    END;

    IF parsed IS NOT NULL THEN
      -- 1차: 'yyyy-MM' 형식 키를 각각의 월 row로 이관 (빈 문자열 값은 스킵)
      FOR k, v IN SELECT key, value FROM jsonb_each_text(parsed)
      LOOP
        IF k ~ '^[0-9]{4}-[0-9]{2}$' AND v IS NOT NULL AND v <> '' THEN
          INSERT INTO store_memos (store_id, month, content)
          VALUES (r.id, k, left(v, 10000))
          ON CONFLICT (store_id, month) DO NOTHING;
        END IF;
      END LOOP;

      -- 2차: 'legacy' 키는 현재 월 row가 아직 없을 때만 현재 월로 이관
      v := parsed ->> 'legacy';
      IF v IS NOT NULL AND v <> '' THEN
        INSERT INTO store_memos (store_id, month, content)
        VALUES (r.id, cur_month, left(v, 10000))
        ON CONFLICT (store_id, month) DO NOTHING;
      END IF;
    ELSE
      -- 레거시 평문 메모: 현재 월 row가 아직 없을 때만 이관
      INSERT INTO store_memos (store_id, month, content)
      VALUES (r.id, cur_month, left(r.memo, 10000))
      ON CONFLICT (store_id, month) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- 주의: stores.memo 컬럼은 의도적으로 드랍하지 않고 보존합니다.
--       (메모 소실 인시던트의 PITR/백업 기반 복구용 백업 데이터)
--       복구 완료 후 별도 마이그레이션으로 제거 예정입니다.
