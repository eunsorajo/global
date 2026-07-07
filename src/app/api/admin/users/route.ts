import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';
import { requireSuperAdmin, errorResponse } from '@/lib/rbac';
import { listUsers, getUserByEmail, UserDataError } from '@/lib/user-data';
import { hashPassword, isValidPassword, MIN_PASSWORD_LENGTH } from '@/lib/password';

// GET: 사용자 목록 (관리자 전용)
export async function GET() {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  try {
    const users = await listUsers();
    return NextResponse.json({ users });
  } catch (e) {
    const message = e instanceof UserDataError ? e.message : '사용자 목록을 불러오지 못했습니다.';
    if (!(e instanceof UserDataError)) console.error('[GET /api/admin/users]', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST: 사용자 추가 (관리자 전용)
// body: { email, name?, role: 'admin'|'partner', partnerId?, password? }
//   - partner 역할이면 partnerId 필수 (DB 제약과 동일)
//   - admin 역할이면 partnerId 는 무시(null 저장)
//   - partner 역할이면 password 필수(로그인용). admin 은 Google 로그인이라 password 불필요.
export async function POST(req: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  let body: { email?: string; name?: string | null; role?: string; partnerId?: string | null; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const email = (body.email ?? '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: '유효한 이메일을 입력해주세요.' }, { status: 400 });
  }
  if (body.role !== 'admin' && body.role !== 'partner') {
    return NextResponse.json({ error: "역할은 'admin' 또는 'partner' 여야 합니다." }, { status: 400 });
  }
  const partnerId = body.role === 'partner' ? (body.partnerId ?? null) : null;
  if (body.role === 'partner' && !partnerId) {
    return NextResponse.json({ error: 'partner 역할은 파트너를 선택해야 합니다.' }, { status: 400 });
  }

  // 비밀번호: partner 역할은 필수, 지정 시 최소 길이 검증. (admin 은 Google 로그인)
  const password = typeof body.password === 'string' ? body.password : '';
  if (body.role === 'partner' && !password) {
    return NextResponse.json({ error: '파트너 계정은 비밀번호를 설정해야 합니다.' }, { status: 400 });
  }
  if (password && !isValidPassword(password)) {
    return NextResponse.json({ error: `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.` }, { status: 400 });
  }

  // 중복 이메일 사전 점검 (소문자 비교)
  try {
    const existing = await getUserByEmail(email);
    if (existing) {
      return NextResponse.json({ error: '이미 등록된 이메일입니다.' }, { status: 409 });
    }
  } catch (e) {
    const message = e instanceof UserDataError ? e.message : '중복 확인에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const password_hash = password ? await hashPassword(password) : null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .insert({
      email,
      name: body.name?.trim() || null,
      role: body.role,
      partner_id: partnerId,
      // 최고관리자가 직접 추가한 계정은 즉시 사용 가능(승인 단계 생략).
      status: 'active',
      is_super_admin: false,
      password_hash,
    })
    .select('id, email, name, role, partner_id, status, is_super_admin, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: describeSupabaseError(error) }, { status: 500 });
  return NextResponse.json({ user: data });
}
