// 서버 전용 Google Sheets REST 헬퍼.
//
// 'server-only' import 로 클라이언트 번들 유입 차단(서비스계정 키 보호).
// googleapis 미설치 → google-auth-library 의 JWT 로 인증 후 Sheets REST v4 를
// fetch/client.request 로 직접 호출한다. (scripts/test-sheets.mjs 패턴 재사용)
//
// 안전 원칙:
//   - 절대 시트 전체 클리어/재작성 금지. 항상 범위/셀 단위 PUT 또는 batchUpdate.
//   - 이 모듈은 "읽기/쓰기 저수준 헬퍼"만 제공. 매핑/충돌 로직은 sheet-sync.ts.
import 'server-only';
import { JWT } from 'google-auth-library';

// 대상 탭: "1-1. 잠재 파트너사 DB" (gid 69228100).
// 1행은 비어있고 2행이 헤더, 3행부터 데이터.
export const TARGET_GID = 69228100;
export const HEADER_ROW = 2; // 헤더가 있는 행 번호 (1-based)
export const DATA_START_ROW = 3; // 첫 데이터 행 번호 (1-based)

// 시트에 추가할 안정 매핑 키 컬럼의 헤더 텍스트.
export const ID_HEADER = 'ID';

let _client: JWT | null = null;

// 서비스계정 JWT (싱글톤). GOOGLE_CREDENTIALS_B64(base64 JSON) 사용.
function getClient(): JWT {
  if (_client) return _client;
  const b64 = process.env.GOOGLE_CREDENTIALS_B64;
  if (!b64) {
    throw new Error('GOOGLE_CREDENTIALS_B64 환경변수가 설정되지 않았습니다. (.env.local 확인)');
  }
  const creds = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  // private_key 의 이스케이프된 줄바꿈(\n)을 실제 개행으로 정규화 (PEM 디코딩용)
  const privateKey = String(creds.private_key).replace(/\\n/g, '\n');
  _client = new JWT({
    email: creds.client_email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return _client;
}

function getSheetId(): string {
  const id = process.env.GOOGLE_SHEETS_ID;
  if (!id) throw new Error('GOOGLE_SHEETS_ID 환경변수가 설정되지 않았습니다. (.env.local 확인)');
  return id;
}

function base(): string {
  return `https://sheets.googleapis.com/v4/spreadsheets/${getSheetId()}`;
}

export class SheetsError extends Error {}

// google-auth-library 의 request 에러를 한국어 메시지로 변환.
function wrap(e: unknown): never {
  const err = e as { response?: { status?: number; data?: { error?: { message?: string } } }; message?: string };
  const status = err.response?.status;
  const msg = err.response?.data?.error?.message || err.message || '알 수 없는 오류';
  console.error('[sheets]', status ?? '', msg);
  if (status === 403) {
    throw new SheetsError('Google Sheets 접근이 거부되었습니다. (서비스계정 공유 권한/편집자 여부 확인)');
  }
  if (status === 404) {
    throw new SheetsError('대상 스프레드시트를 찾을 수 없습니다. (GOOGLE_SHEETS_ID 확인)');
  }
  throw new SheetsError('Google Sheets 처리 중 오류가 발생했습니다.');
}

// 스프레드시트 메타데이터(탭 목록) 조회.
export interface SheetMeta {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
}

export async function getSheetMeta(): Promise<{ title: string; sheets: SheetMeta[] }> {
  const client = getClient();
  try {
    const r = await client.request<{
      properties?: { title?: string };
      sheets: { properties: { sheetId: number; title: string; gridProperties?: { rowCount?: number; columnCount?: number } } }[];
    }>({
      url: `${base()}?fields=properties.title,sheets.properties(sheetId,title,gridProperties)`,
    });
    const data = r.data;
    return {
      title: data.properties?.title ?? '',
      sheets: data.sheets.map((s) => ({
        sheetId: s.properties.sheetId,
        title: s.properties.title,
        rowCount: s.properties.gridProperties?.rowCount ?? 0,
        columnCount: s.properties.gridProperties?.columnCount ?? 0,
      })),
    };
  } catch (e) {
    wrap(e);
  }
}

// 대상 탭(TARGET_GID) 의 SheetMeta 를 반환. 없으면 에러.
export async function getTargetSheet(): Promise<SheetMeta> {
  const meta = await getSheetMeta();
  const target = meta.sheets.find((s) => s.sheetId === TARGET_GID);
  if (!target) {
    throw new SheetsError(`대상 탭(gid ${TARGET_GID})을 찾을 수 없습니다.`);
  }
  return target;
}

// 0-based 컬럼 인덱스 → A1 컬럼 문자 (0→A, 25→Z, 26→AA).
export function colToA1(index: number): string {
  let n = index;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

// 범위 값 읽기. A1 표기(탭명 포함) 그대로 받는다. 빈 범위면 [].
export async function readRange(rangeA1: string): Promise<string[][]> {
  const client = getClient();
  try {
    const r = await client.request<{ values?: string[][] }>({
      url: `${base()}/values/${encodeURIComponent(rangeA1)}`,
    });
    return r.data.values ?? [];
  } catch (e) {
    wrap(e);
  }
}

// 단일 범위 쓰기 (RAW). 전달 범위만 갱신 — 시트 전체를 건드리지 않는다.
export async function writeRange(rangeA1: string, values: (string | number)[][]): Promise<void> {
  const client = getClient();
  try {
    await client.request({
      url: `${base()}/values/${encodeURIComponent(rangeA1)}?valueInputOption=RAW`,
      method: 'PUT',
      data: { range: rangeA1, values },
    });
  } catch (e) {
    wrap(e);
  }
}

// 여러 개별 범위를 한 번에 쓰기 (batch). 각 항목의 range 만 갱신.
// 전체 클리어 없음 — 명시한 범위 외에는 변경되지 않는다.
export async function batchWriteRanges(
  updates: { range: string; values: (string | number)[][] }[],
): Promise<void> {
  if (updates.length === 0) return;
  const client = getClient();
  try {
    await client.request({
      url: `${base()}/values:batchUpdate`,
      method: 'POST',
      data: { valueInputOption: 'RAW', data: updates },
    });
  } catch (e) {
    wrap(e);
  }
}
