import 'next-auth';
import 'next-auth/jwt';

// RBAC 역할
export type UserRole = 'admin' | 'partner';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    // access token 갱신 실패 시 플래그 (재로그인 유도용)
    error?: string;
    user: {
      // RBAC: users 테이블에서 실어온 값
      role?: UserRole;
      partnerId?: string | null;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    error?: string;
    // RBAC
    role?: UserRole;
    partnerId?: string | null;
    email?: string | null;
  }
}
