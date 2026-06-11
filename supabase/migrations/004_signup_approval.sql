-- =====================================================================
-- 004_signup_approval.sql
-- 가입 신청 → 최고관리자 승인 흐름
--
-- - users.status: 'pending'(승인 대기) | 'active'(사용 가능). 신규 신청은 pending.
-- - users.is_super_admin: 최고관리자(가입 승인·사용자 관리 권한). 일반 관리자와 구분.
-- - 자가 신청 시 본인이 유형(role)·소속(partner_id)을 선택해 신청하지만,
--   최고관리자가 active 로 승인하기 전까지는 어떤 데이터에도 접근할 수 없다.
-- =====================================================================

alter table users add column if not exists status text not null default 'pending'
  check (status in ('pending', 'active'));

alter table users add column if not exists is_super_admin boolean not null default false;

create index if not exists idx_users_status on users(status);
