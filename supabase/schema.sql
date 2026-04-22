-- ============================================================
-- Partner Network - Supabase Schema
-- ============================================================
-- 실행 방법: Supabase Dashboard > SQL Editor에 붙여넣고 실행

-- 확장: pgvector (AI 검색용 벡터 저장)
create extension if not exists vector;

-- ============================================================
-- 1. 사용자 (팀 멤버)
-- ============================================================
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text not null,
  avatar_url text,
  created_at timestamptz default now()
);

-- ============================================================
-- 2. 파트너사
-- ============================================================
create type partner_grade as enum ('전략 파트너', '우선 파트너', '일반 파트너', '잠재 파트너');
create type partner_category as enum (
  '물류·공급망', 'IT·기술', '금융·투자', '제조·생산',
  '유통·판매', '컨설팅', '기타'
);

create table partners (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  country text not null,
  city text,
  category partner_category not null default '기타',
  grade partner_grade not null default '잠재 파트너',
  contact_name text,
  contact_email text,
  contact_phone text,
  assignee_id uuid references users(id) on delete set null,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- 3. 회의록
-- ============================================================
create table meetings (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references partners(id) on delete cascade not null,
  title text not null,
  meeting_date date not null,
  summary text,                        -- AI 생성 요약
  raw_transcript text,                 -- 원본 트랜스크립트
  audio_url text,                      -- 음성 파일 URL (Storage)
  drive_url text,                      -- Google Drive 저장 URL
  embedding vector(1536),              -- AI 검색용 벡터 (text-embedding-3-small)
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now()
);

-- AI 검색용 벡터 인덱스
create index meetings_embedding_idx on meetings
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ============================================================
-- 4. 팔로업 항목
-- ============================================================
create type followup_status as enum ('pending', 'in_progress', 'completed', 'overdue');

create table followups (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings(id) on delete cascade not null,
  partner_id uuid references partners(id) on delete cascade not null,
  content text not null,
  assignee_id uuid references users(id) on delete set null,
  due_date date,
  status followup_status not null default 'pending',
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- 5. 앱 내 알림
-- ============================================================
create type notification_type as enum (
  'followup_overdue',    -- 팔로업 기한 초과
  'meeting_reminder',    -- 회의 전 브리핑
  'partner_insight'      -- 파트너 간 연결 인사이트
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  type notification_type not null,
  title text not null,
  body text not null,
  related_partner_id uuid references partners(id) on delete cascade,
  related_meeting_id uuid references meetings(id) on delete cascade,
  related_followup_id uuid references followups(id) on delete cascade,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- ============================================================
-- 6. updated_at 자동 갱신 트리거
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger partners_updated_at
  before update on partners
  for each row execute function update_updated_at();

create trigger followups_updated_at
  before update on followups
  for each row execute function update_updated_at();

-- ============================================================
-- 7. Row Level Security (기본 설정)
-- ============================================================
alter table users enable row level security;
alter table partners enable row level security;
alter table meetings enable row level security;
alter table followups enable row level security;
alter table notifications enable row level security;

-- 인증된 사용자만 데이터 접근 (추후 팀별 정책으로 확장)
create policy "authenticated users can read partners"
  on partners for select to authenticated using (true);

create policy "authenticated users can insert partners"
  on partners for insert to authenticated with check (true);

create policy "authenticated users can update partners"
  on partners for update to authenticated using (true);

create policy "authenticated users can read meetings"
  on meetings for select to authenticated using (true);

create policy "authenticated users can insert meetings"
  on meetings for insert to authenticated with check (true);

create policy "authenticated users can read followups"
  on followups for select to authenticated using (true);

create policy "authenticated users can update followups"
  on followups for update to authenticated using (true);

create policy "users can read own notifications"
  on notifications for select to authenticated
  using (auth.uid() = user_id);
