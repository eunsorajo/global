import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';
import { requireAdmin, errorResponse } from '@/lib/rbac';
import { countAdmins, UserDataError } from '@/lib/user-data';

// 대상 사용자 1건 조회 (권한 가드용 내부 헬퍼)
async function fetchUser(id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .select('id, email, role, partner_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new UserDataError(describeSupabaseError(error));
  return data as { id: string; email: string; role: 'admin' | 'partner'; partner_id: string | null } | null;
}

// PATCH: 역할/파트너 매핑 변경 (관리자 전용)
// body: { role?: 'admin'|'partner', partnerId?: string|null, name?: string|null }
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 });

  let body: { role?: string; partnerId?: string | null; name?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  let target;
  try {
    target = await fetchUser(id);
  } catch (e) {
    const message = e instanceof UserDataError ? e.message : '사용자 조회에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
  if (!target) return NextResponse.json({ error: '해당 사용자를 찾을 수 없습니다.' }, { status: 404 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // 최종 적용될 role/partner_id 계산 (제약 위반 사전 차단용)
  const nextRole = (body.role as 'admin' | 'partner' | undefined) ?? target.role;
  if (body.role !== undefined && body.role !== 'admin' && body.role !== 'partner') {
    return NextResponse.json({ error: "역할은 'admin' 또는 'partner' 여야 합니다." }, { status: 400 });
  }

  let nextPartnerId: string | null;
  if (nextRole === 'admin') {
    nextPartnerId = null; // admin 은 파트너 매핑 없음
  } else {
    // partner: 본문에 partnerId 가 오면 사용, 아니면 기존 값 유지
    nextPartnerId = body.partnerId !== undefined ? (body.partnerId ?? null) : target.partner_id;
    if (!nextPartnerId) {
      return NextResponse.json({ error: 'partner 역할은 파트너를 선택해야 합니다.' }, { status: 400 });
    }
  }

  // 마지막 admin 강등 방지
  if (target.role === 'admin' && nextRole !== 'admin') {
    try {
      const adminCount = await countAdmins();
      if (adminCount <= 1) {
        return NextResponse.json({ error: '마지막 관리자는 역할을 변경할 수 없습니다.' }, { status: 409 });
      }
    } catch {
      return NextResponse.json({ error: '관리자 수 확인에 실패했습니다.' }, { status: 500 });
    }
  }

  if (body.role !== undefined) update.role = nextRole;
  update.partner_id = nextPartnerId; // role 변경 시 일관성 위해 항상 동기화
  if ('name' in body) update.name = body.name?.trim() || null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: describeSupabaseError(error) }, { status: 500 });
  return NextResponse.json({ user: data });
}

// DELETE: 사용자 삭제 (관리자 전용)
//   - 본인 삭제 방지
//   - 마지막 admin 삭제 방지
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 });

  let target;
  try {
    target = await fetchUser(id);
  } catch (e) {
    const message = e instanceof UserDataError ? e.message : '사용자 조회에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
  if (!target) return NextResponse.json({ error: '해당 사용자를 찾을 수 없습니다.' }, { status: 404 });

  // 본인 삭제 방지 (이메일 소문자 비교)
  if (target.email.toLowerCase() === admin.email.toLowerCase()) {
    return NextResponse.json({ error: '본인 계정은 삭제할 수 없습니다.' }, { status: 409 });
  }

  // 마지막 admin 삭제 방지
  if (target.role === 'admin') {
    try {
      const adminCount = await countAdmins();
      if (adminCount <= 1) {
        return NextResponse.json({ error: '마지막 관리자는 삭제할 수 없습니다.' }, { status: 409 });
      }
    } catch {
      return NextResponse.json({ error: '관리자 수 확인에 실패했습니다.' }, { status: 500 });
    }
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('users').delete().eq('id', id);
  if (error) return NextResponse.json({ error: describeSupabaseError(error) }, { status: 500 });
  return NextResponse.json({ ok: true });
}
