import 'server-only';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';

// 동기화 이력/백업 조회 (관리자 이력 화면용). server-only.

export interface SyncLogRow {
  id: string;
  run_at: string;
  run_by: string | null;
  direction: string;
  created_count: number;
  updated_count: number;
  conflict_count: number;
}

export interface SyncBackupRow {
  id: string;
  directory_id: string | null;
  partner_name: string | null; // 조인된 파트너명
  field: string;
  old_value: string | null;
  new_value: string | null;
  source: string | null;
  reason: string | null;
  restored: boolean;
  created_at: string;
}

export async function getRecentSyncLogs(limit = 20): Promise<SyncLogRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('sync_log')
    .select('id, run_at, run_by, direction, created_count, updated_count, conflict_count')
    .order('run_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(describeSupabaseError(error));
  return (data as SyncLogRow[]) ?? [];
}

export async function getRecentBackups(limit = 50): Promise<SyncBackupRow[]> {
  const supabase = getSupabaseAdmin();
  // 미복원 우선, 최신순. 파트너명은 partner_directory 조인.
  const { data, error } = await supabase
    .from('sync_backup')
    .select('id, directory_id, field, old_value, new_value, source, reason, restored, created_at, partner_directory(name)')
    .order('restored', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(describeSupabaseError(error));
  type Joined = Omit<SyncBackupRow, 'partner_name'> & {
    partner_directory: { name: string | null } | { name: string | null }[] | null;
  };
  return ((data as Joined[]) ?? []).map((r) => {
    const pd = Array.isArray(r.partner_directory) ? r.partner_directory[0] : r.partner_directory;
    return {
    id: r.id,
    directory_id: r.directory_id,
    partner_name: pd?.name ?? null,
    field: r.field,
    old_value: r.old_value,
    new_value: r.new_value,
    source: r.source,
    reason: r.reason,
    restored: r.restored,
    created_at: r.created_at,
    };
  });
}
