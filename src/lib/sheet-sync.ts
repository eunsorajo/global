// 서버 전용 — Google Sheets("1-1. 잠재 파트너사 DB") ↔ Supabase(partner_directory)
// 양방향 동기화 로직 (매핑 / 충돌 / upsert).
//
// 안정 매핑 키:
//   - 시트 데이터 영역 오른쪽 끝 "ID" 열에 partner_directory.id 를 저장.
//   - 위치 기반 매칭 금지. ID 열로 시트행↔DB행 매칭.
//   - ID 없는 시트행 → DB 신규 생성(또는 name+country 매칭 시 연결) → 그 id 를 ID 열에 write-back.
//
// 충돌 정책:
//   - 필드별로 판단. DB updated_at 과 synced_at, 시트값을 비교.
//   - 양쪽 모두 마지막 동기화 이후 바뀌었고 값이 다르면 → 자동 머지 금지.
//     sync_log 에 기록하고 그 필드는 건너뜀(데이터 유실 금지).
//   - 그 외(한쪽만 변경)에는 last-write-wins 가 아니라 "변경된 쪽" 값을 반영.
//
// 안전 원칙: 전체 시트 클리어/재작성 절대 금지. push 는 행/셀 단위로만 기록.
import 'server-only';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';
import {
  getTargetSheet,
  readRange,
  batchWriteRanges,
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
    const dbChanged = dbChangedSinceSync(db);

    const updates: FieldDiff[] = [];
    const conflicts: FieldDiff[] = [];
    for (const field of SYNC_FIELDS) {
      const sheetValue = sr.values[field] ?? null;
      const dbValue = (db[field] as string | null) ?? null;
      if (norm(sheetValue) === norm(dbValue)) continue; // 동일 → 무시

      // 시트값 ≠ DB값. DB 도 마지막 동기화 이후 변경됐다면 → 충돌(양쪽 모두 변경 의심).
      if (dbChanged) {
        conflicts.push({ field, dbValue, sheetValue });
      } else {
        // DB 는 그대로(동기화 이후 미변경) → 시트가 변경된 것으로 보고 시트→DB 반영.
        updates.push({ field, dbValue, sheetValue });
      }
    }

    const action: ChangeAction =
      conflicts.length > 0 ? 'conflict' : updates.length > 0 ? 'update' : 'noop';
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
  conflicts: ConflictDetail[];
  details: ConflictDetail[];
}

export interface ConflictDetail {
  name: string;
  id: string | null;
  field: DirectoryField;
  dbValue: string | null;
  sheetValue: string | null;
  action: 'skipped-conflict';
}

