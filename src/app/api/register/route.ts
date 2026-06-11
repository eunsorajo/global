import { NextRequest, NextResponse } from 'next/server';
import { getSessionAccount, errorResponse, HttpError } from '@/lib/rbac';
import { getUserByEmail, createSelfRegistration, UserDataError } from '@/lib/user-data';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';

// POST /api/register — 본인 가입 신청 (로그인 필요, 권한 불필요)
// body: { type: 'org'|'partner', name: string, partnerId?: string|null }
//   - type 'org'     → role 'admin'
//   - type 'partner' → role 'partner' (+ partnerId 필수, 실제 존재 검증)
//   - status 는 항상 'pending', is_super_admin 은 항상 false (서버 강제)
//   - 이메일은 세션에서만 취함 (클라이언트 입력을 신뢰하지 않음)
export async function POST(req: NextRequest) {
  let account;
  try {
    account = await getSessionAccount();
    if (!account) throw new HttpError(401, '로그인이 필요합니다.');
  } catch (e) {
    return errorResponse(e);
  }

  // 이미 신청한 사용자는 중복 신청 불가
  if (account.registered) {
    return NextResponse.json({ error: '이미 가입 신청한 계정입니다.' }, { status: 409 });
  }

  let body: { type?: string; name?: string; partnerId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: '이름을 입력해주세요.' }, { status: 400 });
  }
  if (body.type !== 'org' && body.type !== 'partner') {
    return NextResponse.json({ error: '이용 유형이 올바르지 않습니다.' }, { status: 400 });
  }

  const role = body.type === 'org' ? 'admin' : 'partner';
  let partnerId: string | null = null;

  if (role === 'partner') {
    partnerId = body.partnerId ?? null;
    if (!partnerId) {
      return NextResponse.json({ error: '소속 파트너사를 선택해주세요.' }, { status: 400 });
    }
    // 파트너 실제 존재 검증 (위조된 id 차단)
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('partners')
      .select('id')
      .eq('id', partnerId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: describeSupabaseError(error) }, { status: 500 });
    if (!data) return NextResponse.json({ error: '존재하지 않는 파트너사입니다.' }, { status: 400 });
  }

  // 경합으로 인한 중복 row 방지: 한 번 더 확인 후 생성
  try {
    const existing = await getUserByEmail(account.email);
    if (existing) {
      return NextResponse.json({ error: '이미 가입 신청한 계정입니다.' }, { status: 409 });
    }
    const user = await createSelfRegistration({
      email: account.email.toLowerCase(),
      name,
      role,
      partnerId,
    });
    return NextResponse.json({ ok: true, user: { id: user.id, status: user.status } });
  } catch (e) {
    const message = e instanceof UserDataError ? e.message : '가입 신청 처리 중 오류가 발생했습니다.';
    if (!(e instanceof UserDataError)) console.error('[POST /api/register]', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
