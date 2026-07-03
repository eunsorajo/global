import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import type { JWT } from 'next-auth/jwt';
import { getUserByEmail } from '@/lib/user-data';
import { consumeLoginToken } from '@/lib/magic-link';

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
    // 파트너용 매직링크 로그인. Google 계정이 없는 파트너 담당자가
    // 회사 이메일로 받은 1회용 링크로 로그인한다(/auth/verify → signIn('magic-token')).
    // authorize 에서 토큰을 원자적으로 소비·검증하므로, 이 provider 를 직접 호출해도
    // 유효한 토큰 없이는 통과하지 못한다. 권한은 users 행(active)에서만 부여.
    Credentials({
      id: 'magic-token',
      name: 'Magic Link',
      credentials: { email: {}, token: {} },
      async authorize(creds) {
        const email = String(creds?.email ?? '').trim().toLowerCase();
        const token = String(creds?.token ?? '');
        if (!email || !token) return null;
        const consumed = await consumeLoginToken(email, token);
        if (!consumed) return null;
        const user = await getUserByEmail(email);
        if (!user || user.status !== 'active') return null;
        return { id: user.id, email: user.email, name: user.name ?? undefined };
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
      // 최초 로그인 시 이메일 확보 + 즉시 클레임 적재
      if (account) {
        token.email = user?.email ?? token.email ?? null;
        await loadUserClaims(token);
        return token;
      }
      // users 재조회는 60초 TTL 캐시 — 한 페이지 렌더에서 auth() 가 2~3회 불리고
      // 60초 폴링까지 더해지면 요청마다 users 쿼리가 중복 실행되므로 묶는다.
      // (승인/차단 반영이 최대 60초 지연되는 트레이드오프는 수용)
      const checkedAt = token.claimsCheckedAt ?? 0;
      if (Date.now() - checkedAt > CLAIMS_TTL_MS) {
        await loadUserClaims(token);
      }
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

// users 재조회 TTL — 이 시간 안에는 토큰의 클레임을 그대로 신뢰한다.
const CLAIMS_TTL_MS = 60_000;

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
    token.claimsCheckedAt = Date.now();
  } catch (e) {
    console.error('[auth] user claims load failed:', e instanceof Error ? e.message : e);
    // 조회 실패 시 기존 토큰 값 유지 (권한 변경 없음). TTL 도 갱신하지 않아 다음 요청에서 재시도.
  }
}
