import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';
import { requireActiveUser, assertPartnerAccess, errorResponse } from '@/lib/rbac';
import { getCompanyPartnerId, getKpiDefinitionPartnerId } from '@/lib/kpi-data';

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
    progressCurrent?: number | null;
    progressTarget?: number | null;
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
  // 정량(달성/목표) — 0 이상 정수 또는 null
  for (const [k, v] of [['progressCurrent', body.progressCurrent], ['progressTarget', body.progressTarget]] as const) {
    if (v !== undefined && v !== null && (!Number.isInteger(v) || v < 0)) {
      return NextResponse.json({ error: `${k} 는 0 이상의 정수 또는 null 이어야 합니다.` }, { status: 400 });
    }
  }

  // 권한: 대상 기업의 실제 partner_id 를 DB 에서 확인 (클라이언트 파라미터 불신).
  // KPI 정의도 같은 파트너 소속인지 확인해 cross-partner 진척도 오염을 차단한다.
  try {
    const [partnerId, defPartnerId] = await Promise.all([
      getCompanyPartnerId(body.companyId),
      getKpiDefinitionPartnerId(body.kpiDefinitionId),
    ]);
    if (!partnerId) {
      return NextResponse.json({ error: '해당 기업을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (!defPartnerId) {
      return NextResponse.json({ error: '해당 KPI 정의를 찾을 수 없습니다.' }, { status: 404 });
    }
    if (defPartnerId !== partnerId) {
      return NextResponse.json({ error: 'KPI 정의가 해당 기업의 파트너에 속하지 않습니다.' }, { status: 400 });
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
        progress_current: body.progressCurrent ?? null,
        progress_target: body.progressTarget ?? null,
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
