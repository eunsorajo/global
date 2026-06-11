import 'next-auth';
import 'next-auth/jwt';

// RBAC 역할
export type UserRole = 'admin' | 'partner';
// 가입 승인 상태
export type UserStatus = 'pending' | 'active';

declare module 'next-auth' {
  interface Session {
    user: {
      // RBAC: users 테이블에서 실어온 값
      role?: UserRole;
      partnerId?: string | null;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      // 가입 신청/승인 흐름
      registered?: boolean; // users row 존재 여부 (false = 미신청)
      status?: UserStatus; // 'pending' | 'active' (미등록이면 undefined)
      isSuperAdmin?: boolean; // 최고관리자(가입 승인 권한)
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    // RBAC
    role?: UserRole;
    partnerId?: string | null;
    email?: string | null;
    // 가입 신청/승인 흐름
    registered?: boolean;
    status?: UserStatus;
    isSuperAdmin?: boolean;
    // RBAC 클레임 마지막 재조회 시각(ms) — 60초 TTL 캐시용
    claimsCheckedAt?: number;
  }
}
