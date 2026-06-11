// 서버 전용 사용자(users) 데이터 접근 계층.
// RBAC: 로그인 허용 여부 + 역할/파트너 매핑의 단일 소스.
import 'server-only';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';
import type { UserRole } from '@/types/next-auth';

export class UserDataError extends Error {}

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  partner_id: string | null;
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
