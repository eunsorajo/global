// 시드 스크립트 — seed-data.json 을 Supabase 에 멱등하게 주입한다.
//
// 실행: node scripts/seed.mjs
//   - .env.local 을 직접 로드 (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
//   - service_role 키 사용 → RLS 우회
//   - upsert(onConflict) 로 재실행 시 중복 생성 없음
//   - 완료 후 partners / companies / kpi_definitions 카운트 출력 (검증 기준 13/71/46)
//
// 주의:
//   - participatingCompanyCount 는 참고용 숫자일 뿐, 실제 companies 배열을 시드한다.
//   - 동일 기업명이 여러 파트너에 등장해도 파트너별 별도 레코드로 둔다 (합치지 않음).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const seedPath = resolve(projectRoot, '../../기획/seed-data.json');

// ---------- .env.local 직접 로드 ----------
function loadEnv() {
  const envPath = resolve(projectRoot, '.env.local');
  let raw;
  try {
    raw = readFileSync(envPath, 'utf-8');
  } catch {
    console.error(`.env.local 을 찾을 수 없습니다: ${envPath}`);
    process.exit(1);
  }
  const map = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const i = trimmed.indexOf('=');
    const key = trimmed.slice(0, i).trim();
    let val = trimmed.slice(i + 1).trim();
    // 따옴표 제거
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    map[key] = val;
  }
  return map;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 가 .env.local 에 없습니다.');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------- 시드 데이터 로드 ----------
let seed;
try {
  seed = JSON.parse(readFileSync(seedPath, 'utf-8'));
} catch (e) {
  console.error(`seed-data.json 로드 실패 (${seedPath}): ${e.message}`);
  process.exit(1);
}

const partners = seed.partners ?? [];

// 테이블 존재 여부 사전 점검 (없으면 명확한 안내)
function isMissingTable(error) {
  if (!error) return false;
  const code = error.code ?? '';
  const msg = error.message ?? '';
  return code === 'PGRST205' || code === '42P01' || /does not exist|could not find the table/i.test(msg);
}

async function preflight() {
  const { error } = await supabase.from('partners').select('id').limit(1);
  if (isMissingTable(error)) {
    console.error('\n[중단] DB 테이블이 아직 생성되지 않았습니다.');
    console.error('먼저 supabase/migrations/001_kpi_schema.sql 을 Supabase 에 적용한 뒤 다시 실행하세요.\n');
    process.exit(1);
  }
  if (error) {
    console.error('DB 접근 오류:', error.message);
    process.exit(1);
  }
}

async function seedPartner(p) {
  // 1. 파트너 upsert (unique: country, name)
  const { data: partnerRow, error: pErr } = await supabase
    .from('partners')
    .upsert(
      {
        no: p.no,
        country: p.country,
        name: p.name,
        agreement_submitted: !!p.agreementSubmitted,
      },
      { onConflict: 'country,name' }
    )
    .select('id')
    .single();
  if (pErr) throw new Error(`파트너 '${p.name}' upsert 실패: ${pErr.message}`);
  const partnerId = partnerRow.id;

  // 2. 참여기업 upsert (unique: partner_id, no)
  const companies = p.companies ?? [];
  if (companies.length > 0) {
    const rows = companies.map((c) => ({
      partner_id: partnerId,
      no: c.no,
      name: c.name,
      sector: c.sector ?? null,
      description: c.description ?? null,
    }));
    const { error: cErr } = await supabase
      .from('companies')
      .upsert(rows, { onConflict: 'partner_id,no' });
    if (cErr) throw new Error(`'${p.name}' 기업 upsert 실패: ${cErr.message}`);
  }

  // 3. KPI 정의 upsert (unique: partner_id, kpi_order)
  const kpis = p.kpiDefinitions ?? [];
  if (kpis.length > 0) {
    const rows = kpis.map((k) => ({
      partner_id: partnerId,
      kpi_order: k.order,
      category: k.category ?? null,
      name: k.name,
      target: k.target ?? null,
      note: k.note ?? null,
    }));
    const { error: kErr } = await supabase
      .from('kpi_definitions')
      .upsert(rows, { onConflict: 'partner_id,kpi_order' });
    if (kErr) throw new Error(`'${p.name}' KPI 정의 upsert 실패: ${kErr.message}`);
  }

  return { partnerId, companyCount: companies.length, kpiCount: kpis.length };
}

async function main() {
  console.log('시드 시작...');
  console.log(`seed-data.json: 파트너 ${partners.length}개`);
  await preflight();

  let totalCompanies = 0;
  let totalKpis = 0;
  for (const p of partners) {
    const r = await seedPartner(p);
    totalCompanies += r.companyCount;
    totalKpis += r.kpiCount;
    console.log(`  ✓ [${p.no}] ${p.country} / ${p.name} — 기업 ${r.companyCount}, KPI ${r.kpiCount}`);
  }

  // ---------- 실제 DB 카운트로 검증 출력 ----------
  const [{ count: partnerCount }, { count: companyCount }, { count: kpiCount }] = await Promise.all([
    supabase.from('partners').select('*', { count: 'exact', head: true }),
    supabase.from('companies').select('*', { count: 'exact', head: true }),
    supabase.from('kpi_definitions').select('*', { count: 'exact', head: true }),
  ]);

  console.log('\n=== 시드 완료 (DB 실제 카운트) ===');
  console.log(`파트너:      ${partnerCount}  (기대값 13)`);
  console.log(`참여기업:    ${companyCount}  (기대값 71)`);
  console.log(`KPI 정의:    ${kpiCount}  (기대값 46)`);

  const ok = partnerCount === 13 && companyCount === 71 && kpiCount === 46;
  console.log(ok ? '\n✓ 검증 통과 (13 / 71 / 46)' : '\n⚠ 카운트가 기대값과 다릅니다. 데이터를 확인하세요.');
  if (!ok) process.exit(2);
}

main().catch((e) => {
  console.error('\n시드 실패:', e.message);
  process.exit(1);
});
