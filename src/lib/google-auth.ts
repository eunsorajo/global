// 서비스 계정으로 Google API 액세스 토큰 발급
// Drive/Sheets는 사용자 로그인 없이 서비스 계정으로 접근합니다.

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getServiceAccountToken(
  scopes: string[] = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/cloud-platform',
  ]
): Promise<string> {
  // 토큰이 유효하면 재사용 (만료 1분 전까지)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const raw = Buffer.from(process.env.GOOGLE_CREDENTIALS_B64!, 'base64').toString('utf-8');
  const creds: ServiceAccountCredentials = JSON.parse(raw);

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: creds.client_email,
    scope: scopes.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  // JWT 서명 (RS256)
  const { SignJWT } = await import('jose');
  const privateKey = await import('jose').then((jose) =>
    jose.importPKCS8(creds.private_key, 'RS256')
  );

  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256' })
    .sign(privateKey);

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
