import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import type { JWT } from 'next-auth/jwt';
import { getUserByEmail } from '@/lib/user-data';

// Google OAuth refresh_token 으로 access_token 을 갱신한다.
// (캘린더 API 가 사용자 토큰을 사용하므로 만료 시 자동 갱신 필요)
async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    if (!token.refreshToken) throw new Error('no refresh token');

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken as string,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.access_token) {
      throw new Error('refresh failed');
    }

    return {
      ...token,
      accessToken: data.access_token,
      // expires_in(초) → epoch(초). 응답에 없으면 1시간 기본값.
      expiresAt: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
      // Google 은 보통 새 refresh_token 을 주지 않음 → 기존 값 유지
      refreshToken: data.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch (e) {
    console.error('[auth] access token refresh failed:', e instanceof Error ? e.message : e);
    return { ...token, error: 'RefreshAccessTokenError' };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // Drive/Sheets 연동 제거에 맞춰 캘린더 읽기 권한만 요청
          scope: [
            'openid',
            'email',
            'profile',
            'https://www.googleapis.com/auth/calendar.readonly',
          ].join(' '),
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    // 로그인 허용 여부: users 테이블(이메일 소문자 비교)에 등록된 계정만 허용.
    // 미등록(또는 조회 실패) 시 로그인 거부 → 데이터에 일절 접근 못 함.
    async signIn({ user }) {
      try {
        const row = await getUserByEmail(user.email);
        return row != null;
      } catch (e) {
        console.error('[auth] signIn user lookup failed:', e instanceof Error ? e.message : e);
        return false; // 조회 실패 시 안전하게 거부
      }
    },
    async jwt({ token, account, user }) {
      // 최초 로그인: 토큰 정보 + RBAC(역할/파트너) 적재
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;

        // signIn 을 통과했으므로 users row 가 존재한다. role/partner_id 를 토큰에 실는다.
        const email = user?.email ?? token.email ?? null;
        try {
          const row = await getUserByEmail(email);
          if (row) {
            token.role = row.role;
            token.partnerId = row.partner_id;
            token.email = row.email;
          }
        } catch (e) {
          console.error('[auth] jwt role load failed:', e instanceof Error ? e.message : e);
        }
        return token;
      }

      // 아직 만료 전이면 그대로 사용 (만료 60초 전부터 갱신)
      const expiresAt = token.expiresAt as number | undefined;
      if (expiresAt && Date.now() < (expiresAt - 60) * 1000) {
        return token;
      }

      // 만료(또는 만료 임박): refresh_token 으로 갱신
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      session.error = token.error as string | undefined;
      // RBAC: 세션 user 에 역할/파트너/이메일 노출
      if (session.user) {
        session.user.role = token.role;
        session.user.partnerId = token.partnerId ?? null;
        session.user.email = (token.email as string | undefined) ?? session.user.email;
      }
      return session;
    },
  },
});
