// KPI / 회의록 현황을 .xlsx 한 파일로 내보낸다.
// 시트1 전체 개요 + 파트너별 시트(KPI 정의 있는 파트너) + 회의록 시트.
// 서버 라우트에서만 호출 (exceljs).
import 'server-only';
import ExcelJS from 'exceljs';
import { getPartnerSummaries, getPartnerMatrix } from '@/lib/kpi-data';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';
import type { MeetingRow, FollowupRow } from '@/types/meeting';

export class KpiExportError extends Error {}

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFEFEFEF' },
};

function styleHeaderRow(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    };
  });
}

// 엑셀 시트 이름 제약: 31자 이하 + 특수문자(\ / ? * [ ] :) 금지 + 중복 불가
function safeSheetName(base: string, used: Set<string>): string {
  const name = base.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 28) || '시트';
  let candidate = name;
  let i = 2;
  while (used.has(candidate)) {
    candidate = `${name.slice(0, 25)}_${i}`;
    i += 1;
  }
  used.add(candidate);
  return candidate;
}

export function exportFileName(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `KPI현황_${kst.toISOString().slice(0, 10)}.xlsx`;
}

export async function buildKpiExportWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Partner Network';
  wb.created = new Date();

  const summaries = await getPartnerSummaries();

  // ===== 시트1: 전체 개요 =====
  const overview = wb.addWorksheet('전체 개요');
  const overviewHeader = overview.addRow([
    'No.',
    '국가',
    '파트너',
    '참여기업 수',
    '협약서 제출',
    'KPI 정의 수',
    '달성률(%)',
  ]);
  styleHeaderRow(overviewHeader);
  for (const s of summaries) {
    overview.addRow([
      s.no,
      s.country,
      s.name,
      s.companyCount,
      s.agreementSubmitted ? '제출' : '미제출',
      s.kpiCount,
      s.achievementRate === null ? '미정의' : s.achievementRate,
    ]);
  }
  overview.columns = [
    { width: 6 },
    { width: 14 },
    { width: 26 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
  ];
  overview.views = [{ state: 'frozen', ySplit: 1 }];

  // ===== 시트2~N: 파트너별 (KPI 정의된 파트너만) =====
  const usedNames = new Set<string>(['전체 개요']);
  // KPI 정의가 있는 파트너만 시트 생성
  const kpiPartners = summaries.filter((s) => s.kpiCount > 0);

  // 파트너별 매트릭스를 병렬 조회 — 순차 await(N+1) 시 13개 파트너 × 4쿼리가
  // 직렬로 쌓여 Vercel Hobby 함수 시간(기본 10초)을 위협한다.
  const matrices = await Promise.all(kpiPartners.map((s) => getPartnerMatrix(s.id)));

  for (let pi = 0; pi < kpiPartners.length; pi += 1) {
    const s = kpiPartners[pi];
    const matrix = matrices[pi];
    if (!matrix) continue;
    const { companies, kpiDefinitions, progress } = matrix;

    const sheetName = safeSheetName(`${s.no}.${s.name}`, usedNames);
    const ws = wb.addWorksheet(sheetName);

    // 헤더: 참여기업 + KPI별 (항목명 + 목표)
    const headerCells = ['참여기업'];
    for (const def of kpiDefinitions) {
      const target = def.target ? ` (목표: ${def.target})` : '';
      headerCells.push(`${def.name}${target}`);
    }
    headerCells.push('비고'); // 참여기업별 정성 메모
    const headerRow = ws.addRow(headerCells);
    styleHeaderRow(headerRow);

    // KPI별 달성 집계 (셀 단위)
    const achievedByDef = new Map<string, number>();
    const totalByDef = new Map<string, number>();

    if (companies.length > 0) {
      for (const company of companies) {
        const rowCells: (string | number)[] = [company.name];
        for (const def of kpiDefinitions) {
          const cell = progress[`${company.id}:${def.id}`];
          const cur = cell?.progressCurrent ?? null;
          const tgt = cell?.progressTarget ?? null;
          const achieved = cell?.achieved;
          const note = cell?.note?.trim() ?? '';
          const pct = tgt && tgt > 0 ? Math.round(((cur ?? 0) / tgt) * 100) : null;
          const quant = cur != null || tgt != null ? `${cur ?? 0}/${tgt ?? 0}${pct != null ? ` (${pct}%)` : ''}` : '';
          const mark = achieved === true ? ' ○달성' : achieved === false ? ' ×미달성' : pct != null ? ' 진행중' : '';
          let text = quant ? `${quant}${mark}` : mark.trim() || '-';
          if (note) text += `\n[비고] ${note}`;
          rowCells.push(text);

          totalByDef.set(def.id, (totalByDef.get(def.id) ?? 0) + 1);
          if (achieved === true) achievedByDef.set(def.id, (achievedByDef.get(def.id) ?? 0) + 1);
        }
        rowCells.push(company.note?.trim() || ''); // 참여기업별 비고
        const dataRow = ws.addRow(rowCells);
        dataRow.alignment = { vertical: 'top', wrapText: true }; // 비고 줄바꿈 표시
      }
    } else {
      // 참여기업이 없으면 파트너 레벨 KPI 달성여부만 표시
      const rowCells: (string | number)[] = ['(참여기업 미등록 — 파트너 레벨)'];
      for (const def of kpiDefinitions) {
        rowCells.push(def.achieved === true ? '○' : def.achieved === false ? '×' : '-');
      }
      ws.addRow(rowCells);
    }

    // 하단 KPI별 달성 집계 행
    if (companies.length > 0) {
      ws.addRow([]);
      const summaryCells: (string | number)[] = ['KPI별 달성 집계'];
      for (const def of kpiDefinitions) {
        const total = totalByDef.get(def.id) ?? 0;
        const achieved = achievedByDef.get(def.id) ?? 0;
        const rate = total > 0 ? Math.round((achieved / total) * 100) : 0;
        summaryCells.push(`${achieved}/${total} (${rate}%)`);
      }
      const summaryRow = ws.addRow(summaryCells);
      summaryRow.font = { bold: true };
      summaryRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F8FF' } };
      });
    }

    // 컬럼 너비
    ws.getColumn(1).width = 24;
    for (let c = 2; c <= kpiDefinitions.length + 1; c++) {
      ws.getColumn(c).width = 22;
    }
    ws.getColumn(kpiDefinitions.length + 2).width = 40; // 비고 열
    ws.getColumn(1).alignment = { vertical: 'middle' };
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
  }

  // ===== 회의록 시트 =====
  await addMeetingsSheet(wb, usedNames);

  const arr = await wb.xlsx.writeBuffer();
  return Buffer.from(arr);
}

