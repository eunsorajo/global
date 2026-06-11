-- =====================================================================
-- 001_kpi_schema.sql
-- SBA 해외 액셀러레이팅 프로그램 — KPI 관리 시스템 스키마
-- 기획서 4.2절 SQL + Row Level Security (RLS)
--
-- 보안 정책:
--   4개 테이블 모두 RLS 활성화. public(anon) 정책은 만들지 않는다.
--   서버의 service_role 키만 RLS를 우회해 접근 가능하며,
--   anon 키로는 모든 접근이 차단된다.
-- =====================================================================

-- 1. 파트너 (국가별 현지 운영 파트너)
create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  no int not null,                          -- 전체 개요 표시 순번
  country text not null,                    -- '일본(도쿄)', '베트남' 등 (시트명과 동일)
  name text not null,                       -- '도쿄도', '벡터마스' 등
  agreement_submitted boolean not null default false,  -- 협약서 제출 여부
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country, name)
);

-- 2. 참여기업 (파트너/국가 프로그램 소속)
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  no int not null,                          -- 시트 내 순번
  name text not null,                       -- 기업명
  sector text,                              -- 분야 (헬스케어/바이오 등)
  description text,                         -- 사업내용
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_id, no)
);

-- 3. KPI 정의 (파트너별 KPI 1~N)
create table if not exists kpi_definitions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  kpi_order int not null,                   -- 1~10
  category text check (category in ('공통', '특화')),  -- HEC Paris처럼 미정 가능 → null 허용
  name text not null,                       -- '참가기업 수', 'PoC 제안서' 등
  target text,                              -- 목표 기준 ('기업별 2회 이상' 등)
  achieved boolean,                         -- 파트너 레벨 달성여부 (null = 미판정)
  note text,                                -- 비고
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_id, kpi_order)
);

-- 4. 기업별 KPI 진척도 (매트릭스 셀)
create table if not exists kpi_progress (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  kpi_definition_id uuid not null references kpi_definitions(id) on delete cascade,
  value text,                               -- 진척도 자유 입력 ('2회 완료', '3건' 등)
  achieved boolean,                         -- 기업 레벨 달성여부 (null = 미판정)
  note text,
  updated_at timestamptz not null default now(),
  unique (company_id, kpi_definition_id)
);

-- 조회 성능을 위한 인덱스
create index if not exists idx_companies_partner_id on companies(partner_id);
create index if not exists idx_kpi_definitions_partner_id on kpi_definitions(partner_id);
create index if not exists idx_kpi_progress_company_id on kpi_progress(company_id);
create index if not exists idx_kpi_progress_kpi_definition_id on kpi_progress(kpi_definition_id);

-- =====================================================================
-- Row Level Security (RLS)
--
-- 모든 테이블에 RLS를 활성화하되 public 정책을 만들지 않는다.
-- → anon 키 / authenticated 역할로는 어떤 row 도 보이거나 수정되지 않는다.
-- → service_role 키는 RLS 를 우회하므로 서버(API 라우트, 시드 스크립트)만 접근 가능.
-- =====================================================================

alter table partners        enable row level security;
alter table companies       enable row level security;
alter table kpi_definitions enable row level security;
alter table kpi_progress    enable row level security;

-- (의도적으로 public/anon/authenticated 용 policy 를 생성하지 않음)
