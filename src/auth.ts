import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import type { JWT } from 'next-auth/jwt';
import { getUserByEmail } from '@/lib/user-data';

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // 비민감 권한만 요청(이름·이메일·프로필). 캘린더 등 민감 범위를 쓰지 않으므로
          // Google 의 '확인되지 않은 앱' 경고나 OAuth 검증이 필요 없다.
          scope: ['openid', 'email', 'profile'].join(' '),
        },
      },
    }),
  ],
  callbacks: {
    // 로그인은 모든 Google 계정에 허용한다(가입 신청 흐름).
    // 데이터 접근 권한은 users row(status='active' + 역할)로만 부여되며,
    // jwt/session 적재값 + 페이지/API 게이트(requireActiveUser 등)로 집행된다.
    // 미등록 계정은 로그인은 되지만 /register 로 유도되어 데이터에 접근하지 못한다.
    async signIn() {
      return true;
    },
    async jwt({ token, account, user }) {
      // 최초 로그인 시 이메일 확보
      if (account) {
        token.email = user?.email ?? token.email ?? null;
      }
      // 매 요청마다 users 1행을 가볍게 재조회 → RBAC/가입상태 적재(승인/거부 즉시 반영).
      await loadUserClaims(token);
      return token;
    },
    async session({ session, token }) {
      // RBAC + 가입 상태를 세션 user 에 노출
      if (session.user) {
        session.user.role = token.role;
        session.user.partnerId = token.partnerId ?? null;
        session.user.email = (token.email as string | undefined) ?? session.user.email;
        session.user.registered = token.registered ?? false;
        session.user.status = token.status;
        session.user.isSuperAdmin = token.isSuperAdmin ?? false;
      }
      return session;
    },
  },
});

// users row 를 조회해 토큰에 RBAC/가입상태를 적재한다.
// row 가 없으면 미등록(registered=false)으로 표시하고 역할 관련 클레임은 비운다.
// 조회 실패 시 토큰의 기존 값을 보존(안전 측면 — 권한을 임의 부여하지 않음)한다.
async function loadUserClaims(token: JWT): Promise<void> {
  const email = (token.email as string | undefined) ?? null;
  try {
    const row = await getUserByEmail(email);
    if (row) {
      token.registered = true;
      token.role = row.role;
      token.partnerId = row.partner_id;
      token.status = row.status;
      token.isSuperAdmin = row.is_super_admin;
      token.email = row.email;
    } else {
      // 미등록: 권한 클레임을 명시적으로 비운다(이전 row 가 삭제된 경우 포함).
      token.registered = false;
      token.role = undefined;
      token.partnerId = null;
      token.status = undefined;
      token.isSuperAdmin = false;
    }
  } catch (e) {
    console.error('[auth] user claims load failed:', e instanceof Error ? e.message : e);
    // 조회 실패 시 기존 토큰 값 유지 (권한 변경 없음)
  }
}
