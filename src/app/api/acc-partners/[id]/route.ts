import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';
import { requireAdmin, errorResponse } from '@/lib/rbac';

// 액셀러레이팅 파트너 수정 — 협약서 제출 여부 토글 등
// (기존 CRM /partners 와 별개 도메인이라 경로를 분리)
// 권한: admin 전용 (협약 제출 확정은 관리자 검토 항목).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 });

  let body: { agreementSubmitted?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('agreementSubmitted' in body) {
    if (typeof body.agreementSubmitted !== 'boolean') {
      return NextResponse.json({ error: 'agreementSubmitted 는 boolean 이어야 합니다.' }, { status: 400 });
    }
    update.agreement_submitted = body.agreementSubmitted;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('partners')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: describeSupabaseError(error) }, { status: 500 });
  return NextResponse.json({ partner: data });
}
