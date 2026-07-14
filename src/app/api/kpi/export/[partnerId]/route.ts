import { NextRequest, NextResponse } from 'next/server';
import { requireActiveUser, assertPartnerAccess, errorResponse } from '@/lib/rbac';
import { buildPartnerMatrixWorkbook, partnerMatrixFileName, KpiExportError } from '@/lib/kpi-export';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET: 단일 파트너의 KPI 매트릭스를 .xlsx 로 내보낸다.
// 권한: admin, 또는 partner 가 자기 파트너일 때만.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ partnerId: string }> }) {
  let session;
  try {
    session = await requireActiveUser();
  } catch (e) {
    return errorResponse(e);
  }

  const { partnerId } = await ctx.params;
  if (!partnerId) return NextResponse.json({ error: 'partnerId 가 필요합니다.' }, { status: 400 });

  try {
    assertPartnerAccess(session, partnerId);
  } catch (e) {
    return errorResponse(e);
  }

  try {
    const { buffer, name } = await buildPartnerMatrixWorkbook(partnerId);
    const fileName = partnerMatrixFileName(name);
    const encoded = encodeURIComponent(fileName);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="kpi-matrix.xlsx"; filename*=UTF-8''${encoded}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    const message = e instanceof KpiExportError ? e.message : '엑셀 생성에 실패했습니다.';
    if (!(e instanceof KpiExportError)) console.error('[GET /api/kpi/export/[partnerId]]', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
