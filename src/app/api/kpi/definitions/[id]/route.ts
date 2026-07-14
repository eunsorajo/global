import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';
import { requireActiveUser, assertPartnerAccess, HttpError, errorResponse } from '@/lib/rbac';
import { getKpiDefinitionPartnerId, getPartnerAgreement } from '@/lib/kpi-data';

// KPI 정의 수정 (항목명/목표/구분/비고 또는 파트너 레벨 achieved 토글)
// 권한:
//   - achieved 토글: admin 전용 (파트너 레벨 달성 판정은 관리자 검토 항목).
//   - 그 외 필드: admin, 또는 partner 가 자기 파트너 & 협약 미제출 상태일 때.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireActiveUser();
  } catch (e) {
    return errorResponse(e);
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 });

  let body: {
    category?: '공통' | '특화' | null;
    name?: string;
    target?: string | null;
    note?: string | null;
    achieved?: boolean | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  if (body.category != null && body.category !== '공통' && body.category !== '특화') {
    return NextResponse.json({ error: "구분(category)은 '공통' 또는 '특화' 여야 합니다." }, { status: 400 });
  }
  if ('name' in body && (!body.name || !body.name.trim())) {
    return NextResponse.json({ error: '항목명(name)은 비울 수 없습니다.' }, { status: 400 });
  }

  // 권한: 정의의 실제 partner_id 확인 → 접근 검증.
  try {
    const partnerId = await getKpiDefinitionPartnerId(id);
    if (!partnerId) return NextResponse.json({ error: '해당 KPI 정의를 찾을 수 없습니다.' }, { status: 404 });
    assertPartnerAccess(session, partnerId);

    // achieved 토글은 admin 전용
    if ('achieved' in body && session.role !== 'admin') {
      throw new HttpError(403, '달성여부 판정은 관리자만 변경할 수 있습니다.');
    }
    // partner 의 정의 내용 수정은 협약 미제출 상태일 때만
    if (session.role !== 'admin') {
      const { submitted } = await getPartnerAgreement(partnerId);
      if (submitted) {
        throw new HttpError(403, '협약이 제출되어 KPI 항목을 수정할 수 없습니다. 관리자에게 문의해주세요.');
      }
    }
  } catch (e) {
    return errorResponse(e);
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('category' in body) update.category = body.category ?? null;
  if ('name' in body) update.name = body.name!.trim();
  if ('target' in body) update.target = body.target ?? null;
  if ('note' in body) update.note = body.note ?? null;
  if ('achieved' in body) update.achieved = body.achieved ?? null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('kpi_definitions')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: describeSupabaseError(error) }, { status: 500 });
  return NextResponse.json({ definition: data });
}

// KPI 정의 삭제 (진척도 셀은 on delete cascade 로 함께 삭제)
// 권한: admin, 또는 partner 가 자기 파트너 & 협약 미제출 상태일 때.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireActiveUser();
  } catch (e) {
    return errorResponse(e);
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 });

  let partnerId: string;
  try {
    const pid = await getKpiDefinitionPartnerId(id);
    if (!pid) return NextResponse.json({ error: '해당 KPI 정의를 찾을 수 없습니다.' }, { status: 404 });
    partnerId = pid;
    assertPartnerAccess(session, partnerId);
    if (session.role !== 'admin') {
      const { submitted } = await getPartnerAgreement(partnerId);
      if (submitted) {
        throw new HttpError(403, '협약이 제출되어 KPI 항목을 삭제할 수 없습니다. 관리자에게 문의해주세요.');
      }
    }
  } catch (e) {
    return errorResponse(e);
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('kpi_definitions').delete().eq('id', id);
  if (error) return NextResponse.json({ error: describeSupabaseError(error) }, { status: 500 });

  // 삭제 후 남은 정의를 1..N 으로 재번호 (중간 삭제로 생기는 순번 구멍 제거).
  // 오름차순으로 낮은 번호부터 채워 unique(partner_id, kpi_order) 충돌을 피한다.
  // 재번호 실패는 삭제 성공에 영향 없음(순번 구멍은 표시상 문제일 뿐) → 베스트에포트.
  try {
    const { data: remaining } = await supabase
      .from('kpi_definitions')
      .select('id, kpi_order')
      .eq('partner_id', partnerId)
      .order('kpi_order', { ascending: true });
    for (let i = 0; i < (remaining?.length ?? 0); i += 1) {
      const desired = i + 1;
      const row = remaining![i] as { id: string; kpi_order: number };
      if (row.kpi_order !== desired) {
        await supabase.from('kpi_definitions').update({ kpi_order: desired }).eq('id', row.id);
      }
    }
  } catch (e) {
    console.error('[DELETE kpi_definitions] 재번호 실패:', e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true });
}
