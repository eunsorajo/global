-- 014_partner_program.sql
-- 사업 파트너에 프로그램 유형/단계 메타 추가 + 목록 정렬용.
--  - program_type : 'AC' | 'PoC' | '스케일업' | 'PoC/스케일업' | '전시회' (카드에 색 배지로 표시)
--  - program_phase: '1차' | '2차' | '전시회' (목록 그룹/정렬)
-- 값 세팅 및 partners.no 재배치(정렬 순서)는 별도 데이터 스크립트로 적용.
--
-- 적용: Supabase 대시보드 SQL Editor 또는 pg 클라이언트.

alter table partners add column if not exists program_type  text;
alter table partners add column if not exists program_phase text;
