-- 011_partner_password.sql
-- 파트너 로그인을 매직링크(010) → "이메일 + 비밀번호" 방식으로 전환.
-- 관리자가 /admin/users 에서 파트너 계정 생성 시 비밀번호를 지정(또는 이후 재설정)하고,
-- 파트너는 회사 이메일 + 그 비밀번호로 로그인한다. 이메일 발송 인프라 불필요.
-- 비밀번호는 bcrypt 해시로만 저장한다(원문 저장 안 함).
--
-- 적용: Supabase 대시보드 SQL Editor 또는 pg 클라이언트.

-- 사용자 비밀번호 해시 컬럼 (null = 비밀번호 미설정 → 비밀번호 로그인 불가)
alter table users add column if not exists password_hash text;

-- 매직링크(010)에서 쓰던 1회용 토큰 테이블 폐기.
drop table if exists login_tokens;
