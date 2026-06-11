import { NextResponse } from 'next/server';
import { requireAdmin, errorResponse } from '@/lib/rbac';
import { buildKpiExportWorkbook, exportFileName, KpiExportError } from '@/lib/kpi-export';

export const dynamic = 'force-dynamic';
// 13개 파트너 시트 + 회의록 시트 생성에 시간이 걸릴 수 있어 Hobby 기본 10초보다 여유를 둔다.
export const maxDuration = 60;

// GET: 현재 KPI/회의록 현황을 .xlsx 로 내보낸다.
// 권한: admin 전용 (전체 파트너 데이터 내보내기).
export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    return errorResponse(e);
  }

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
