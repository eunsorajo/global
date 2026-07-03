import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail } from '@/lib/user-data';
import { createLoginToken, recentTokenCount, MAX_REQUESTS_PER_WINDOW } from '@/lib/magic-link';
import { sendMail, mailerConfigured } from '@/lib/mailer';

// 매직링크 요청: 파트너가 회사 이메일을 입력하면 로그인 링크를 메일로 보낸다.
// 보안:
//  - 이메일 존재 여부를 노출하지 않기 위해 항상 동일하게 200 을 반환한다(계정 열거 방지).
//  - active 상태의 등록된 사용자에게만 실제로 링크를 발송한다.
//  - 이메일당 발송 횟수를 제한(rate limit)한다.
//  - nodemailer(Node)만 쓰므로 Node 런타임 고정.
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const okShape = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  // 형식이 틀려도 동일 응답(열거 방지). 단 실제 발송은 안 함.
  const genericOk = NextResponse.json({
    ok: true,
    message: '해당 이메일이 등록되어 있으면 로그인 링크를 보냈습니다. 메일함을 확인해주세요.',
  });
  if (!okShape) return genericOk;

  try {
    const user = await getUserByEmail(email).catch(() => null);
    if (!user || user.status !== 'active') return genericOk; // 미등록/미승인 → 조용히 종료

    // rate limit
    const recent = await recentTokenCount(email);
    if (recent >= MAX_REQUESTS_PER_WINDOW) return genericOk;

    const raw = await createLoginToken(email);
    const origin = req.headers.get('origin') || req.nextUrl.origin;
    const link = `${origin}/auth/verify?token=${encodeURIComponent(raw)}&email=${encodeURIComponent(email)}`;

    if (mailerConfigured()) {
      await sendMail({
        to: email,
        subject: '[SBA 파트너 네트워크] 로그인 링크',
        text: `아래 링크로 로그인하세요 (15분 내 유효, 1회용):\n\n${link}\n\n본인이 요청하지 않았다면 이 메일을 무시하세요.`,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
            <h2 style="color:#111">SBA 해외 액셀러레이팅 파트너 네트워크</h2>
            <p style="color:#444">아래 버튼을 눌러 로그인하세요. <b>15분 내 유효</b>하며 <b>1회만</b> 사용할 수 있습니다.</p>
            <p style="margin:24px 0">
              <a href="${link}" style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;display:inline-block">로그인</a>
            </p>
            <p style="color:#888;font-size:13px">버튼이 안 되면 이 주소를 복사해 열어주세요:<br>${link}</p>
            <p style="color:#aaa;font-size:12px;margin-top:24px">본인이 요청하지 않았다면 이 메일을 무시하세요.</p>
          </div>`,
      });
    } else {
      // 개발/미설정 환경: 실제 발송 대신 콘솔에 링크 출력(로컬 검증용).
      console.log('[magic-link] (메일 미설정) 로그인 링크:', link);
    }
    return genericOk;
  } catch (e) {
    console.error('[POST /api/auth/magic/request]', e instanceof Error ? e.message : e);
    // 내부 오류도 동일 응답(열거/오류 노출 방지). 발송 실패는 사용자가 재시도.
    return genericOk;
  }
}
