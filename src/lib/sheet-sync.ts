// 서버 전용 — Google Sheets("1-1. 잠재 파트너사 DB") ↔ Supabase(partner_directory)
// 양방향 동기화 로직 (매핑 / 충돌 / upsert).
//
// 안정 매핑 키:
//   - 시트 데이터 영역 오른쪽 끝 "ID" 열에 partner_directory.id 를 저장.
//   - 위치 기반 매칭 금지. ID 열로 시트행↔DB행 매칭.
//   - ID 없는 시트행 → DB 신규 생성(또는 name+country 매칭 시 연결) → 그 id 를 ID 열에 write-back.
//
// 충돌 정책 (마이그레이션 008 — 자동 last-write-wins + 백업):
//   - 필드별로 synced_snapshot(마지막 동기화 시점 값) 기준으로 어느 쪽이 바뀌었는지 판정.
//       sheetChanged = (시트값 != snapshot[field]),  dbChanged = (DB값 != snapshot[field])
//   - snapshot 이 없으면(미초기화) 충돌로 보지 않고 현재값으로 baseline 초기화(백업 없음).
//   - 한쪽만 변경 → 그쪽 값을 적용.
//   - 양쪽 모두 변경(충돌) → 자동 last-write-wins:
//       pull 경로는 시트가 최신 → 시트값 적용,  push 경로는 DB가 최신 → DB값 적용.
//       진 쪽(덮어쓰는) 이전 값을 sync_backup(reason='conflict-latest-wins')에 기록 후 적용.
//   - 충돌이 아니어도 기존 non-empty 값을 덮어쓰면 sync_backup(reason='overwrite')에 기록.
//
// 대량변경 가드(서킷 브레이커): 자동 경로(폴링 pull / 전체 pull·both)에서 한 번에
//   생성+수정+충돌 합이 BULK_LIMIT 를 넘으면 쓰기 없이 needsConfirmation 으로 중단.
//   force:true 면 가드를 무시(수동 /admin/sync 에서만).
//
// 안전 원칙: 전체 시트 클리어/재작성 절대 금지. push 는 행/셀 단위로만 기록.
import 'server-only';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';
import {
  getTargetSheet,
  readRange,
  batchWriteRanges,
  appendRows,
  colToA1,
  HEADER_ROW,
  DATA_START_ROW,
  ID_HEADER,
  SheetsError,
} from '@/lib/sheets';
import type { PartnerDirectoryRow } from '@/types/accelerating';

export class SyncError extends Error {}

// ---------- 헤더 ↔ DB 컬럼 매핑 ----------
// 헤더 텍스트로 찾되, "담당자" 중복은 위치로 구분(첫=SBA, 둘째=파트너).
// dbField: partner_directory 컬럼명. null 은 무시(연번 등).

export type DirectoryField =
  | 'name'
  | 'country'
  | 'city'
  | 'category'
  | 'biz_summary'
  | 'discovery_note'
  | 'sba_owner'
  | 'contact_name'
  | 'contact_title'
  | 'contact_email'
  | 'website'
  | 'future_plan'
  | 'note';

// 시트 → DB 매핑 대상 필드 전체 (충돌 비교/반영 단위)
export const SYNC_FIELDS: DirectoryField[] = [
  'name',
  'country',
  'city',
  'category',
  'biz_summary',
  'discovery_note',
  'sba_owner',
  'contact_name',
  'contact_title',
  'contact_email',
  'website',
  'future_plan',
  'note',
];

// 헤더 텍스트 → DB 필드. "담당자" 는 중복이라 별도 처리.
const HEADER_TO_FIELD: Record<string, DirectoryField | null> = {
  연번: null,
  구분: 'category',
  국가: 'country',
  도시: 'city',
  기관명: 'name',
  '주요 사업': 'biz_summary',
  '발굴 소스': 'discovery_note',
  직급: 'contact_title',
  이메일: 'contact_email',
  홈페이지: 'website',
  '향후 협업계획': 'future_plan',
  비고: 'note',
};

// 해석된 헤더: 각 컬럼 인덱스(0-based) → DirectoryField | 'ID' | null
export interface HeaderLayout {
  // field → 컬럼 인덱스 (0-based)
  fieldCol: Partial<Record<DirectoryField, number>>;
  // ID 열 인덱스 (없으면 null → push/write-back 시 새 열로 추가 필요)
  idCol: number | null;
  // 헤더 행에서 마지막으로 값이 있는 컬럼 인덱스 (ID 열 추가 위치 계산용)
  lastCol: number;
  // 원본 헤더 텍스트 배열
  raw: string[];
}

// 헤더 행(2행)을 해석. "담당자" 중복: 첫째=sba_owner, 둘째=contact_name.
export function parseHeader(headerRow: string[]): HeaderLayout {
  const fieldCol: Partial<Record<DirectoryField, number>> = {};
  let idCol: number | null = null;
  let seenOwner = 0;
  let lastCol = -1;

  headerRow.forEach((cellRaw, idx) => {
    const cell = (cellRaw ?? '').trim();
    if (cell !== '') lastCol = idx;
    if (cell === '') return;

    if (cell === ID_HEADER) {
      idCol = idx;
      return;
    }
    if (cell === '담당자') {
      // 첫 번째 = SBA 내부, 두 번째 = 파트너측 담당자
      if (seenOwner === 0) fieldCol.sba_owner = idx;
      else fieldCol.contact_name = idx;
      seenOwner += 1;
      return;
    }
    const field = HEADER_TO_FIELD[cell];
    if (field) fieldCol[field] = idx;
  });

  return { fieldCol, idCol, lastCol, raw: headerRow };
}

