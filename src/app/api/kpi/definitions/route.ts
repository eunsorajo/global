import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';

// KPI 정의 생성 (파트너별)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

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
