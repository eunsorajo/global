-- followups 테이블을 디렉토리(협력/잠재) 파트너 팔로업도 지원하도록 확장.
-- 기존 회의 팔로업: meeting_id 사용. 디렉토리 파트너 팔로업: directory_id 사용.
-- (DDL 실행은 별도 적용됨. 이 파일은 스키마 정의 보관용)

-- 1) meeting_id nullable 로 변경 (디렉토리 팔로업은 meeting 없음)
alter table followups alter column meeting_id drop not null;

-- 2) partner_directory FK 추가
alter table followups
  add column if not exists directory_id uuid references partner_directory(id) on delete cascade;

-- 3) 둘 중 하나는 반드시 존재해야 함
alter table followups
  add constraint followups_link_chk
  check (meeting_id is not null or directory_id is not null);

create index if not exists idx_followups_directory_id on followups(directory_id);
