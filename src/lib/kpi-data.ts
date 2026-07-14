// 서버 전용 KPI 데이터 접근 계층.
// 페이지(서버 컴포넌트)와 API 라우트가 공유한다.
import 'server-only';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';
import type {
  PartnerRow,
  CompanyRow,
  KpiDefinitionRow,
  KpiProgressRow,
  PartnerSummary,
  PartnerStatus,
  PartnerMatrix,
  MatrixCell,
} from '@/types/accelerating';

export class KpiDataError extends Error {}

function deriveStatus(agreementSubmitted: boolean, kpiCount: number, companyCount: number): PartnerStatus {
  if (companyCount === 0) return 'no_companies';
  if (kpiCount === 0) return 'kpi_undefined';
  return 'managing';
}

// 파트너 목록 + 집계 (목록/대시보드 공용)
export async function getPartnerSummaries(): Promise<PartnerSummary[]> {
  const supabase = getSupabaseAdmin();

  const [partnersRes, companiesRes, defsRes, progressRes] = await Promise.all([
    supabase.from('partners').select('*').order('no', { ascending: true }),
    supabase.from('companies').select('id, partner_id'),
    supabase.from('kpi_definitions').select('id, partner_id'),
    supabase.from('kpi_progress').select('kpi_definition_id, company_id, achieved'),
  ]);

  for (const r of [partnersRes, companiesRes, defsRes, progressRes]) {
    if (r.error) throw new KpiDataError(describeSupabaseError(r.error));
  }

  const partners = (partnersRes.data ?? []) as PartnerRow[];
  const companies = (companiesRes.data ?? []) as { id: string; partner_id: string }[];
  const defs = (defsRes.data ?? []) as { id: string; partner_id: string }[];
  const progress = (progressRes.data ?? []) as { kpi_definition_id: string; company_id: string; achieved: boolean | null }[];

  // 인덱스 구성
  // 파트너별 기업 집합 (존재하는 기업만 — 분모 = 기업수 × KPI수, 고아 진척도 행 방어용)
  const companyIdsByPartner = new Map<string, Set<string>>();
  for (const c of companies) {
    let set = companyIdsByPartner.get(c.partner_id);
    if (!set) {
      set = new Set<string>();
      companyIdsByPartner.set(c.partner_id, set);
    }
    set.add(c.id);
  }

  // 파트너별 KPI 정의 수 + 정의 → 파트너 매핑
  const kpiCountByPartner = new Map<string, number>();
  const defToPartner = new Map<string, string>();
  for (const d of defs) {
    kpiCountByPartner.set(d.partner_id, (kpiCountByPartner.get(d.partner_id) ?? 0) + 1);
    defToPartner.set(d.id, d.partner_id);
  }

  // 파트너별 "✓ 달성" 셀 수 (셀 단위 집계).
  // 존재하는 기업의 셀만 카운트 → 삭제된 기업의 고아 진척도 행이 100%를 넘기는 것 방지.
  const achievedCellsByPartner = new Map<string, number>();
  for (const p of progress) {
    if (p.achieved !== true) continue;
    const partnerId = defToPartner.get(p.kpi_definition_id);
    if (!partnerId) continue;
    const companySet = companyIdsByPartner.get(partnerId);
    if (!companySet || !companySet.has(p.company_id)) continue;
    achievedCellsByPartner.set(partnerId, (achievedCellsByPartner.get(partnerId) ?? 0) + 1);
  }

  return partners.map((partner) => {
    const companyCount = companyIdsByPartner.get(partner.id)?.size ?? 0;
    const kpiCount = kpiCountByPartner.get(partner.id) ?? 0;

    // 달성률 = ✓달성 셀 수 / (기업수 × KPI수).
    //   모든 (기업 × KPI) 칸을 1단위로 보고, "✓ 달성"으로 찍힌 칸만 분자로 센다.
    //   미입력·미정·미달성 칸은 전부 미달성(0)으로 간주.
    //   파트너 레벨 달성 플래그(kpi_definitions.achieved)는 달성률 계산에서 제외 — 매트릭스 표시 전용.
    const totalUnits = companyCount * kpiCount;
    const achievedUnits = achievedCellsByPartner.get(partner.id) ?? 0;
    const achievementRate = totalUnits > 0
      ? Math.round((achievedUnits / totalUnits) * 100)
      : null;

    return {
      id: partner.id,
      no: partner.no,
      country: partner.country,
      name: partner.name,
      agreementSubmitted: partner.agreement_submitted,
      companyCount,
      kpiCount,
      status: deriveStatus(partner.agreement_submitted, kpiCount, companyCount),
      achievementRate,
      achievedCount: achievedUnits,
      totalKpiUnits: totalUnits,
    } satisfies PartnerSummary;
  });
}

