import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, errorResponse } from '@/lib/rbac';
import { parseMeetingText, MAX_TEXT_BYTES } from '@/lib/meeting-parser';
import { parseUploadedWorkbook, MAX_XLSX_BYTES } from '@/lib/meeting-excel';
import { getPartnerOptions, MeetingDataError } from '@/lib/meeting-data';

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
  try {
    partners = await getPartnerOptions();
  } catch (e) {
    const message = e instanceof MeetingDataError ? e.message : '파트너 목록을 불러오지 못했습니다.';
    if (!(e instanceof MeetingDataError)) console.error('[POST /api/meetings/parse] partners', e);
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
      return NextResponse.json({ parsed });
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
  return NextResponse.json({ parsed });
}
