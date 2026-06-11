-- =====================================================================
-- 008_sync_safety.sql
-- 동기화 안전장치: 변경 감지용 스냅샷 + 덮어쓰기 백업(되돌리기).
--
-- - partner_directory.synced_snapshot: 마지막 동기화 시점의 필드 값(jsonb).
--   → 어느 쪽(시트/DB)이 변경됐는지 정확히 판정(둘 다 변경 = 충돌).
-- - sync_backup: 자동 동기화가 값을 덮어쓰기 전 "이전 값"을 보관 → 되돌리기 가능.
--   충돌을 최신본으로 자동 적용하되, 진 쪽 값을 여기 백업해 데이터 유실을 막는다.
-- =====================================================================

alter table partner_directory add column if not exists synced_snapshot jsonb;

create table if not exists sync_backup (
  id uuid primary key default gen_random_uuid(),
  run_id uuid,                       -- 동기화 실행 식별(선택)
  directory_id uuid references partner_directory(id) on delete cascade,
  entity text not null default 'partner_directory',
  field text not null,               -- 덮어쓴 필드
  old_value text,                    -- 덮어쓰기 전 값(되돌리기용)
  new_value text,                    -- 적용된 값
  source text,                       -- 'pull'(시트→DB) | 'push'(DB→시트)
  reason text,                       -- 'conflict-latest-wins' | 'overwrite'
  restored boolean not null default false,
  created_at timestamptz not null default now()
);

alter table sync_backup enable row level security;
create index if not exists idx_sync_backup_created_at on sync_backup(created_at desc);
create index if not exists idx_sync_backup_directory on sync_backup(directory_id);
