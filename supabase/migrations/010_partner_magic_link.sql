-- 010_partner_magic_link.sql
-- 파트너용 매직링크(비밀번호 없는) 로그인 — 1회용 토큰 저장 테이블.
-- 배경: 로그인은 Google OAuth 전용이라 Google 계정이 없는 파트너 담당자는 접근 불가였다.
--       관리자가 /admin/users 에서 파트너 계정(회사 이메일 + 소속 파트너, status=active)을
--       미리 만들어 두면, 파트너는 그 이메일로 매직링크를 받아 로그인한다.
--       권한(역할·소속 파트너)은 기존과 동일하게 users 행에서만 결정된다.
--
-- 적용: Supabase 대시보드 SQL Editor 에서 실행하거나 pg 클라이언트로 적용.

create table if not exists login_tokens (
  id          uuid primary key default gen_random_uuid(),
  email       text        not null,           -- 소문자 정규화해서 저장
  token_hash  text        not null,           -- 원문 토큰의 SHA-256 (원문은 저장하지 않음)
  expires_at  timestamptz not null,           -- 발급 후 단기 만료 (앱: 15분)
  used_at     timestamptz,                     -- 1회 사용 시각 (null = 미사용)
  created_at  timestamptz not null default now()
);

create index if not exists login_tokens_email_idx on login_tokens (email);
create index if not exists login_tokens_hash_idx  on login_tokens (token_hash);
create index if not exists login_tokens_expires_idx on login_tokens (expires_at);

-- 다른 테이블과 동일하게 RLS 활성 + public 정책 없음.
-- 앱은 서버 전용 service_role 키로만 접근한다(RLS 우회). anon 키로는 아무것도 못 읽음.
alter table login_tokens enable row level security;
