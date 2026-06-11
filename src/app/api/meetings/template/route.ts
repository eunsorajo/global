import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { buildTemplateWorkbook } from '@/lib/meeting-excel';

// GET: 회의록 엑셀 양식(.xlsx) 다운로드
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  try {
    const buffer = await buildTemplateWorkbook();
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="meeting-template.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('[GET /api/meetings/template]', e);
    return NextResponse.json({ error: '양식 생성에 실패했습니다.' }, { status: 500 });
  }
}
