-- =====================================================================
-- 005_partner_directory.sql
-- 파트너 2계층: 전체 파트너사 디렉토리(사업/협력/잠재) + 사업 파트너 상세 연결
--
-- - partner_directory: 모든 파트너사(사업·협력·잠재 공통). 신규/잠재 파트너의
--   기본 CRM 정보 보관. 화면 맨 앞(/)에서 전체를 본다.
-- - partners(사업 상세): directory_id 로 디렉토리와 1:1 연결. 참여기업·KPI 보유.
-- - 기존 사업 파트너 13곳을 디렉토리에 status='사업' 으로 backfill 후 연결.
--   (partners.id 는 그대로 유지되어 companies/kpi_* FK 영향 없음)
-- =====================================================================

create table if not exists partner_directory (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text,
  status text not null default '잠재' check (status in ('사업', '협력', '잠재')),
  sector text,               -- 분야/업종
  contact_name text,         -- 담당자
  contact_email text,
  contact_phone text,
  website text,
  last_contact_date date,    -- 최근 접촉일
  discovery_note text,       -- 발굴 경위 (잠재/신규)
  note text,                 -- 자유 메모
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, country)
);

alter table partner_directory enable row level security;

create index if not exists idx_partner_directory_status on partner_directory(status);

-- 사업 상세를 디렉토리에 연결
alter table partners add column if not exists directory_id uuid references partner_directory(id) on delete cascade;
create index if not exists idx_partners_directory_id on partners(directory_id);

-- backfill: 기존 사업 파트너 13곳을 디렉토리에 생성('사업') 후 연결
insert into partner_directory (name, country, status)
select p.name, p.country, '사업'
from partners p
on conflict (name, country) do nothing;

update partners p
set directory_id = d.id
from partner_directory d
where d.name = p.name and d.country = p.country and p.directory_id is null;
