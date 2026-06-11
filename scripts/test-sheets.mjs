// Google Sheets 연결 검증 (read + write).
// .env.local 의 GOOGLE_CREDENTIALS_B64(서비스계정 JSON, base64)로 인증해
// 대상 시트의 메타데이터/샘플 셀을 읽고, 임시 탭을 만들어 쓰고 → 삭제한다.
// (기존 데이터는 건드리지 않는다.) 비밀키는 출력하지 않는다.
import fs from 'fs';
import { JWT } from 'google-auth-library';

const ENV_PATH = new URL('../.env.local', import.meta.url);
// 대상 시트: 사용자가 준 URL 기준 (env GOOGLE_SHEETS_ID 와 다를 수 있어 명시)
const SHEET_ID = process.argv[2] || '1450uBrnSPShJBbeWHq5HAwW_n2mB_E_FqyHhSW7If9U';
const TARGET_GID = 69228100;

function loadEnv() {
  const txt = fs.readFileSync(ENV_PATH, 'utf8');
  const env = {};
  for (const line of txt.split('\n')) {
    const i = line.indexOf('=');
    if (i > 0 && !line.startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1);
  }
  return env;
}

async function main() {
  const env = loadEnv();
  if (!env.GOOGLE_CREDENTIALS_B64) throw new Error('GOOGLE_CREDENTIALS_B64 없음');
  const creds = JSON.parse(Buffer.from(env.GOOGLE_CREDENTIALS_B64, 'base64').toString('utf8'));
  console.log('서비스계정:', creds.client_email);
  console.log('대상 시트:', SHEET_ID, '(env GOOGLE_SHEETS_ID=', env.GOOGLE_SHEETS_ID, ')');

  // private_key 의 이스케이프된 줄바꿈(\n)을 실제 개행으로 정규화 (PEM 디코딩용)
  const privateKey = String(creds.private_key).replace(/\\n/g, '\n');
  const client = new JWT({
    email: creds.client_email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const base = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;

  // 1) 메타데이터 읽기
  let meta;
  try {
    const r = await client.request({ url: `${base}?fields=properties.title,sheets.properties(sheetId,title,gridProperties)` });
    meta = r.data;
  } catch (e) {
    const status = e.response?.status;
    const msg = e.response?.data?.error?.message || e.message;
    console.error(`\n❌ 메타데이터 읽기 실패 (status ${status}): ${msg}`);
    if (status === 403) console.error('→ 원인 추정: 시트가 서비스계정에 공유 안 됨, 또는 Sheets API 미활성.');
    if (status === 404) console.error('→ 원인 추정: 시트 ID 오류 또는 접근 불가.');
    process.exit(1);
  }
  console.log('\n✅ READ OK — 문서명:', meta.properties?.title);
  console.log('탭 목록:');
  for (const s of meta.sheets) {
    const p = s.properties;
    const mark = p.sheetId === TARGET_GID ? '  ← 대상(gid)' : '';
    console.log(`  - "${p.title}" (gid ${p.sheetId}, ${p.gridProperties?.rowCount}행 x ${p.gridProperties?.columnCount}열)${mark}`);
  }

  const target = meta.sheets.find((s) => s.properties.sheetId === TARGET_GID) || meta.sheets[0];
  const title = target.properties.title;

  // 2) 대상 탭 샘플 읽기 (A1:H5)
  const range = encodeURIComponent(`${title}!A1:H5`);
  const rr = await client.request({ url: `${base}/values/${range}` });
  console.log(`\n샘플 데이터 ("${title}" A1:H5):`);
  for (const row of rr.data.values || []) console.log('  ', JSON.stringify(row));
  if (!rr.data.values) console.log('  (빈 범위)');

  // 3) 쓰기 검증 — 임시 탭 생성 → 쓰기 → 읽기 → 삭제 (기존 데이터 무손상)
  const tmpTitle = `__synctest_${Date.now()}`;
  let tmpId;
  try {
    const add = await client.request({
      url: `${base}:batchUpdate`,
      method: 'POST',
      data: { requests: [{ addSheet: { properties: { title: tmpTitle } } }] },
    });
    tmpId = add.data.replies[0].addSheet.properties.sheetId;
    const wRange = encodeURIComponent(`${tmpTitle}!A1`);
    await client.request({
      url: `${base}/values/${wRange}?valueInputOption=RAW`,
      method: 'PUT',
      data: { values: [['sync-test-ok']] },
    });
    const back = await client.request({ url: `${base}/values/${wRange}` });
    const wrote = back.data.values?.[0]?.[0];
    console.log(`\n✅ WRITE OK — 임시 탭 "${tmpTitle}"에 기록/회독: "${wrote}"`);
  } catch (e) {
    const status = e.response?.status;
    const msg = e.response?.data?.error?.message || e.message;
    console.error(`\n❌ WRITE 실패 (status ${status}): ${msg}`);
    if (status === 403) console.error('→ 서비스계정이 "편집자"가 아니라 "뷰어"로 공유됐을 수 있음.');
    process.exit(1);
  } finally {
    if (tmpId != null) {
      await client.request({
        url: `${base}:batchUpdate`,
        method: 'POST',
        data: { requests: [{ deleteSheet: { sheetId: tmpId } }] },
      });
      console.log(`임시 탭 삭제 완료 (정리됨).`);
    }
  }

  console.log('\n🎉 read + write 모두 정상. 동기화 구현 진행 가능.');
}

main().catch((e) => {
  console.error('예상치 못한 오류:', e.message);
  process.exit(1);
});
