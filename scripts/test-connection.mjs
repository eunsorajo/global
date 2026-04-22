import { readFileSync } from 'fs';
import { createSign, createPrivateKey } from 'crypto';

const env = readFileSync('.env.local', 'utf-8');
const envMap = Object.fromEntries(
  env.split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const creds = JSON.parse(Buffer.from(envMap.GOOGLE_CREDENTIALS_B64, 'base64').toString('utf-8'));
console.log('서비스 계정:', creds.client_email);

function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

const now = Math.floor(Date.now() / 1000);
const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
const payload = base64url(JSON.stringify({
  iss: creds.client_email,
  scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/cloud-platform',
  aud: 'https://oauth2.googleapis.com/token',
  iat: now, exp: now + 3600,
}));

const signingInput = `${header}.${payload}`;
const pem = creds.private_key.replace(/\\n/g, '\n');
const privateKey = createPrivateKey({ key: pem, format: 'pem' });
const sign = createSign('RSA-SHA256');
sign.update(signingInput);
const signature = base64url(sign.sign(privateKey));
const jwt = `${signingInput}.${signature}`;

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
});
const tokenData = await tokenRes.json();
if (!tokenData.access_token) { console.error('토큰 발급 실패:', JSON.stringify(tokenData, null, 2)); process.exit(1); }
console.log('✓ 서비스 계정 토큰 발급 성공\n');

const token = tokenData.access_token;

// Drive 연결 확인
const driveRes = await fetch(
  'https://www.googleapis.com/drive/v3/files?q=sharedWithMe&fields=files(id,name,mimeType)&pageSize=10',
  { headers: { Authorization: `Bearer ${token}` } }
);
const driveData = await driveRes.json();
if (driveData.error) {
  console.error('Drive 오류:', driveData.error.message);
} else {
  const files = driveData.files ?? [];
  console.log(`✓ Drive 접근 성공 — 공유된 항목 ${files.length}개:`);
  files.forEach(f => console.log(`  - ${f.name}  (id: ${f.id})`));
}

// Gemini 연결 확인
console.log('\nGemini 테스트 중...');
const geminiRes = await fetch(
  'https://asia-northeast3-aiplatform.googleapis.com/v1/projects/western-will-493410-j8/locations/asia-northeast3/publishers/google/models/gemini-2.0-flash-001:generateContent',
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: '안녕하세요. 한 문장으로만 응답해주세요.' }] }],
      generationConfig: { maxOutputTokens: 50 },
    }),
  }
);
const geminiData = await geminiRes.json();
if (geminiData.error) {
  console.error('Gemini 오류:', geminiData.error.message);
} else {
  const reply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  console.log('✓ Gemini 연결 성공:', reply.trim());
}
