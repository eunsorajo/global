import { createSign, createPrivateKey } from 'crypto';

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function base64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export async function getServiceAccountToken(
  scopes: string[] = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/cloud-platform',
  ]
): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const raw = Buffer.from(process.env.GOOGLE_CREDENTIALS_B64!, 'base64').toString('utf-8');
  const creds: ServiceAccountCredentials = JSON.parse(raw);

  // 키 정규화: 모든 이스케이프된 \n을 실제 개행으로 변환
  const pem = creds.private_key
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .trim();

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = base64url(Buffer.from(JSON.stringify({
    iss: creds.client_email,
    scope: scopes.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })));

  const signingInput = `${header}.${payload}`;
  const privateKey = createPrivateKey({ key: pem, format: 'pem' });
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = base64url(sign.sign(privateKey));
  const jwt = `${signingInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const data = await res.json();
  if (!data.access_token) throw new Error(`서비스 계정 토큰 발급 실패: ${JSON.stringify(data)}`);

  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}
