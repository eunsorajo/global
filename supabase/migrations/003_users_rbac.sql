-- =====================================================================
-- 003_users_rbac.sql
-- 역할 기반 접근 제어(RBAC) — 사용자 테이블 + 진척도 기록자 추적
--
-- - users: 로그인 허용 계정. role(admin|partner) + partner_id 매핑.
--   하드코딩 ALLOWED_EMAILS를 대체한다 (미등록 이메일은 로그인 거부).
-- - kpi_progress.updated_by: 진척도를 마지막으로 저장한 세션 이메일.
--
-- 보안: RLS 활성, public 정책 없음 → 서버 service_role 만 접근.
-- =====================================================================

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  role text not null default 'partner' check (role in ('admin', 'partner')),
  partner_id uuid references partners(id) on delete set null,  -- partner 역할은 자기 파트너로 매핑
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- partner 역할은 반드시 파트너 매핑이 있어야 한다 (admin 은 null 허용)
  constraint partner_role_requires_partner check (role = 'admin' or partner_id is not null)
);

create index if not exists idx_users_email on users(lower(email));
create index if not exists idx_users_partner_id on users(partner_id);

alter table users enable row level security;

-- 진척도 마지막 저장자 (감사 추적)
alter table kpi_progress add column if not exists updated_by text;
