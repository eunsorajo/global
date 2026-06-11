// 회의록 엑셀(.xlsx) 양식 생성 / 업로드 파싱.
// exceljs 사용. 서버 라우트에서만 호출.
import 'server-only';
import ExcelJS from 'exceljs';
import { normalizeDate } from '@/lib/meeting-parser';
import type { ParsedMeeting, ParsedFollowup } from '@/types/meeting';

export const MAX_XLSX_BYTES = 5 * 1024 * 1024; // 5MB
// 조작된 파일이 rowCount 를 과대 선언해도 루프가 폭주하지 않게 스캔 상한을 둔다.
const MAX_SCAN_ROWS = 2000;

const MEETING_HEADERS = ['파트너명', '회의일', '제목', '참석자', '요약', '핵심사항', '결정사항'] as const;
const FOLLOWUP_HEADERS = ['내용', '담당자', '기한'] as const;

// 셀 값을 안전하게 문자열로
function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v).trim();
  if (v instanceof Date) {
    // exceljs 는 날짜 셀을 UTC 자정 기준 Date 로 파싱한다 — 로컬 getter 를 쓰면
    // 음수 오프셋 타임존 서버에서 하루 밀리므로 UTC getter 로 읽는다.
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // RichText / Formula 등
  const obj = v as { text?: string; result?: unknown; richText?: { text: string }[] };
  if (typeof obj.text === 'string') return obj.text.trim();
  if (Array.isArray(obj.richText)) return obj.richText.map((r) => r.text).join('').trim();
  if (obj.result !== undefined && obj.result !== null) return String(obj.result).trim();
  return '';
}

// 줄바꿈/콤마/세미콜론으로 구분된 셀을 리스트로
function splitMultiline(text: string): string[] {
  return text
    .split(/\r?\n|;/)
    .map((s) => s.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

// 양식 .xlsx 생성 → Buffer
export async function buildTemplateWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Partner Network';
  wb.created = new Date();

  // --- 회의록 시트 ---
  const ws = wb.addWorksheet('회의록');
  ws.addRow(['※ 안내: 1행은 헤더입니다(수정 금지). 2행은 예시이며 지우고 작성하세요. 회의일/기한은 YYYY-MM-DD 형식. 민감정보(연락처·계약금액 등)는 제외하세요.']);
  ws.mergeCells(1, 1, 1, MEETING_HEADERS.length);
  ws.getRow(1).font = { italic: true, color: { argb: 'FF888888' } };

  const headerRow = ws.addRow([...MEETING_HEADERS]);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
  });

  ws.addRow([
    '에이펙스 로지스틱스',
    '2026-05-20',
    '1차 파트너십 협의',
    '홍길동, 김철수',
    '동남아 물류 허브 공동 운영 방안 논의. 다음 달 MOU 초안 공유 예정.',
    '수익 배분 모델 협의\n운영 범위 확정 필요',
    'MOU 초안 5월 말까지 공유',
  ]);

  ws.columns.forEach((col) => {
    col.width = 24;
  });

  // --- 팔로업 시트 ---
  const fws = wb.addWorksheet('팔로업');
  fws.addRow(['※ 안내: 위 회의록 1건에 대한 후속 작업을 적습니다. 기한은 YYYY-MM-DD 형식. 1행은 헤더(수정 금지), 2행 예시는 지우고 작성.']);
  fws.mergeCells(1, 1, 1, FOLLOWUP_HEADERS.length);
  fws.getRow(1).font = { italic: true, color: { argb: 'FF888888' } };

  const fHeader = fws.addRow([...FOLLOWUP_HEADERS]);
  fHeader.font = { bold: true };
  fHeader.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
  });
  fws.addRow(['물류 허브 후보지 3곳 현장 실사 일정 조율', '이수진', '2026-06-01']);
  fws.columns.forEach((col) => {
    col.width = 32;
  });

  const arr = await wb.xlsx.writeBuffer();
  return Buffer.from(arr);
}

