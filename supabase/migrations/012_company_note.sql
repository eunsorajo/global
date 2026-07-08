-- 012_company_note.sql
-- 참여기업별 비고(정성 메모) 컬럼 추가.
-- KPI 매트릭스에서 기업 행마다 비고 1칸으로 정성적 내용을 기록한다.
-- (KPI 칸별 비고 kpi_progress.note 와 별개 — 기업 단위 총평용)
--
-- 적용: Supabase 대시보드 SQL Editor 또는 pg 클라이언트.

alter table companies add column if not exists note text;