// ---------- 값 정규화 ----------

// 시트 셀 → DB 값. 빈 문자열은 null.
function cellToValue(field: DirectoryField, raw: string | undefined): string | null {
  let v = (raw ?? '').trim();
  if (field === 'contact_email') {
    // 앞뒤 < > 제거
    v = v.replace(/^</, '').replace(/>$/, '').trim();
  }
  return v === '' ? null : v;
}

// DB 값 → 시트 셀(문자열). null/undefined 는 빈 문자열.
function valueToCell(v: string | null | undefined): string {
  return v == null ? '' : String(v);
}

// 비교용 정규화 (null/'' 동일 취급, 공백 trim)
function norm(v: string | null | undefined): string {
  return (v ?? '').trim();
}

// ---------- 대량변경 가드 + 스냅샷/백업 ----------

// 자동 경로(폴링 pull / 전체 pull·both)에서 한 번에 적용할 수 있는 변경(생성+수정+충돌) 상한.
export const BULK_LIMIT = 15;

// synced_snapshot 에서 특정 필드의 baseline 값 추출 (없으면 null).
function snapValue(
  snapshot: Record<string, string | null> | null | undefined,
  field: DirectoryField,
): string | null {
  if (snapshot == null) return null;
  const v = snapshot[field];
  return v == null ? null : String(v);
}

// 현재 DB 행 → 스냅샷 객체(SYNC_FIELDS 만). 적용 후 baseline 갱신용.
function buildSnapshot(values: Partial<Record<DirectoryField, string | null>>): Record<string, string | null> {
  const snap: Record<string, string | null> = {};
  for (const field of SYNC_FIELDS) {
    const v = values[field];
    snap[field] = v == null ? null : String(v);
  }
  return snap;
}

// sync_backup 한 건 기록(되돌리기용). 실패해도 동기화를 깨뜨리지 않게 콘솔만.
export interface BackupEntry {
  runId: string;
  directoryId: string;
  field: DirectoryField;
  oldValue: string | null;
  newValue: string | null;
  source: 'pull' | 'push';
  reason: 'conflict-latest-wins' | 'overwrite';
}

async function writeBackups(entries: BackupEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const supabase = getSupabaseAdmin();
  const rows = entries.map((e) => ({
    run_id: e.runId,
    directory_id: e.directoryId,
    entity: 'partner_directory',
    field: e.field,
    old_value: e.oldValue,
    new_value: e.newValue,
    source: e.source,
    reason: e.reason,
  }));
  const { error } = await supabase.from('sync_backup').insert(rows);
  if (error) {
    console.error('[sheet-sync] sync_backup 기록 실패:', describeSupabaseError(error));
  }
}

// ---------- 시트 읽기 → 행 모델 ----------

export interface SheetRow {
  rowNumber: number; // 시트 행 번호 (1-based, DATA_START_ROW 부터)
  id: string | null; // ID 열 값 (없으면 null)
  values: Partial<Record<DirectoryField, string | null>>;
  empty: boolean; // 기관명(name) 이 비어 있으면 skip 대상
}

// 대상 탭의 데이터 영역을 읽어 SheetRow[] + 헤더 레이아웃 반환.
async function readSheet(): Promise<{ header: HeaderLayout; title: string; rows: SheetRow[] }> {
  const target = await getTargetSheet();
  const title = target.title;

  // 헤더 행 + 데이터 전체를 넉넉히 읽는다 (A{HEADER_ROW} 부터 마지막 데이터 행까지).
  // 컬럼 폭은 시트 columnCount 기준(여유).
  const lastColLetter = colToA1(Math.max(target.columnCount - 1, 0));
  const headerVals = await readRange(`${title}!A${HEADER_ROW}:${lastColLetter}${HEADER_ROW}`);
  const header = parseHeader(headerVals[0] ?? []);
  if (header.fieldCol.name === undefined) {
    throw new SyncError('헤더에서 "기관명" 열을 찾지 못했습니다. (대상 탭 2행 헤더 확인)');
  }

  const dataVals = await readRange(
    `${title}!A${DATA_START_ROW}:${lastColLetter}${target.rowCount}`,
  );

  const rows: SheetRow[] = dataVals.map((row, i) => {
    const values: Partial<Record<DirectoryField, string | null>> = {};
    for (const field of SYNC_FIELDS) {
      const col = header.fieldCol[field];
      if (col !== undefined) values[field] = cellToValue(field, row[col]);
    }
    const id = header.idCol != null ? norm(row[header.idCol]) || null : null;
    const empty = !values.name;
    return { rowNumber: DATA_START_ROW + i, id, values, empty };
  });

  return { header, title, rows };
}

// ---------- DB 읽기 ----------

// status='잠재' 디렉토리 행 전체 (시트는 잠재 파트너 전용 탭).
async function readDirectory(): Promise<PartnerDirectoryRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('partner_directory')
    .select('*')
    .eq('status', '잠재');
  if (error) throw new SyncError(describeSupabaseError(error));
  return (data ?? []) as PartnerDirectoryRow[];
}