async function addMeetingsSheet(wb: ExcelJS.Workbook, usedNames: Set<string>) {
  const supabase = getSupabaseAdmin();

  const [partnersRes, meetingsRes] = await Promise.all([
    supabase.from('partners').select('id, name'),
    supabase
      .from('meetings')
      .select('*')
      .order('meeting_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
  ]);
  if (partnersRes.error) throw new KpiExportError(describeSupabaseError(partnersRes.error));
  if (meetingsRes.error) throw new KpiExportError(describeSupabaseError(meetingsRes.error));

  const partnerName = new Map<string, string>();
  for (const p of (partnersRes.data ?? []) as { id: string; name: string }[]) {
    partnerName.set(p.id, p.name);
  }
  const meetings = (meetingsRes.data ?? []) as MeetingRow[];

  // 팔로업 일괄 조회
  const followupsByMeeting = new Map<string, FollowupRow[]>();
  if (meetings.length > 0) {
    const fuRes = await supabase
      .from('followups')
      .select('*')
      .in('meeting_id', meetings.map((m) => m.id));
    if (fuRes.error) throw new KpiExportError(describeSupabaseError(fuRes.error));
    for (const f of (fuRes.data ?? []) as FollowupRow[]) {
      const arr = followupsByMeeting.get(f.meeting_id) ?? [];
      arr.push(f);
      followupsByMeeting.set(f.meeting_id, arr);
    }
  }

  const ws = wb.addWorksheet(safeSheetName('회의록', usedNames));
  const header = ws.addRow(['파트너', '회의일', '제목', '요약', '팔로업 요약']);
  styleHeaderRow(header);

  const statusLabel: Record<string, string> = {
    pending: '대기',
    in_progress: '진행중',
    completed: '완료',
  };

  if (meetings.length === 0) {
    ws.addRow(['(등록된 회의록이 없습니다)', '', '', '', '']);
  } else {
    for (const m of meetings) {
      const fus = followupsByMeeting.get(m.id) ?? [];
      const fuSummary = fus
        .map((f) => {
          const due = f.due_date ? ` ~${f.due_date}` : '';
          const who = f.assignee ? ` [${f.assignee}]` : '';
          return `- ${f.content}${who}${due} (${statusLabel[f.status] ?? f.status})`;
        })
        .join('\n');
      const row = ws.addRow([
        partnerName.get(m.partner_id) ?? '알 수 없음',
        m.meeting_date ?? '',
        m.title,
        m.summary ?? '',
        fuSummary,
      ]);
      row.alignment = { vertical: 'top', wrapText: true };
    }
  }

  ws.columns = [
    { width: 20 },
    { width: 12 },
    { width: 30 },
    { width: 50 },
    { width: 50 },
  ];
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}
