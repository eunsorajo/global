import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, errorResponse } from '@/lib/rbac';
import { parseMeetingText, MAX_TEXT_BYTES } from '@/lib/meeting-parser';
import { parseUploadedWorkbook, MAX_XLSX_BYTES } from '@/lib/meeting-excel';
import { getPartnerOptions, MeetingDataError } from '@/lib/meeting-data';
import { getDirectoryMatchCandidates, DirectoryDataError } from '@/lib/directory-data';
import { matchCompanyName, type MatchCandidate } from '@/lib/company-match';
import type { ParsedMeeting } from '@/types/meeting';

// 파싱 결과에 회사명 매칭을 보강한다.
//   - 사업 파트너(partners) + 협력/잠재(partner_directory) 전체를 대상으로,
//     법인격("주식회사", "(주)", "Co., Ltd." 등)·공백·대소문자를 제거한 키로 확정 매칭.
//   - 확정 매칭이 없으면 오타/부분표기 수준의 유사 후보를 제안(자동 연결 안 함).
function enrichPartnerMatch(parsed: ParsedMeeting, candidates: MatchCandidate[]): ParsedMeeting {
  if (!parsed.partnerName) return parsed;

  // 단순 매칭(기존 파서)이 이미 사업 파트너를 찾았으면 그대로 둔다.
  if (parsed.matchedPartnerId) return parsed;

  const { exact, suggestions } = matchCompanyName(parsed.partnerName, candidates);

  // 기존의 "찾지 못했습니다" 경고는 매칭 결과에 맞게 교체한다.
  const warnings = parsed.warnings.filter((w) => !w.includes('파트너를 DB에서 찾지 못했습니다'));

  if (exact?.kind === 'business') {
    return { ...parsed, matchedPartnerId: exact.id, warnings };
  }
  if (exact?.kind === 'directory') {
    return {
      ...parsed,
      matchedDirectoryId: exact.id,
      matchedDirectoryName: exact.name,
      matchedDirectoryStatus: exact.status ?? null,
      warnings,
    };
  }
  if (suggestions.length > 0) {
    warnings.push(
      `"${parsed.partnerName}"와(과) 비슷한 이름의 파트너가 있습니다. 아래 후보에서 확인해 주세요.`,
    );
    return { ...parsed, matchSuggestions: suggestions, warnings };
  }
  warnings.push(
    `"${parsed.partnerName}"는 등록되지 않은 회사입니다. 신규 잠재 파트너로 등록하거나 직접 선택해 주세요.`,
  );
  return { ...parsed, warnings };
}

const XLSX_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream', // 일부 브라우저가 octet-stream 으로 올림
  '',
]);

// POST: 텍스트(붙여넣기) 또는 엑셀 업로드 → 구조화 미리보기
// - JSON 바디 { text } : 붙여넣기 파싱
// - multipart/form-data (file) : 엑셀 파싱
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  let partners: { id: string; name: string }[];
  let candidates: MatchCandidate[];
  try {
    const [partnerList, dirList] = await Promise.all([
      getPartnerOptions(),
      getDirectoryMatchCandidates(),
    ]);
    partners = partnerList;
    candidates = [
      ...partnerList.map<MatchCandidate>((p) => ({ id: p.id, name: p.name, kind: 'business' })),
      ...dirList.map<MatchCandidate>((d) => ({
        id: d.id,
        name: d.name,
        kind: 'directory',
        status: d.status,
        country: d.country,
      })),
    ];
  } catch (e) {
    const message =
      e instanceof MeetingDataError || e instanceof DirectoryDataError
        ? e.message
        : '파트너 목록을 불러오지 못했습니다.';
    if (!(e instanceof MeetingDataError || e instanceof DirectoryDataError)) {
      console.error('[POST /api/meetings/parse] partners', e);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const contentType = req.headers.get('content-type') ?? '';

  // ---- 엑셀 업로드 ----
  if (contentType.includes('multipart/form-data')) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: '파일 업로드를 읽지 못했습니다.' }, { status: 400 });
    }
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '엑셀 파일을 첨부해주세요.' }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      return NextResponse.json({ error: '.xlsx 파일만 업로드할 수 있습니다.' }, { status: 400 });
    }
    if (!XLSX_MIME.has(file.type)) {
      return NextResponse.json({ error: '엑셀(.xlsx) 형식이 아닙니다.' }, { status: 400 });
    }
    if (file.size > MAX_XLSX_BYTES) {
      return NextResponse.json({ error: '파일이 너무 큽니다. (최대 5MB)' }, { status: 413 });
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const parsed = await parseUploadedWorkbook(buffer, partners);
      return NextResponse.json({ parsed: enrichPartnerMatch(parsed, candidates) });
    } catch (e) {
      console.error('[POST /api/meetings/parse] xlsx', e);
      return NextResponse.json({ error: '엑셀 파일을 분석하지 못했습니다. 양식을 확인해주세요.' }, { status: 400 });
    }
  }

  // ---- 텍스트 붙여넣기 ----
  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }
  const text = typeof body.text === 'string' ? body.text : '';
  if (!text.trim()) {
    return NextResponse.json({ error: '붙여넣을 내용이 비어 있습니다.' }, { status: 400 });
  }
  if (Buffer.byteLength(text, 'utf-8') > MAX_TEXT_BYTES) {
    return NextResponse.json({ error: '입력이 너무 큽니다. (최대 100KB)' }, { status: 413 });
  }

  const parsed = parseMeetingText(text, { partners, keepRaw: true });
  return NextResponse.json({ parsed: enrichPartnerMatch(parsed, candidates) });
}
