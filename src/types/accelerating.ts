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

// ---------- 파트너 디렉토리 (2계층: 사업/협력/잠재) ----------

// 관계 단계 상태. 잠재 → 협력 → 사업 순으로 승격.
export type DirectoryStatus = '사업' | '협력' | '잠재';

// partner_directory row (snake_case, Supabase 응답과 1:1)
export interface PartnerDirectoryRow {
  id: string;
  name: string;
  country: string | null;
  status: DirectoryStatus;
  sector: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  last_contact_date: string | null; // date (YYYY-MM-DD)
  discovery_note: string | null;
  note: string | null;
  // 시트("1-1. 잠재 파트너사 DB") 매핑용 확장 컬럼 (마이그레이션 006)
  city: string | null; // 도시
  category: string | null; // 구분
  biz_summary: string | null; // 주요 사업
  sba_owner: string | null; // 담당자 (SBA 내부)
  contact_title: string | null; // 직급 (파트너 담당자)
  future_plan: string | null; // 향후 협업계획
  // 양방향 동기화 안정 키 / 시각 (마이그레이션 006)
  sheet_row_id: string | null;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

// 디렉토리 목록 항목 (행 클릭 분기를 위해 사업 파트너의 partners.id 동봉)
export interface DirectoryListItem extends PartnerDirectoryRow {
  // status='사업' 이고 partners 상세가 연결돼 있으면 그 partners.id, 아니면 null.
  // 행 클릭 시: 사업+businessPartnerId → /business-partners/[businessPartnerId],
  //            그 외 → /partners/[directory.id]
  businessPartnerId: string | null;
}

// 디렉토리 생성/수정 입력 (서버에서 검증 후 사용)
export interface DirectoryInput {
  name?: string;
  country?: string | null;
  sector?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  website?: string | null;
  last_contact_date?: string | null;
  discovery_note?: string | null;
  note?: string | null;
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
