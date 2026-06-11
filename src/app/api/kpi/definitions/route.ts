import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';
import { requireActiveUser, assertPartnerAccess, HttpError, errorResponse } from '@/lib/rbac';
import { getPartnerAgreement } from '@/lib/kpi-data';

// KPI 정의 생성 (파트너별)
// 권한: admin, 또는 partner 가 자기 파트너의 KPI 를 "협약 미제출" 상태일 때만.
export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireActiveUser();
  } catch (e) {
    return errorResponse(e);
  }

  let body: {
    partnerId?: string;
    kpiOrder?: number;
    category?: '공통' | '특화' | null;
    name?: string;
    target?: string | null;
    note?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  if (!body.partnerId || !body.name || !body.name.trim()) {
    return NextResponse.json({ error: 'partnerId 와 항목명(name)은 필수입니다.' }, { status: 400 });
  }
  if (body.category != null && body.category !== '공통' && body.category !== '특화') {
    return NextResponse.json({ error: "구분(category)은 '공통' 또는 '특화' 여야 합니다." }, { status: 400 });
  }

  // 권한: 대상 파트너 접근 + (partner 면) 협약 미제출 상태일 때만.
  try {
    assertPartnerAccess(session, body.partnerId);
    if (session.role !== 'admin') {
      const { exists, submitted } = await getPartnerAgreement(body.partnerId);
      if (!exists) return NextResponse.json({ error: '해당 파트너를 찾을 수 없습니다.' }, { status: 404 });
      if (submitted) {
        throw new HttpError(403, '협약이 제출되어 KPI 항목을 수정할 수 없습니다. 관리자에게 문의해주세요.');
      }
    }
  } catch (e) {
    return errorResponse(e);
  }

  const supabase = getSupabaseAdmin();

  // kpiOrder 미지정 시 마지막 순번 + 1 자동 부여
  let order = body.kpiOrder;
  if (order == null) {
    const { data: maxRows, error: maxErr } = await supabase
      .from('kpi_definitions')
      .select('kpi_order')
      .eq('partner_id', body.partnerId)
      .order('kpi_order', { ascending: false })
      .limit(1);
    if (maxErr) return NextResponse.json({ error: describeSupabaseError(maxErr) }, { status: 500 });
    order = (maxRows?.[0]?.kpi_order ?? 0) + 1;
  }

  const { data, error } = await supabase
    .from('kpi_definitions')
    .insert({
      partner_id: body.partnerId,
      kpi_order: order,
      category: body.category ?? null,
      name: body.name.trim(),
      target: body.target ?? null,
      note: body.note ?? null,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: describeSupabaseError(error) }, { status: 500 });
  return NextResponse.json({ definition: data });
}