// ---------- RBAC: 리소스 → 소속 파트너 조회 (서버 측 권한 검증용) ----------
// 클라이언트가 보낸 partnerId 를 신뢰하지 않고, 대상 리소스의 실제 partner_id 를 DB 에서 확인한다.

// company_id → partner_id (없으면 null)
export async function getCompanyPartnerId(companyId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('companies')
    .select('partner_id')
    .eq('id', companyId)
    .maybeSingle();
  if (error) throw new KpiDataError(describeSupabaseError(error));
  return (data as { partner_id: string } | null)?.partner_id ?? null;
}

// kpi_definition_id → partner_id (없으면 null)
export async function getKpiDefinitionPartnerId(definitionId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('kpi_definitions')
    .select('partner_id')
    .eq('id', definitionId)
    .maybeSingle();
  if (error) throw new KpiDataError(describeSupabaseError(error));
  return (data as { partner_id: string } | null)?.partner_id ?? null;
}

// partner 가 존재하는지 + 협약서 제출 여부 (partner 의 KPI 정의 입력 가능 시점 판단용)
export async function getPartnerAgreement(partnerId: string): Promise<{ exists: boolean; submitted: boolean }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('partners')
    .select('agreement_submitted')
    .eq('id', partnerId)
    .maybeSingle();
  if (error) throw new KpiDataError(describeSupabaseError(error));
  if (!data) return { exists: false, submitted: false };
  return { exists: true, submitted: (data as { agreement_submitted: boolean }).agreement_submitted };
}

// 단일 파트너 매트릭스 (KPI 상세 화면)
export async function getPartnerMatrix(partnerId: string): Promise<PartnerMatrix | null> {
  const supabase = getSupabaseAdmin();

  const partnerRes = await supabase.from('partners').select('*').eq('id', partnerId).maybeSingle();
  if (partnerRes.error) throw new KpiDataError(describeSupabaseError(partnerRes.error));
  if (!partnerRes.data) return null;
  const partner = partnerRes.data as PartnerRow;

  const [companiesRes, defsRes] = await Promise.all([
    supabase.from('companies').select('*').eq('partner_id', partnerId).order('no', { ascending: true }),
    supabase.from('kpi_definitions').select('*').eq('partner_id', partnerId).order('kpi_order', { ascending: true }),
  ]);
  if (companiesRes.error) throw new KpiDataError(describeSupabaseError(companiesRes.error));
  if (defsRes.error) throw new KpiDataError(describeSupabaseError(defsRes.error));

  const companies = (companiesRes.data ?? []) as CompanyRow[];
  const kpiDefinitions = (defsRes.data ?? []) as KpiDefinitionRow[];

  const defIds = kpiDefinitions.map((d) => d.id);
  let progressRows: KpiProgressRow[] = [];
  if (defIds.length > 0) {
    const progRes = await supabase
      .from('kpi_progress')
      .select('*')
      .in('kpi_definition_id', defIds);
    if (progRes.error) throw new KpiDataError(describeSupabaseError(progRes.error));
    progressRows = (progRes.data ?? []) as KpiProgressRow[];
  }

  const progress: Record<string, MatrixCell> = {};
  for (const row of progressRows) {
    progress[`${row.company_id}:${row.kpi_definition_id}`] = {
      progressId: row.id,
      companyId: row.company_id,
      kpiDefinitionId: row.kpi_definition_id,
      value: row.value,
      progressCurrent: row.progress_current,
      progressTarget: row.progress_target,
      achieved: row.achieved,
      note: row.note,
    };
  }

  return { partner, companies, kpiDefinitions, progress };
}
