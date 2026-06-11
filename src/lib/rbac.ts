// 서버 전용 RBAC(역할 기반 접근 제어) 헬퍼.
//
// 보안 원칙: 권한 판단의 단일 소스. 페이지(서버 컴포넌트)와 API 라우트 모두
// 이 헬퍼를 통해 세션 role/partnerId 를 검사한다. UI 숨김에 의존하지 않는다.
//
// 두 가지 사용 패턴:
//   - 페이지(서버 컴포넌트): getSessionUser() 로 받아 redirect()/forbidden() 분기.
//   - API 라우트: requireUser/requireAdmin/assertPartnerAccess 가 권한 위반 시
//     HttpError 를 throw → 라우트 상단에서 try/catch 로 NextResponse 변환.
import 'server-only';
import { auth } from '@/auth';
import type { NextResponse } from 'next/server';
import { NextResponse as NR } from 'next/server';
import type { UserRole, UserStatus } from '@/types/next-auth';

export interface SessionUser {
  email: string;
  role: UserRole;
  partnerId: string | null;
  // 가입 신청/승인 흐름
  registered: boolean; // users row 존재 여부 (false = 미신청 → /register)
  status: UserStatus | null; // 'pending'(승인 대기) | 'active'(사용 가능)
  isSuperAdmin: boolean; // 최고관리자(가입 승인·사용자 관리 권한)
}

// 로그인은 했지만 RBAC 클레임(role 등)이 아직 없는 사용자도 표현한다.
// 미등록/승인대기 게이트(페이지 분기)에서 사용.
export interface SessionAccount {
  email: string;
  registered: boolean;
  status: UserStatus | null;
}

// 권한 위반을 표현하는 에러. API 라우트에서 status 로 변환한다.
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// 세션에서 RBAC 사용자 정보 추출.
// 미인증·미등록·role 누락 시 null (= 데이터 접근 불가). status 는 active 가 아닐 수도 있으므로
// 권한이 필요한 곳에서는 requireActiveUser() 를 사용한다.
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const u = session?.user;
  if (!session || !u?.email || !u.role) return null;
  return {
    email: u.email,
    role: u.role,
    partnerId: u.partnerId ?? null,
    registered: u.registered ?? true, // role 이 있으면 등록된 상태
    status: u.status ?? null,
    isSuperAdmin: u.isSuperAdmin ?? false,
  };
}

// 로그인 계정 정보(권한 무관). 가입 게이트 분기용.
//   - 미인증: null
//   - 로그인했으나 미신청: { registered:false, status:null }
//   - 신청함: { registered:true, status:'pending'|'active' }
export async function getSessionAccount(): Promise<SessionAccount | null> {
  const session = await auth();
  const u = session?.user;
  if (!session || !u?.email) return null;
  return {
    email: u.email,
    registered: u.registered ?? false,
    status: u.status ?? null,
  };
}

// 인증 필수. 미인증이면 401 HttpError.
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, '로그인이 필요합니다.');
  return user;
}

// 승인된(active) 사용자 필수. 미신청·승인대기는 403.
// 데이터를 다루는 모든 API 는 requireUser 대신 이 게이트를 통과해야 한다.
export async function requireActiveUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.status !== 'active') {
    throw new HttpError(403, '승인 대기 중인 계정입니다. 최고관리자의 승인 후 이용할 수 있습니다.');
  }
  return user;
}

// 관리자 필수. active + role==='admin' 인 경우만 통과.
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireActiveUser();
  if (user.role !== 'admin') {
    throw new HttpError(403, '관리자 권한이 필요합니다.');
  }
  return user;
}

// 최고관리자 필수. active + is_super_admin 인 경우만 통과 (가입 승인·사용자 관리).
export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireActiveUser();
  if (!user.isSuperAdmin) {
    throw new HttpError(403, '최고관리자 권한이 필요합니다.');
  }
  return user;
}

// 특정 파트너 리소스 접근 검증.
//   - admin: 항상 통과
//   - partner: 자기 partnerId 와 일치할 때만 통과
//   - 그 외(파트너 미매핑 등): 거부
// partnerId 는 호출부에서 "리소스의 실제 partner_id 를 DB 로 조회한 값"을 넘겨야 한다.
// (클라이언트가 보낸 파라미터를 그대로 신뢰하지 말 것)
export function assertPartnerAccess(user: SessionUser, partnerId: string | null | undefined): void {
  if (user.role === 'admin') return;
  if (user.role === 'partner' && partnerId && user.partnerId === partnerId) return;
  throw new HttpError(403, '해당 파트너에 대한 접근 권한이 없습니다.');
}

// 사용자의 시작 경로. partner 는 자기 대시보드, 그 외(admin)는 홈.
export function partnerHomeHref(user: SessionUser | null): string {
  if (user?.role === 'partner') return '/partner';
  return '/';
}

// ---------- 가입 게이트 (페이지 서버 컴포넌트용 중앙화 헬퍼) ----------
// 데이터 페이지 진입 시 가입 흐름을 일괄 판정한다.
//   - 'login'      : 미인증 → 로그인 안내
//   - 'register'   : 로그인했지만 미신청 → /register 로 redirect
//   - 'pending'    : 신청했으나 승인 대기 → 안내 화면
//   - 'active'     : 정상(user 동봉) → 페이지가 역할 분기 진행
// 예외 경로(/register, /privacy, /terms 등)에서는 이 게이트를 호출하지 않는다.
export type PageGate =
  | { state: 'login' }
  | { state: 'register' }
  | { state: 'pending'; email: string }
  | { state: 'active'; user: SessionUser };

export async function pageGate(): Promise<PageGate> {
  const account = await getSessionAccount();
  if (!account) return { state: 'login' };
  if (!account.registered) return { state: 'register' };
  if (account.status !== 'active') return { state: 'pending', email: account.email };

  // active: 권한 클레임이 실린 SessionUser 를 구성해 반환
  const user = await getSessionUser();
  // status==='active' 인데 role 누락은 정상적으로는 발생하지 않음(미등록 취급)
  if (!user) return { state: 'register' };
  return { state: 'active', user };
}

// HttpError(또는 임의 에러)를 일관된 JSON 응답으로 변환.
// API 라우트의 catch 블록에서 사용한다.
export function errorResponse(e: unknown): NextResponse {
  if (e instanceof HttpError) {
    return NR.json({ error: e.message }, { status: e.status });
  }
  console.error('[rbac] unexpected error:', e instanceof Error ? e.message : e);
  return NR.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 });
}
