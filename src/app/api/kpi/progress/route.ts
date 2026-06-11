import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';
import { requireActiveUser, assertPartnerAccess, errorResponse } from '@/lib/rbac';
import { getCompanyPartnerId } from '@/lib/kpi-data';

// 매트릭스 셀(기업 × KPI) 진척도 저장 (upsert).
// 낙관적 업데이트의 서버 반영 엔드포인트.
//
// 권한: admin 이거나, partner 가 해당 기업의 소속 파트너와 일치할 때만.
// 저장 시 updated_by 에 세션 이메일 기록(감사 추적).
export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireActiveUser();
  } catch (e) {
    return errorResponse(e);
  }

  let body: {
    companyId?: string;
    kpiDefinitionId?: string;
    value?: string | null;
    achieved?: boolean | null;
    note?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  // 필수 필드 검증
  if (!body.companyId || !body.kpiDefinitionId) {
    return NextResponse.json({ error: 'companyId, kpiDefinitionId 는 필수입니다.' }, { status: 400 });
  }
  if (body.achieved !== undefined && body.achieved !== null && typeof body.achieved !== 'boolean') {
    return NextResponse.json({ error: 'achieved 는 boolean 또는 null 이어야 합니다.' }, { status: 400 });
  }

  // 권한: 대상 기업의 실제 partner_id 를 DB 에서 확인 (클라이언트 파라미터 불신).
  try {
    const partnerId = await getCompanyPartnerId(body.companyId);
    if (!partnerId) {
      return NextResponse.json({ error: '해당 기업을 찾을 수 없습니다.' }, { status: 404 });
    }
    assertPartnerAccess(session, partnerId);
  } catch (e) {
    return errorResponse(e);
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('kpi_progress')
    .upsert(
      {
        company_id: body.companyId,
        kpi_definition_id: body.kpiDefinitionId,
        value: body.value ?? null,
        achieved: body.achieved ?? null,
        note: body.note ?? null,
        updated_by: session.email,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id,kpi_definition_id' }
    )
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: describeSupabaseError(error) }, { status: 500 });
  }
  return NextResponse.json({ progress: data });
}
