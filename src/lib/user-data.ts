// 서버 전용 사용자(users) 데이터 접근 계층.
// RBAC: 로그인 허용 여부 + 역할/파트너 매핑의 단일 소스.
import 'server-only';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';
import { hashPassword, verifyPassword } from '@/lib/password';
import type { UserRole, UserStatus } from '@/types/next-auth';

export class UserDataError extends Error {}

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  partner_id: string | null;
  status: UserStatus;
  is_super_admin: boolean;
  // 비밀번호 로그인용 bcrypt 해시 (서버 전용 — 클라이언트로 내보내지 않는다). null = 미설정.
  password_hash?: string | null;
  created_at: string;
  updated_at: string;
}

// 이메일(소문자 비교)로 사용자 조회. 미등록이면 null.
// auth.ts 의 signIn/jwt 콜백과 rbac 헬퍼가 공유한다.
export async function getUserByEmail(email: string | null | undefined): Promise<UserRow | null> {
  const normalized = (email ?? '').trim().toLowerCase();
  if (!normalized) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .ilike('email', normalized) // 대소문자 무시 정확 일치 (% 미사용 → 와일드카드 아님)
    .maybeSingle();

  if (error) {
    // 인증 경로에서 호출되므로 throw 하지 않고 콘솔에만 남긴 뒤 null 반환할 수도 있으나,
    // 호출부(auth/rbac)에서 의미 있는 처리를 하도록 에러를 던진다.
    throw new UserDataError(describeSupabaseError(error));
  }
  return (data as UserRow | null) ?? null;
}

// 비밀번호 로그인 검증: 이메일로 조회 후 bcrypt 비교. 일치하면 UserRow 반환.
// (권한/상태 판정은 호출부 auth.ts 의 authorize 에서 status='active' 로 재확인)
export async function verifyUserPassword(email: string, plain: string): Promise<UserRow | null> {
  const user = await getUserByEmail(email);
  if (!user) return null;
  const ok = await verifyPassword(plain, user.password_hash ?? null);
  return ok ? user : null;
}

// 사용자 비밀번호 설정/재설정 (해시 저장). 관리자 전용 경로에서만 호출.
export async function setUserPassword(userId: string, plain: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const password_hash = await hashPassword(plain);
  const { error } = await supabase
    .from('users')
    .update({ password_hash, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw new UserDataError(describeSupabaseError(error));
}

// 사용자 목록 (관리자 화면용) — 매핑된 파트너명 포함
export interface UserWithPartner extends UserRow {
  partner_name: string | null;
  partner_country: string | null;
}

export async function listUsers(): Promise<UserWithPartner[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .select('*, partners(name, country)')
    .order('created_at', { ascending: true });
  if (error) throw new UserDataError(describeSupabaseError(error));

  type Joined = UserRow & { partners: { name: string; country: string } | null };
  return ((data ?? []) as Joined[]).map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    partner_id: u.partner_id,
    status: u.status,
    is_super_admin: u.is_super_admin,
    created_at: u.created_at,
    updated_at: u.updated_at,
    partner_name: u.partners?.name ?? null,
    partner_country: u.partners?.country ?? null,
  }));
}

// admin 계정 수 (마지막 admin 삭제/강등 방지 가드용)
export async function countAdmins(): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin');
  if (error) throw new UserDataError(describeSupabaseError(error));
  return count ?? 0;
}

// 최고관리자(active) 수 — 마지막 최고관리자 삭제/강등 방지 가드용.
// 거부(삭제)·강등 시 최소 1명의 active 최고관리자가 남도록 보장한다.
export async function countActiveSuperAdmins(): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('is_super_admin', true)
    .eq('status', 'active');
  if (error) throw new UserDataError(describeSupabaseError(error));
  return count ?? 0;
}

// 본인 가입 신청: users row 를 status='pending' 으로 생성.
//   - role: 조직(SBA) 이용자 → 'admin', 파트너사 → 'partner'
//   - partner 역할이면 partner_id 필수
//   - is_super_admin 은 항상 false (최고관리자 승격은 별도 권한)
// 이미 row 가 있으면 호출하지 않는다(상위에서 차단). DB 유니크 위반 시 에러.
export async function createSelfRegistration(input: {
  email: string;
  name: string | null;
  role: UserRole;
  partnerId: string | null;
}): Promise<UserRow> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .insert({
      email: input.email,
      name: input.name,
      role: input.role,
      partner_id: input.role === 'partner' ? input.partnerId : null,
      status: 'pending',
      is_super_admin: false,
    })
    .select('*')
    .single();
  if (error) throw new UserDataError(describeSupabaseError(error));
  return data as UserRow;
}