// ---------- 변경 계획 (dry-run / 적용 공용) ----------

export type ChangeAction = 'create' | 'update' | 'conflict' | 'noop';

export interface FieldDiff {
  field: DirectoryField;
  dbValue: string | null;
  sheetValue: string | null;
  // 충돌 자동해결 메타 (pull 미리보기/적용 공용). 일반 update 에는 없을 수 있음.
  conflict?: boolean; // 양쪽 모두 baseline 대비 변경됨
  resolvedValue?: string | null; // 최종 적용값 (pull=시트값 우선)
  loserValue?: string | null; // 덮어써 백업할 이전 값 (있으면 백업 대상)
  reason?: 'conflict-latest-wins' | 'overwrite';
}

export interface PullPlanRow {
  rowNumber: number;
  id: string | null; // 매칭된 DB id (신규면 null)
  name: string;
  action: ChangeAction;
  // create/update: 시트→DB 로 반영할 필드들
  updates: FieldDiff[];
  // conflict: 양쪽 모두 변경되어 건너뛴 필드들
  conflicts: FieldDiff[];
  matchedBy: 'id' | 'name+country' | 'new' | null;
}

export interface PushPlanRow {
  id: string;
  rowNumber: number | null; // 시트 행 번호 (없으면 시트에 행 없음 → push 대상 아님)
  name: string;
  action: ChangeAction;
  updates: FieldDiff[]; // DB→시트 로 반영할 필드들
}

export interface SyncPlan {
  pull: {
    rows: PullPlanRow[];
    createdCount: number;
    updatedCount: number;
    conflictCount: number;
    needsIdColumn: boolean; // 시트에 ID 열이 없어 추가가 필요한지
  };
  push: {
    rows: PushPlanRow[];
    updatedCount: number;
  };
}

// 두 값이 "마지막 동기화 이후 바뀌었는가" 판단.
//   - DB 변경됨: updated_at > synced_at (또는 synced_at 없음)
//   - 시트 변경됨: 시트값 ≠ 마지막으로 DB 에 반영된 값. synced_at 이후의 시트 편집 여부를
//     시각으로는 알 수 없으므로, "현재 시트값 ≠ 현재 DB값" 이고 DB 도 변경된 경우를 충돌로 본다.
//     (시트 측 변경 시각 메타가 없는 한계 — 보수적으로 양쪽 모두 변경 의심 시 충돌 처리)
function dbChangedSinceSync(row: PartnerDirectoryRow): boolean {
  if (!row.synced_at) return true; // 한 번도 동기화 안 됨 → DB 가 source
  return new Date(row.updated_at).getTime() > new Date(row.synced_at).getTime();
}

// ---------- 계획 산출 ----------

