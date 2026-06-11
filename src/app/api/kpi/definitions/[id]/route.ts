import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';

// KPI 정의 수정 (항목명/목표/구분/비고 또는 파트너 레벨 achieved 토글)
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

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
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('kpi_definitions').delete().eq('id', id);
  if (error) return NextResponse.json({ error: describeSupabaseError(error) }, { status: 500 });
  return NextResponse.json({ ok: true });
}
