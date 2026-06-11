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
import type { UserRole } from '@/types/next-auth';

export interface SessionUser {
  email: string;
  role: UserRole;
  partnerId: string | null;
}

// 권한 위반을 표현하는 에러. API 라우트에서 status 로 변환한다.
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// 세션에서 RBAC 사용자 정보 추출. 미인증/role 누락 시 null.
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const u = session?.user;
  if (!session || !u?.email || !u.role) return null;
  return {
    email: u.email,
    role: u.role,
    partnerId: u.partnerId ?? null,
  };
}

// 인증 필수. 미인증이면 401 HttpError.
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, '로그인이 필요합니다.');
  return user;
}

// 관리자 필수. partner 이거나 미인증이면 거부.
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'admin') {
    throw new HttpError(403, '관리자 권한이 필요합니다.');
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

// partner 가 자기 KPI 페이지로 갈 경로. partnerId 가 없으면 홈.
export function partnerHomeHref(user: SessionUser | null): string {
  if (user?.role === 'partner' && user.partnerId) return `/kpi/${user.partnerId}`;
  return '/';
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