// 업로드된 .xlsx 파싱 → ParsedMeeting (첫 데이터 행 1건 기준)
export async function parseUploadedWorkbook(
  buffer: Buffer,
  partners: { id: string; name: string }[],
): Promise<ParsedMeeting> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  const warnings: string[] = [];

  // 회의록 시트: 이름 우선, 없으면 첫 시트
  const ws = wb.getWorksheet('회의록') ?? wb.worksheets[0];
  if (!ws) {
    return emptyParsed(['엑셀에서 시트를 찾을 수 없습니다.']);
  }

  // 헤더 행(파트너명이 들어있는 행)을 찾고, 헤더 텍스트 → 실제 열 번호 맵을 만든다.
  // 열 번호를 고정(1~7)하지 않아 사용자가 열을 추가/재배열해도 어긋나지 않는다.
  let headerRowNum = 0;
  ws.eachRow((row, rowNum) => {
    if (headerRowNum) return;
    const vals = (row.values as ExcelJS.CellValue[]).map(cellText);
    if (vals.some((v) => v.replace(/\s+/g, '') === '파트너명')) headerRowNum = rowNum;
  });
  if (!headerRowNum) {
    return emptyParsed(['회의록 시트에서 헤더(파트너명 ...)를 찾지 못했습니다. 제공된 양식을 사용해주세요.']);
  }

  // 헤더 텍스트 → 열 번호 (1-based). 공백 제거 후 비교.
  const colByHeader = new Map<string, number>();
  ws.getRow(headerRowNum).eachCell({ includeEmpty: false }, (cell, colNum) => {
    const key = cellText(cell.value).replace(/\s+/g, '');
    if (key && !colByHeader.has(key)) colByHeader.set(key, colNum);
  });
  const missing = MEETING_HEADERS.filter((h) => !colByHeader.has(h.replace(/\s+/g, '')));
  if (missing.length > 0) {
    warnings.push(`헤더에서 찾지 못한 열: ${missing.join(', ')} — 해당 항목은 비워집니다.`);
  }

  // 헤더 다음의 첫 비어있지 않은 데이터 행 (스캔 상한 적용)
  let dataRow: ExcelJS.Row | null = null;
  const lastScanRow = Math.min(ws.rowCount, headerRowNum + MAX_SCAN_ROWS);
  for (let r = headerRowNum + 1; r <= lastScanRow; r++) {
    const row = ws.getRow(r);
    const vals = (row.values as ExcelJS.CellValue[]).map(cellText);
    if (vals.some((v) => v)) {
      dataRow = row;
      break;
    }
  }
  if (!dataRow) return emptyParsed(['회의록 데이터 행이 비어 있습니다.']);

  const get = (header: (typeof MEETING_HEADERS)[number]) => {
    const col = colByHeader.get(header.replace(/\s+/g, ''));
    return col ? cellText(dataRow!.getCell(col).value) : '';
  };
  const partnerName = get('파트너명') || null;
  const meetingDate = normalizeDate(get('회의일'));
  const title = get('제목');
  const attendees = get('참석자') || null;
  const summary = get('요약') || null;
  const keyPoints = splitMultiline(get('핵심사항'));
  const decisions = splitMultiline(get('결정사항'));

  // 팔로업 시트 — 동일하게 헤더 텍스트로 열을 찾는다.
  const followups: ParsedFollowup[] = [];
  const fws = wb.getWorksheet('팔로업');
  if (fws) {
    let fHeaderNum = 0;
    fws.eachRow((row, rowNum) => {
      if (fHeaderNum) return;
      const vals = (row.values as ExcelJS.CellValue[]).map(cellText);
      if (vals.some((v) => v.replace(/\s+/g, '') === '내용')) fHeaderNum = rowNum;
    });
    if (fHeaderNum) {
      const fColByHeader = new Map<string, number>();
      fws.getRow(fHeaderNum).eachCell({ includeEmpty: false }, (cell, colNum) => {
        const key = cellText(cell.value).replace(/\s+/g, '');
        if (key && !fColByHeader.has(key)) fColByHeader.set(key, colNum);
      });
      const fGet = (row: ExcelJS.Row, header: (typeof FOLLOWUP_HEADERS)[number]) => {
        const col = fColByHeader.get(header.replace(/\s+/g, ''));
        return col ? cellText(row.getCell(col).value) : '';
      };
      const fLastScanRow = Math.min(fws.rowCount, fHeaderNum + MAX_SCAN_ROWS);
      for (let r = fHeaderNum + 1; r <= fLastScanRow; r++) {
        const row = fws.getRow(r);
        const content = fGet(row, '내용');
        if (!content) continue;
        followups.push({
          content,
          assignee: fGet(row, '담당자') || null,
          dueDate: normalizeDate(fGet(row, '기한')),
        });
      }
    }
  }

  // 매칭
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  let matchedPartnerId: string | null = null;
  if (partnerName) {
    const hit = partners.find((p) => norm(p.name) === norm(partnerName));
    matchedPartnerId = hit?.id ?? null;
  }

  if (!partnerName) warnings.push('파트너명이 비어 있습니다. 직접 선택해주세요.');
  else if (!matchedPartnerId) warnings.push(`"${partnerName}" 파트너를 DB에서 찾지 못했습니다. 직접 선택해주세요.`);
  if (!title) warnings.push('제목이 비어 있습니다. (저장 시 필수)');
  if (!meetingDate && get('회의일')) warnings.push('회의일 형식을 인식하지 못했습니다. (YYYY-MM-DD 권장)');

  return {
    partnerName,
    matchedPartnerId,
    meetingDate,
    title,
    attendees,
    summary,
    keyPoints,
    decisions,
    followups,
    rawNotes: null,
    warnings,
  };
}

function emptyParsed(warnings: string[]): ParsedMeeting {
  return {
    partnerName: null,
    matchedPartnerId: null,
    meetingDate: null,
    title: '',
    attendees: null,
    summary: null,
    keyPoints: [],
    decisions: [],
    followups: [],
    rawNotes: null,
    warnings,
  };
}
