import { NextResponse } from 'next/server';
import { requireAdmin, errorResponse } from '@/lib/rbac';
import { buildTemplateWorkbook } from '@/lib/meeting-excel';

// GET: 회의록 엑셀 양식(.xlsx) 다운로드
// 권한: admin 전용.
export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    return errorResponse(e);
  }

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
