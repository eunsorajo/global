import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { buildKpiExportWorkbook, exportFileName, KpiExportError } from '@/lib/kpi-export';

export const dynamic = 'force-dynamic';

// GET: 현재 KPI/회의록 현황을 .xlsx 로 내보낸다.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  try {
    const buffer = await buildKpiExportWorkbook();
    const fileName = exportFileName();
    // 한글 파일명은 RFC 5987 (filename*) 로 인코딩해 전달.
    const encoded = encodeURIComponent(fileName);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="KPI-status.xlsx"; filename*=UTF-8''${encoded}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    const message = e instanceof KpiExportError ? e.message : '엑셀 생성에 실패했습니다.';
    if (!(e instanceof KpiExportError)) console.error('[GET /api/kpi/export]', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
