// 해외 액셀러레이팅 프로그램 — KPI 관리 도메인 타입
// (기존 CRM 성격의 src/types/partner.ts 와는 별개 도메인)

export type KpiCategory = '공통' | '특화';

// ---------- DB row 타입 (snake_case, Supabase 응답과 1:1) ----------

export interface PartnerRow {
  id: string;
  no: number;
  country: string;
  name: string;
  agreement_submitted: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanyRow {
  id: string;
  partner_id: string;
  no: number;
  name: string;
  sector: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface KpiDefinitionRow {
  id: string;
  partner_id: string;
  kpi_order: number;
  category: KpiCategory | null;
  name: string;
  target: string | null;
  achieved: boolean | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface KpiProgressRow {
  id: string;
  company_id: string;
  kpi_definition_id: string;
  value: string | null;
  achieved: boolean | null;
  note: string | null;
  updated_at: string;
}

// ---------- 화면용 집계 타입 ----------

// 파트너 상태: 정상 관리중 / KPI 미정의(협약 미제출) / 참여기업 미확정
export type PartnerStatus = 'managing' | 'kpi_undefined' | 'no_companies';

export interface PartnerSummary {
  id: string;
  no: number;
  country: string;
  name: string;
  agreementSubmitted: boolean;
  companyCount: number;
  kpiCount: number;
  status: PartnerStatus;
  // KPI 달성률(%) — 정의된 KPI 가 있을 때만 계산, 없으면 null
  achievementRate: number | null;
  // 달성 처리된 KPI 셀(또는 파트너레벨 KPI) 수 / 전체 판정 대상 수
  achievedCount: number;
  totalKpiUnits: number;
}

// KPI 매트릭스 한 셀 (기업 × KPI)
export interface MatrixCell {
  progressId: string | null; // 아직 진척도 row 가 없으면 null
  companyId: string;
  kpiDefinitionId: string;
  value: string | null;
  achieved: boolean | null;
  note: string | null;
}

// 파트너 KPI 상세 화면 전체 데이터
export interface PartnerMatrix {
  partner: PartnerRow;
  companies: CompanyRow[];
  kpiDefinitions: KpiDefinitionRow[];
  // key: `${companyId}:${kpiDefinitionId}` → cell
  progress: Record<string, MatrixCell>;
}
