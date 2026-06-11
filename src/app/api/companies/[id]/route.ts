import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';

// 참여기업 수정
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 });

  let body: { name?: string; sector?: string | null; description?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  if ('name' in body && (!body.name || !body.name.trim())) {
    return NextResponse.json({ error: '기업명(name)은 비울 수 없습니다.' }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('name' in body) update.name = body.name!.trim();
  if ('sector' in body) update.sector = body.sector ?? null;
  if ('description' in body) update.description = body.description ?? null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('companies')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: describeSupabaseError(error) }, { status: 500 });
  return NextResponse.json({ company: data });
}

// 참여기업 삭제 (진척도 셀은 cascade)
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('companies').delete().eq('id', id);
  if (error) return NextResponse.json({ error: describeSupabaseError(error) }, { status: 500 });
  return NextResponse.json({ ok: true });
}
