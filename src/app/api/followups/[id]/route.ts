import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';
import type { FollowupStatus } from '@/types/meeting';

const VALID_STATUS: FollowupStatus[] = ['pending', 'in_progress', 'completed'];

// PATCH: 팔로업 상태 변경
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

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
