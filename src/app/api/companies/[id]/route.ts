import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';
import { requireActiveUser, assertPartnerAccess, errorResponse } from '@/lib/rbac';
import { getCompanyPartnerId } from '@/lib/kpi-data';

// 참여기업 수정
// 권한: admin, 또는 partner 가 자기 파트너 소속 기업일 때만.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireActiveUser();
  } catch (e) {
    return errorResponse(e);
  }

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

  // 권한: 기업의 실제 partner_id 확인 → 접근 검증.
  try {
    const partnerId = await getCompanyPartnerId(id);
    if (!partnerId) return NextResponse.json({ error: '해당 기업을 찾을 수 없습니다.' }, { status: 404 });
    assertPartnerAccess(session, partnerId);
  } catch (e) {
    return errorResponse(e);
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
// 권한: admin, 또는 partner 가 자기 파트너 소속 기업일 때만.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireActiveUser();
  } catch (e) {
    return errorResponse(e);
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 });

  try {
    const partnerId = await getCompanyPartnerId(id);
    if (!partnerId) return NextResponse.json({ error: '해당 기업을 찾을 수 없습니다.' }, { status: 404 });
    assertPartnerAccess(session, partnerId);
  } catch (e) {
    return errorResponse(e);
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('companies').delete().eq('id', id);
  if (error) return NextResponse.json({ error: describeSupabaseError(error) }, { status: 500 });
  return NextResponse.json({ ok: true });
}
