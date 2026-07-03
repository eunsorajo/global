// 서버 전용 메일 발송 계층 (Gmail SMTP).
// GMAIL_USER / GMAIL_APP_PASSWORD 환경변수 필요 (Google 계정 앱 비밀번호 16자리).
// 값이 없으면 mailerConfigured()가 false → 호출부에서 개발용으로 링크를 콘솔에 출력.
import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';

let transporter: Transporter | null = null;

export function mailerConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function getTransporter(): Transporter {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error('메일 발송 설정(GMAIL_USER/GMAIL_APP_PASSWORD)이 없습니다.');
  }
  // Gmail SMTP. 앱 비밀번호(2FA 계정)로 인증. 하루 ~500통 한도.
  transporter ??= nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  return transporter;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const from = process.env.MAIL_FROM || process.env.GMAIL_USER!;
  await getTransporter().sendMail({
    from: `SBA 해외 액셀러레이팅 파트너 네트워크 <${from}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}