export async function buildPlan(): Promise<SyncPlan> {
  const [{ header, rows: sheetRows }, dirRows] = await Promise.all([readSheet(), readDirectory()]);

  const dirById = new Map<string, PartnerDirectoryRow>();
  for (const d of dirRows) dirById.set(d.id, d);

  // name+country → DB row (ID 없는 시트행 최초 연결용). 중복 키는 첫 행만.
  const dirByNameCountry = new Map<string, PartnerDirectoryRow>();
  for (const d of dirRows) {
    const key = `${norm(d.name)}|${norm(d.country)}`;
    if (!dirByNameCountry.has(key)) dirByNameCountry.set(key, d);
  }

  const pullRows: PullPlanRow[] = [];
  const matchedDbIds = new Set<string>();

  for (const sr of sheetRows) {
    if (sr.empty) continue; // 기관명 없는 행 skip

    const name = sr.values.name ?? '';
    let db: PartnerDirectoryRow | undefined;
    let matchedBy: PullPlanRow['matchedBy'] = null;

    if (sr.id && dirById.has(sr.id)) {
      db = dirById.get(sr.id);
      matchedBy = 'id';
    } else if (!sr.id) {
      // ID 없는 행 → name+country 매칭 시도
      const key = `${norm(sr.values.name)}|${norm(sr.values.country)}`;
      const cand = dirByNameCountry.get(key);
      if (cand && !matchedDbIds.has(cand.id)) {
        db = cand;
        matchedBy = 'name+country';
      }
    }

    if (!db) {
      // 신규 생성 대상: 시트의 모든 (비어있지 않은) 필드를 updates 로
      const updates: FieldDiff[] = [];
      for (const field of SYNC_FIELDS) {
        const sv = sr.values[field] ?? null;
        if (sv != null) updates.push({ field, dbValue: null, sheetValue: sv });
      }
      pullRows.push({
        rowNumber: sr.rowNumber,
        id: null,
        name,
        action: 'create',
        updates,
        conflicts: [],
        matchedBy: 'new',
      });
      continue;
    }

    matchedDbIds.add(db.id);
    const snapshot = db.synced_snapshot ?? null;

    const updates: FieldDiff[] = [];
    const conflicts: FieldDiff[] = [];
    for (const field of SYNC_FIELDS) {
      const sheetValue = sr.values[field] ?? null;
      const dbValue = (db[field] as string | null) ?? null;
      if (norm(sheetValue) === norm(dbValue)) continue; // 동일 → 적용할 것 없음

      // snapshot 기준 변경 감지. snapshot 이 null 이면 baseline 미초기화 →
      // 충돌로 보지 않고 시트값을 적용(첫 실행 안전, 백업 없음).
      const base = snapValue(snapshot, field);
      const sheetChanged = snapshot == null || norm(sheetValue) !== norm(base);
      const dbChanged = snapshot != null && norm(dbValue) !== norm(base);
      const isConflict = sheetChanged && dbChanged;

      // pull = 시트 최신 우선 → 시트값 적용.
      const resolvedValue = sheetValue;
      // 덮어쓰는 이전 DB 값이 non-empty 면 백업 대상.
      const loserValue = norm(dbValue) !== '' ? dbValue : null;

      const diff: FieldDiff = {
        field,
        dbValue,
        sheetValue,
        conflict: isConflict,
        resolvedValue,
        loserValue,
        reason: isConflict ? 'conflict-latest-wins' : loserValue != null ? 'overwrite' : undefined,
      };
      if (isConflict) conflicts.push(diff);
      else updates.push(diff);
    }

    // 충돌도 자동 적용(시트 우선)되므로 행 액션은 변경 여부로만 구분.
    const action: ChangeAction =
      updates.length + conflicts.length > 0 ? (conflicts.length > 0 ? 'conflict' : 'update') : 'noop';
    pullRows.push({
      rowNumber: sr.rowNumber,
      id: db.id,
      name,
      action,
      updates,
      conflicts,
      matchedBy,
    });
  }

  // ---- push 계획: DB 변경분을 시트에 반영 ----
  // 시트 행이 존재하는(=ID 매칭된) DB 행만 대상. 시트에 없는 DB 행은 push 대상 아님
  //   (잠재 탭은 시트가 원천 입력 — DB→시트로 새 행을 만들지는 않는다. 행/셀 단위만).
  const sheetRowByDbId = new Map<string, SheetRow>();
  for (const sr of sheetRows) {
    if (sr.id) sheetRowByDbId.set(sr.id, sr);
  }

  const pushRows: PushPlanRow[] = [];
  for (const db of dirRows) {
    const sr = sheetRowByDbId.get(db.id);
    if (!sr) continue; // 시트에 대응 행 없음 → push 불가 (행 단위로만)
    if (!dbChangedSinceSync(db)) continue; // DB 미변경 → push 불필요

    const updates: FieldDiff[] = [];
    for (const field of SYNC_FIELDS) {
      const dbValue = (db[field] as string | null) ?? null;
      const sheetValue = sr.values[field] ?? null;
      if (norm(dbValue) === norm(sheetValue)) continue;
      updates.push({ field, dbValue, sheetValue });
    }
    if (updates.length === 0) continue;
    pushRows.push({
      id: db.id,
      rowNumber: sr.rowNumber,
      name: db.name,
      action: 'update',
      updates,
    });
  }

  return {
    pull: {
      rows: pullRows,
      createdCount: pullRows.filter((r) => r.action === 'create').length,
      updatedCount: pullRows.filter((r) => r.action === 'update').length,
      conflictCount: pullRows.filter((r) => r.action === 'conflict').length,
      needsIdColumn: header.idCol == null,
    },
    push: {
      rows: pushRows,
      updatedCount: pushRows.length,
    },
  };
}

// ---------- 적용: PULL (시트 → DB) + ID write-back ----------

export interface ApplyResult {
  created: number;
  updated: number;
  // 자동 해결된 충돌(최신 우선 적용 + 백업). 더 이상 '건너뜀'이 아님.
  conflicts: ConflictDetail[];
  details: ConflictDetail[];
  // 기록된 백업 건수(충돌 + overwrite). UI 표시용.
  backups: number;
  // 대량변경 가드 발동 시(쓰기 없이 중단). force:true 면 발동하지 않음.
  needsConfirmation?: boolean;
  plannedChanges?: number;
  // 이 실행의 run_id (백업 묶음 식별).
  runId?: string;
}

export interface ConflictDetail {
  name: string;
  id: string | null;
  field: DirectoryField;
  dbValue: string | null; // 충돌 시 진 쪽(덮어쓴) DB 값
  sheetValue: string | null; // 이긴 값(적용된 시트 값)
  action: 'resolved-latest-wins';
}

// 대량변경 가드 발동 시 반환 (쓰기 없음).
function guardTripped(plannedChanges: number): ApplyResult {
  return {
    created: 0,
    updated: 0,
    conflicts: [],
    details: [],
    backups: 0,
    needsConfirmation: true,
    plannedChanges,
  };
}

