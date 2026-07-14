-- 013_kpi_progress_quant.sql
-- KPI 매트릭스 셀을 "정량(달성수/목표수)" 입력으로 전환.
--  - progress_current / progress_target: 달성 수 / 목표 수 (%는 current/target 으로 계산)
--  - 기존 진척도 텍스트(value)는 정성 메모이므로 비고(note)로 이동 후 value 는 비운다.
--  - value 컬럼 자체는 호환을 위해 남겨두되 앱은 더 이상 사용하지 않는다.
--
-- 적용: Supabase 대시보드 SQL Editor 또는 pg 클라이언트.

alter table kpi_progress add column if not exists progress_current int;
alter table kpi_progress add column if not exists progress_target  int;

-- 기존 value(진척도 텍스트)를 note(비고)로 이동. note 에 이미 값이 있으면 줄바꿈으로 이어붙임.
update kpi_progress
set note = case when coalesce(note, '') = '' then value else note || E'\n' || value end
where coalesce(value, '') <> '';

-- 이동 완료된 value 는 비운다(정량 입력 칸으로 용도 변경).
update kpi_progress set value = null where value is not null;
