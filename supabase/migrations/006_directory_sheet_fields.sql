-- =====================================================================
-- 006_directory_sheet_fields.sql
-- 잠재 파트너사 DB 시트("1-1. 잠재 파트너사 DB") ↔ partner_directory 1:1 매핑용 컬럼 확장.
-- 시트 컬럼: 연번/담당자(SBA)/구분/국가/도시/기관명/주요사업/발굴소스/담당자(파트너)/직급/이메일/홈페이지/향후협업계획/비고
--
-- 기존 재사용: name←기관명, country←국가, contact_name←담당자(파트너),
--   contact_email←이메일, website←홈페이지, discovery_note←발굴소스, note←비고
-- 신규 추가(아래):
-- =====================================================================

alter table partner_directory add column if not exists city text;          -- 도시
alter table partner_directory add column if not exists category text;       -- 구분 (공공/민간 등)
alter table partner_directory add column if not exists biz_summary text;    -- 주요 사업
alter table partner_directory add column if not exists sba_owner text;      -- 담당자 (SBA 내부)
alter table partner_directory add column if not exists contact_title text;  -- 직급 (파트너 담당자)
alter table partner_directory add column if not exists future_plan text;    -- 향후 협업계획

-- 시트 행 ↔ DB 레코드 안정 매핑용 (양방향 동기화 단계에서 시트 숨김 ID 열과 연동)
alter table partner_directory add column if not exists sheet_row_id text;   -- 시트 측 안정 키(있으면)
alter table partner_directory add column if not exists synced_at timestamptz; -- 마지막 동기화 시각