// pull 적용: 신규 생성 / 변경 반영 / 충돌 기록(건너뜀) + ID 열 write-back.
//   - 시트에 ID 열이 없으면 헤더에 "ID" 추가 후 각 행 id 기록.
//   - synced_at 갱신, sheet_row_id 에 동일 id 저장.
export async function applyPull(): Promise<ApplyResult> {
  const { header, title, rows: sheetRows } = await readSheet();
  const dirRows = await readDirectory();
  const plan = await buildPlan();

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const conflicts: ConflictDetail[] = [];
  let created = 0;
  let updated = 0;

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
      for (const u of pr.updates) payload[u.field] = u.sheetValue;
      if (!payload.name) continue; // 안전망
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
      // 충돌 필드는 건너뛰고 sync_log 기록
      for (const c of pr.conflicts) {
        conflicts.push({
          name: pr.name,
          id: pr.id,
          field: c.field,
          dbValue: c.dbValue,
          sheetValue: c.sheetValue,
          action: 'skipped-conflict',
        });
      }
      // 비충돌 변경 필드만 반영
      if (pr.updates.length > 0 && pr.id) {
        const payload: Record<string, unknown> = {
          updated_at: now,
          synced_at: now,
          sheet_row_id: pr.id,
        };
        for (const u of pr.updates) payload[u.field] = u.sheetValue;
        const { error } = await supabase
          .from('partner_directory')
          .update(payload)
          .eq('id', pr.id);
        if (error) throw new SyncError(describeSupabaseError(error));
        updated += 1;
      } else if (pr.id) {
        // 변경은 없지만 synced_at 갱신(매칭 확정 시각)
        await supabase
          .from('partner_directory')
          .update({ synced_at: now, sheet_row_id: pr.id })
          .eq('id', pr.id);
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

  // noop(동일) 행도 ID 열이 비어 있으면 write-back (안정 키 정착)
  for (const pr of plan.pull.rows) {
    if (pr.action !== 'noop' || !pr.id) continue;
    const sr = srByRow.get(pr.rowNumber);
    if (sr && (header.idCol == null || !sr.id)) {
      idWriteBack.push({ range: `${title}!${idColLetter}${pr.rowNumber}`, values: [[pr.id]] });
    }
  }

  // write-back: 행/셀 단위 batch (전체 클리어 없음)
  if (idWriteBack.length > 0) {
    await batchWriteRanges(idWriteBack);
  }

  // dirRows 미사용 경고 회피(향후 검증 로직 확장 여지)
  void dirRows;

  return { created, updated, conflicts, details: conflicts };
}

// ---------- 적용: PUSH (DB → 시트) ----------
// DB 변경분을 해당 시트 행의 해당 셀만 갱신. 충돌(양쪽 변경)은 건너뛰고 기록.

export async function applyPush(): Promise<ApplyResult> {
  const { header, title, rows: sheetRows } = await readSheet();
  const dirRows = await readDirectory();

  if (header.idCol == null) {
    throw new SyncError(
      '시트에 ID 열이 없습니다. 먼저 pull 을 실행해 ID 열을 생성/매핑한 뒤 push 하세요.',
    );
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const sheetRowByDbId = new Map<string, (typeof sheetRows)[number]>();
  for (const sr of sheetRows) if (sr.id) sheetRowByDbId.set(sr.id, sr);

  const writes: { range: string; values: (string | number)[][] }[] = [];
  const conflicts: ConflictDetail[] = [];
  const syncedIds: string[] = [];
  let updated = 0;

  for (const db of dirRows) {
    const sr = sheetRowByDbId.get(db.id);
    if (!sr) continue;
    if (!dbChangedSinceSync(db)) continue;

    let wroteAny = false;
    for (const field of SYNC_FIELDS) {
      const col = header.fieldCol[field];
      if (col === undefined) continue; // 시트에 해당 열 없음
      const dbValue = (db[field] as string | null) ?? null;
      const sheetValue = sr.values[field] ?? null;
      if (norm(dbValue) === norm(sheetValue)) continue;

      // 충돌 검사: 시트값이 (마지막 동기화 시점의) DB 값과도 다르면 양쪽 변경 의심.
      // synced_at 이후 시트 편집 메타가 없어, 보수적으로:
      //   DB 변경 && 시트값이 비어있지 않고 DB와 다름 → 충돌 후보.
      // 단, 시트값이 비어있으면(미입력) DB→시트 채움은 안전하므로 그대로 push.
      if (sheetValue != null && norm(sheetValue) !== '') {
        // 양쪽 모두 값이 있고 다름 → 충돌로 기록, push 건너뜀(데이터 유실 금지)
        conflicts.push({
          name: db.name,
          id: db.id,
          field,
          dbValue,
          sheetValue,
          action: 'skipped-conflict',
        });
        continue;
      }

      const cell = colToA1(col);
      writes.push({
        range: `${title}!${cell}${sr.rowNumber}`,
        values: [[valueToCell(dbValue)]],
      });
      wroteAny = true;
    }
    if (wroteAny) {
      updated += 1;
      syncedIds.push(db.id);
    }
  }

  if (writes.length > 0) {
    await batchWriteRanges(writes);
  }
  // 실제 push 된 행만 synced_at 갱신 (충돌만 있던 행은 미갱신 → 다음에도 감지)
  if (syncedIds.length > 0) {
    const { error } = await supabase
      .from('partner_directory')
      .update({ synced_at: now })
      .in('id', syncedIds);
    if (error) throw new SyncError(describeSupabaseError(error));
  }

  return { created: 0, updated, conflicts, details: conflicts };
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
