import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';
import { requireAdmin, errorResponse } from '@/lib/rbac';
import type { FollowupStatus } from '@/types/meeting';

const VALID_STATUS: FollowupStatus[] = ['pending', 'in_progress', 'completed'];

// PATCH: 팔로업 상태 변경
// 권한: admin 전용 (회의록/팔로업은 내부 운영 메뉴).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 });

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  if (!body.status || !VALID_STATUS.includes(body.status as FollowupStatus)) {
    return NextResponse.json(
      { error: "status 는 'pending' | 'in_progress' | 'completed' 중 하나여야 합니다." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('followups')
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('[PATCH /api/followups/[id]]', error);
    return NextResponse.json({ error: describeSupabaseError(error) }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: '해당 팔로업을 찾을 수 없습니다.' }, { status: 404 });
  }
  return NextResponse.json({ followup: data });
}

// DELETE: 팔로업 삭제
// 권한: admin 전용. 회의 팔로업/디렉토리 팔로업 공용 (followups.id 만으로 삭제).
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('followups').delete().eq('id', id);
  if (error) {
    console.error('[DELETE /api/followups/[id]]', error);
    return NextResponse.json({ error: describeSupabaseError(error) }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
