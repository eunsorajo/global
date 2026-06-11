-- =====================================================================
-- 007_sync_log.sql
-- 시트 ↔ DB 동기화 실행 이력 및 충돌 기록.
-- 충돌(양쪽 모두 변경, 최신 모호)은 자동 머지하지 않고 여기에 기록 → 관리자 확인.
-- =====================================================================

create table if not exists sync_log (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  run_by text,                       -- 실행 관리자 이메일
  direction text not null,           -- 'pull' | 'push' | 'both' | 'dryrun'
  created_count int not null default 0,
  updated_count int not null default 0,
  conflict_count int not null default 0,
  details jsonb,                     -- [{name, field, dbValue, sheetValue, action}] 등 상세
  created_at timestamptz not null default now()
);

alter table sync_log enable row level security;
create index if not exists idx_sync_log_run_at on sync_log(run_at desc);