// pull 적용: 신규 생성 / 변경 반영 / 충돌 자동해결(시트 최신 우선 + 백업) + ID 열 write-back.
//   - 시트에 ID 열이 없으면 헤더에 "ID" 추가 후 각 행 id 기록.
//   - synced_at / synced_snapshot 갱신, sheet_row_id 에 동일 id 저장.
//   - opts.force 가 false(자동 경로)이고 변경 합계가 BULK_LIMIT 초과면 쓰기 없이 중단.
export async function applyPull(opts: { force?: boolean } = {}): Promise<ApplyResult> {
  const { header, title, rows: sheetRows } = await readSheet();
  const dirRows = await readDirectory();
  const plan = await buildPlan();

  // ---- 대량변경 가드 (force 아닐 때만) ----
  const plannedChanges = plan.pull.rows.reduce(
    (n, r) => n + (r.action === 'create' ? 1 : r.updates.length + r.conflicts.length),
    0,
  );
  if (!opts.force && plannedChanges > BULK_LIMIT) {
    return guardTripped(plannedChanges);
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const runId = randomUUID();
  const conflicts: ConflictDetail[] = [];
  const backups: BackupEntry[] = [];
  let created = 0;
  let updated = 0;

  // DB 행 조회(스냅샷 baseline 계산용)
  const dirById = new Map<string, PartnerDirectoryRow>();
  for (const d of dirRows) dirById.set(d.id, d);

  // ID 열 위치 결정 (없으면 헤더 마지막+1 컬럼에 신설)
  const idCol = header.idCol != null ? header.idCol : header.lastCol + 1;
  const idColLetter = colToA1(idCol);

  // sheet rowNumber → 기록할 id (write-back 용)
  const idWriteBack: { range: string; values: (string | number)[][] }[] = [];

  // ID 열 헤더 보장
  if (header.idCol == null) {
    idWriteBack.push({ range: `${title}!${idColLetter}${HEADER_ROW}`, values: [[ID_HEADER]] });
  }

  // rowNumber → SheetRow 빠른 조회
  const srByRow = new Map<number, (typeof sheetRows)[number]>();
  for (const sr of sheetRows) srByRow.set(sr.rowNumber, sr);

  for (const pr of plan.pull.rows) {
    const sr = srByRow.get(pr.rowNumber);
    if (!sr) continue;

    if (pr.action === 'create') {
      const payload: Record<string, unknown> = { status: '잠재', synced_at: now };
      const snapVals: Partial<Record<DirectoryField, string | null>> = {};
      for (const u of pr.updates) {
        payload[u.field] = u.sheetValue;
        snapVals[u.field] = u.sheetValue;
      }
      if (!payload.name) continue; // 안전망
      // 신규 행은 시트값이 곧 baseline → synced_snapshot 초기화(백업 없음).
      payload.synced_snapshot = buildSnapshot(snapVals);
      const { data, error } = await supabase
        .from('partner_directory')
        .insert(payload)
        .select('id')
        .single();
      if (error) throw new SyncError(describeSupabaseError(error));
      const newId = (data as { id: string }).id;
      // sheet_row_id 동기화
      await supabase
        .from('partner_directory')
        .update({ sheet_row_id: newId, synced_at: now })
        .eq('id', newId);
      idWriteBack.push({
        range: `${title}!${idColLetter}${pr.rowNumber}`,
        values: [[newId]],
      });
      created += 1;
      continue;
    }

    if (pr.action === 'conflict' || pr.action === 'update') {
      const db = pr.id ? dirById.get(pr.id) : undefined;
      const allFieldDiffs = [...pr.updates, ...pr.conflicts];

      // 충돌은 시트 최신 우선으로 자동 적용. 진 쪽(DB) 값 백업.
      for (const c of pr.conflicts) {
        conflicts.push({
          name: pr.name,
          id: pr.id,
          field: c.field,
          dbValue: c.dbValue,
          sheetValue: c.sheetValue,
          action: 'resolved-latest-wins',
        });
      }

      if (pr.id && allFieldDiffs.length > 0) {
        const payload: Record<string, unknown> = {
          updated_at: now,
          synced_at: now,
          sheet_row_id: pr.id,
        };
        // 모든 변경 필드(충돌 포함)를 시트값으로 적용.
        for (const u of allFieldDiffs) {
          payload[u.field] = u.resolvedValue ?? u.sheetValue;
          // non-empty 이전 값 덮어쓰기 → 백업.
          if (u.loserValue != null) {
            backups.push({
              runId,
              directoryId: pr.id,
              field: u.field,
              oldValue: u.loserValue,
              newValue: (u.resolvedValue ?? u.sheetValue) ?? null,
              source: 'pull',
              reason: u.reason ?? (u.conflict ? 'conflict-latest-wins' : 'overwrite'),
            });
          }
        }
        // baseline 갱신: 적용 후 (DB == 시트) 인 상태의 스냅샷.
        const newSnap = db?.synced_snapshot ? { ...db.synced_snapshot } : {};
        for (const field of SYNC_FIELDS) {
          // 이번에 변경된 필드는 시트값, 아니면 현재 DB값을 baseline 으로.
          const applied = allFieldDiffs.find((u) => u.field === field);
          if (applied) newSnap[field] = (applied.resolvedValue ?? applied.sheetValue) ?? null;
          else {
            const cur = db ? ((db[field] as string | null) ?? null) : null;
            newSnap[field] = cur;
          }
        }
        payload.synced_snapshot = newSnap;

        const { error } = await supabase
          .from('partner_directory')
          .update(payload)
          .eq('id', pr.id);
        if (error) throw new SyncError(describeSupabaseError(error));
        updated += 1;
      } else if (pr.id) {
        // 변경은 없지만 synced_at / 스냅샷 정착(매칭 확정 시각)
        const snapPayload: Record<string, unknown> = { synced_at: now, sheet_row_id: pr.id };
        if (db && db.synced_snapshot == null) {
          // baseline 미초기화 → 현재값으로 초기화(백업 없음).
          const snapVals: Partial<Record<DirectoryField, string | null>> = {};
          for (const field of SYNC_FIELDS) snapVals[field] = (db[field] as string | null) ?? null;
          snapPayload.synced_snapshot = buildSnapshot(snapVals);
        }
        await supabase.from('partner_directory').update(snapPayload).eq('id', pr.id);
      }
    }

    // ID 열이 비어있던 매칭 행 → id write-back
    if (pr.id && (header.idCol == null || !sr.id)) {
      idWriteBack.push({
        range: `${title}!${idColLetter}${pr.rowNumber}`,
        values: [[pr.id]],
      });
    }
  }

  // noop(동일) 행도 ID 열이 비어 있으면 write-back (안정 키 정착) + 스냅샷 초기화
  for (const pr of plan.pull.rows) {
    if (pr.action !== 'noop' || !pr.id) continue;
    const sr = srByRow.get(pr.rowNumber);
    if (sr && (header.idCol == null || !sr.id)) {
      idWriteBack.push({ range: `${title}!${idColLetter}${pr.rowNumber}`, values: [[pr.id]] });
    }
    // baseline 미초기화 행이면 현재값으로 스냅샷 초기화(백업 없음).
    const db = dirById.get(pr.id);
    if (db && db.synced_snapshot == null) {
      const snapVals: Partial<Record<DirectoryField, string | null>> = {};
      for (const field of SYNC_FIELDS) snapVals[field] = (db[field] as string | null) ?? null;
      await supabase
        .from('partner_directory')
        .update({ synced_snapshot: buildSnapshot(snapVals), synced_at: now })
        .eq('id', pr.id);
    }
  }

  // write-back: 행/셀 단위 batch (전체 클리어 없음)
  if (idWriteBack.length > 0) {
    await batchWriteRanges(idWriteBack);
  }

  // 백업 일괄 기록
  await writeBackups(backups);

  return {
    created,
    updated,
    conflicts,
    details: conflicts,
    backups: backups.length,
    runId,
  };
}

// ---------- 적용: PUSH (DB → 시트) ----------
// DB 변경분을 해당 시트 행의 해당 셀만 갱신. push 는 DB 최신 정책(last-write-wins).
//   - 충돌(시트도 변경됨) → DB값으로 자동 적용하되, 덮어쓰는 시트 이전값을 백업.
//   - opts.force 가 false(자동 both 경로)이고 변경 셀 합이 BULK_LIMIT 초과면 쓰기 없이 중단.
export async function applyPush(opts: { force?: boolean } = {}): Promise<ApplyResult> {
  const { header, title, rows: sheetRows } = await readSheet();
  const dirRows = await readDirectory();

  if (header.idCol == null) {
    throw new SyncError(
      '시트에 ID 열이 없습니다. 먼저 pull 을 실행해 ID 열을 생성/매핑한 뒤 push 하세요.',
    );
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const runId = randomUUID();

  const sheetRowByDbId = new Map<string, (typeof sheetRows)[number]>();
  for (const sr of sheetRows) if (sr.id) sheetRowByDbId.set(sr.id, sr);

  // ---- 변경 셀 계산(가드용 사전 집계 겸 적용 목록) ----
  interface PushCell {
    db: PartnerDirectoryRow;
    sr: SheetRow;
    field: DirectoryField;
    col: number;
    dbValue: string | null;
    sheetValue: string | null;
    conflict: boolean; // 시트도 baseline 대비 변경됨
  }
  const cells: PushCell[] = [];

  for (const db of dirRows) {
    const sr = sheetRowByDbId.get(db.id);
    if (!sr) continue;
    if (!dbChangedSinceSync(db)) continue;

    const snapshot = db.synced_snapshot ?? null;
    for (const field of SYNC_FIELDS) {
      const col = header.fieldCol[field];
      if (col === undefined) continue; // 시트에 해당 열 없음
      const dbValue = (db[field] as string | null) ?? null;
      const sheetValue = sr.values[field] ?? null;
      if (norm(dbValue) === norm(sheetValue)) continue;

      // 시트가 baseline 대비 변경됐고 non-empty 면 충돌(양쪽 변경). DB 우선 적용 + 시트값 백업.
      const base = snapValue(snapshot, field);
      const sheetChanged = snapshot == null || norm(sheetValue) !== norm(base);
      const conflict = sheetChanged && norm(sheetValue) !== '';
      cells.push({ db, sr, field, col, dbValue, sheetValue, conflict });
    }
  }

  // ---- 대량변경 가드 (force 아닐 때만) ----
  if (!opts.force && cells.length > BULK_LIMIT) {
    return guardTripped(cells.length);
  }

  const writes: { range: string; values: (string | number)[][] }[] = [];
  const conflicts: ConflictDetail[] = [];
  const backups: BackupEntry[] = [];
  const syncedIds = new Set<string>();

  for (const c of cells) {
    // 덮어쓰는 시트값이 non-empty 면 백업(충돌이면 conflict, 아니면 overwrite).
    if (norm(c.sheetValue) !== '') {
      backups.push({
        runId,
        directoryId: c.db.id,
        field: c.field,
        oldValue: c.sheetValue,
        newValue: c.dbValue,
        source: 'push',
        reason: c.conflict ? 'conflict-latest-wins' : 'overwrite',
      });
    }
    if (c.conflict) {
      conflicts.push({
        name: c.db.name,
        id: c.db.id,
        field: c.field,
        dbValue: c.sheetValue, // 진 쪽(덮어쓴 시트 값)
        sheetValue: c.dbValue, // 이긴 값(적용된 DB 값)
        action: 'resolved-latest-wins',
      });
    }
    const cell = colToA1(c.col);
    writes.push({
      range: `${title}!${cell}${c.sr.rowNumber}`,
      values: [[valueToCell(c.dbValue)]],
    });
    syncedIds.add(c.db.id);
  }

  if (writes.length > 0) {
    await batchWriteRanges(writes);
  }
  await writeBackups(backups);

  // 실제 push 된 행: synced_at + synced_snapshot(적용 후 시트=DB 상태) 갱신.
  const updated = syncedIds.size;
  for (const id of syncedIds) {
    const db = dirRows.find((d) => d.id === id);
    if (!db) continue;
    const snapVals: Partial<Record<DirectoryField, string | null>> = {};
    for (const field of SYNC_FIELDS) snapVals[field] = (db[field] as string | null) ?? null;
    const { error } = await supabase
      .from('partner_directory')
      .update({ synced_at: now, synced_snapshot: buildSnapshot(snapVals) })
      .eq('id', id);
    if (error) throw new SyncError(describeSupabaseError(error));
  }

  return { created: 0, updated, conflicts, details: conflicts, backups: backups.length, runId };
}

// ---------- 단일 행 push / append (저장 즉시 시트 반영용) ----------
//
// 디렉토리 생성/수정 API 가 DB 커밋 후 best-effort 로 호출한다.
//   - pushRow: 기존 시트 행(ID 매칭)의 변경 셀만 갱신.
//   - appendRow: 시트에 대응 행이 없을 때 표 맨 아래에 새 행 추가(+ ID 열 기록).
// 두 함수 모두:
//   - status 가 '잠재' | '협력' 인 행만 처리. 그 외(사업 등)는 조용히 skip (didWrite=false).
//   - 시트 ID 열이 없으면 skip(전체 pull 로 ID 열을 먼저 정착시켜야 함).
//   - 절대 다른 행/탭을 건드리지 않는다. append 는 INSERT_ROWS 로 기존 행 보존.

// 시트 연동 대상 상태 (잠재 DB 시트는 잠재/협력 단계 파트너만 대응).
const SHEET_LINKED_STATUSES: ReadonlySet<string> = new Set(['잠재', '협력']);

export interface RowSyncResult {
  didWrite: boolean; // 실제로 시트에 쓰기를 했는지
  reason?: string; // skip 사유(로깅용)
}

// id 로 디렉토리 단건 조회 (status 무관).
async function readDirectoryById(id: string): Promise<PartnerDirectoryRow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('partner_directory')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new SyncError(describeSupabaseError(error));
  return (data as PartnerDirectoryRow | null) ?? null;
}

// 디렉토리 행(잠재/협력)을 시트의 기존 대응 행에 셀 단위로 push.
// DB 가 방금 저장된 단일 편집의 권한원천이므로, 이 경로는 충돌 머지 없이
// 변경된 셀만 DB 값으로 덮어쓴다(저장 즉시 반영 목적). 다른 셀/행은 손대지 않음.
export async function pushRow(id: string): Promise<RowSyncResult> {
  const db = await readDirectoryById(id);
  if (!db) return { didWrite: false, reason: 'not-found' };
  if (!SHEET_LINKED_STATUSES.has(db.status)) {
    return { didWrite: false, reason: `status=${db.status} (시트 미연동)` };
  }

  const { header, title, rows: sheetRows } = await readSheet();
  if (header.idCol == null) {
    return { didWrite: false, reason: 'no-id-column' };
  }

  // 시트 행 찾기: sheet_row_id 우선, 없으면 id 로 ID 열 매칭.
  const key = db.sheet_row_id ?? db.id;
  const sr = sheetRows.find((r) => r.id && r.id === key);
  if (!sr) {
    // 시트에 대응 행 없음 → push 불가(여기서 append 하지 않음. 호출부가 생성 경로에서 append 사용).
    return { didWrite: false, reason: 'row-not-in-sheet' };
  }

  const writes: { range: string; values: (string | number)[][] }[] = [];
  const backups: BackupEntry[] = [];
  const runId = randomUUID();
  const snapshot = db.synced_snapshot ?? null;
  for (const field of SYNC_FIELDS) {
    const col = header.fieldCol[field];
    if (col === undefined) continue; // 시트에 해당 열 없음
    const dbValue = (db[field] as string | null) ?? null;
    const sheetValue = sr.values[field] ?? null;
    if (norm(dbValue) === norm(sheetValue)) continue; // 동일 → skip
    // 시트의 기존 값이 DB와 다르고 non-empty 면 덮어쓰기 전에 백업(push=DB 최신 정책 유지).
    if (norm(sheetValue) !== '') {
      const base = snapValue(snapshot, field);
      const sheetChanged = snapshot == null || norm(sheetValue) !== norm(base);
      backups.push({
        runId,
        directoryId: db.id,
        field,
        oldValue: sheetValue,
        newValue: dbValue,
        source: 'push',
        reason: sheetChanged ? 'conflict-latest-wins' : 'overwrite',
      });
    }
    const cell = colToA1(col);
    writes.push({ range: `${title}!${cell}${sr.rowNumber}`, values: [[valueToCell(dbValue)]] });
  }

  if (writes.length === 0) {
    // 변경 셀 없음 — 매핑/시각/스냅샷만 정착.
    await touchSynced(id, sr.id ?? db.id, db);
    return { didWrite: false, reason: 'no-diff' };
  }

  await batchWriteRanges(writes);
  await writeBackups(backups);
  await touchSynced(id, sr.id ?? db.id, db);
  return { didWrite: true };
}

// 디렉토리 행(잠재/협력)을 시트 표 맨 아래에 새 행으로 append.
//   - 헤더 레이아웃에 따라 각 필드를 해당 열에 배치, ID 열에는 db.id 기록.
//   - INSERT_ROWS append → 기존 행/다른 탭 불변.
//   - 성공 시 sheet_row_id=db.id, synced_at 갱신.
export async function appendRow(id: string): Promise<RowSyncResult> {
  const db = await readDirectoryById(id);
  if (!db) return { didWrite: false, reason: 'not-found' };
  if (!SHEET_LINKED_STATUSES.has(db.status)) {
    return { didWrite: false, reason: `status=${db.status} (시트 미연동)` };
  }

  const { header, title, rows: sheetRows } = await readSheet();
  if (header.idCol == null) {
    return { didWrite: false, reason: 'no-id-column' };
  }

  // 이미 시트에 대응 행이 있으면 append 대신 push 로 위임(중복 방지).
  const existingKey = db.sheet_row_id ?? db.id;
  if (sheetRows.some((r) => r.id && r.id === existingKey)) {
    return pushRow(id);
  }

  // 헤더에서 ID 열 + 매핑된 필드 열들의 최대 인덱스까지 배열 구성.
  const maxCol = Math.max(
    header.idCol,
    ...Object.values(header.fieldCol).filter((v): v is number => v !== undefined),
  );
  const rowArr: string[] = new Array(maxCol + 1).fill('');
  for (const field of SYNC_FIELDS) {
    const col = header.fieldCol[field];
    if (col === undefined) continue;
    rowArr[col] = valueToCell((db[field] as string | null) ?? null);
  }
  rowArr[header.idCol] = db.id;

  // append 기준 범위: 헤더 행(표 인식용). INSERT_ROWS 로 표 끝 다음 행에 추가됨.
  const lastColLetter = colToA1(maxCol);
  const appendRange = `${title}!A${HEADER_ROW}:${lastColLetter}${HEADER_ROW}`;
  await appendRows(appendRange, [rowArr]);

  await touchSynced(id, db.id, db);
  return { didWrite: true };
}

// sheet_row_id / synced_at / synced_snapshot 갱신 (push/append 후 매핑·시각·baseline 정착).
//   - db 를 넘기면 그 시점의 필드값으로 synced_snapshot 을 새로 기록(시트=DB 상태의 baseline).
async function touchSynced(
  id: string,
  sheetRowId: string,
  db?: PartnerDirectoryRow,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const payload: Record<string, unknown> = {
    sheet_row_id: sheetRowId,
    synced_at: new Date().toISOString(),
  };
  if (db) {
    const snapVals: Partial<Record<DirectoryField, string | null>> = {};
    for (const field of SYNC_FIELDS) snapVals[field] = (db[field] as string | null) ?? null;
    payload.synced_snapshot = buildSnapshot(snapVals);
  }
  const { error } = await supabase.from('partner_directory').update(payload).eq('id', id);
  if (error) throw new SyncError(describeSupabaseError(error));
}

// 생성/수정 공용 진입점: 시트 대응 행이 있으면 push, 없으면 append.
// best-effort — 실패는 호출부에서 swallow(저장은 이미 성공). 여기서는 예외를 그대로 던진다.
export async function syncRowToSheet(id: string): Promise<RowSyncResult> {
  const db = await readDirectoryById(id);
  if (!db) return { didWrite: false, reason: 'not-found' };
  if (!SHEET_LINKED_STATUSES.has(db.status)) {
    return { didWrite: false, reason: `status=${db.status} (시트 미연동)` };
  }
  const { header, rows: sheetRows } = await readSheet();
  if (header.idCol == null) return { didWrite: false, reason: 'no-id-column' };
  const key = db.sheet_row_id ?? db.id;
  if (sheetRows.some((r) => r.id && r.id === key)) {
    return pushRow(id);
  }
  return appendRow(id);
}

// ---------- sync_log 기록 ----------

export async function writeSyncLog(params: {
  runBy: string | null;
  direction: 'pull' | 'push' | 'both' | 'dryrun';
  created: number;
  updated: number;
  conflicts: number;
  details: unknown;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('sync_log').insert({
    run_by: params.runBy,
    direction: params.direction,
    created_count: params.created,
    updated_count: params.updated,
    conflict_count: params.conflicts,
    details: params.details ?? null,
  });
  if (error) {
    // 로그 실패가 동기화 자체를 깨뜨리지 않게 — 콘솔만.
    console.error('[sheet-sync] sync_log 기록 실패:', describeSupabaseError(error));
  }
}

// SheetsError 도 SyncError 처럼 상위에서 메시지 노출 가능하도록 재노출
export { SheetsError };
