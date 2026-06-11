-- 액셀러레이팅 회의록 도메인 — meetings / followups 테이블
-- (DDL 실행은 별도 적용. 이 파일은 스키마 정의 보관용)

create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  meeting_date date,
  title text not null,
  attendees text,
  summary text,
  key_points text,          -- 줄바꿈 구분 텍스트
  decisions text,           -- 결정사항
  raw_notes text,           -- 원문(선택)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists followups (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  content text not null,
  assignee text,
  due_date date,
  status text not null default 'pending' check (status in ('pending','in_progress','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_meetings_partner_id on meetings(partner_id);
create index if not exists idx_followups_meeting_id on followups(meeting_id);

alter table meetings enable row level security;
alter table followups enable row level security;
-- public 정책 없음 (service_role만 접근)
