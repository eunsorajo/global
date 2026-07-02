import KpiPartnerTabs from '@/components/KpiPartnerTabs';
import type { PartnerMatrix } from '@/types/accelerating';

// 매트릭스로부터 달성 현황을 집계한다.
// (lib/kpi-data.getPartnerSummaries 와 동일한 규칙:
//  분모 = 기업수 × KPI수, 분자 = "✓ 달성"으로 찍힌 셀 수. 미입력 칸은 미달성(0).
//  파트너 레벨 달성 플래그는 달성률 계산에서 제외 — 매트릭스 표시 전용.)
function summarize(matrix: PartnerMatrix): { total: number; achieved: number; rate: number | null } {
  const { kpiDefinitions, companies, progress } = matrix;
  const total = kpiDefinitions.length * companies.length;
  let achieved = 0;
  for (const def of kpiDefinitions) {
    for (const company of companies) {
      const cell = progress[`${company.id}:${def.id}`];
      if (cell && cell.achieved === true) achieved += 1;
    }
  }
  const rate = total > 0 ? Math.round((achieved / total) * 100) : null;
  return { total, achieved, rate };
}

// 파트너 전용 대시보드(관리자 화면과 시각적으로 구분되는 단순 레이아웃).
// 회의록/알림 등 관리자 메뉴는 노출하지 않고 자기 KPI 에 집중한다.
export default function PartnerDashboard({ matrix }: { matrix: PartnerMatrix }) {
  const { partner, companies, kpiDefinitions } = matrix;
  const { total, achieved, rate } = summarize(matrix);
  const barColor = (rate ?? 0) >= 70 ? 'bg-green-500' : (rate ?? 0) >= 40 ? 'bg-blue-500' : 'bg-orange-400';

  return (
    <main className="max-w-5xl mx-auto px-6 py-8">
      {/* 파트너 식별 헤더 */}
      <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white p-6 mb-6">
        <p className="text-sm text-blue-100">No.{partner.no} · {partner.country}</p>
        <h1 className="text-2xl font-bold mt-0.5">{partner.name}</h1>
        <div className="flex flex-wrap gap-2 mt-3">
          <span
            className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
              partner.agreement_submitted ? 'bg-white/20 text-white' : 'bg-red-500/30 text-red-50'
            }`}
          >
            협약서 {partner.agreement_submitted ? '제출' : '미제출'}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/20 text-white whitespace-nowrap">참여기업 {companies.length}개사</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/20 text-white whitespace-nowrap">KPI {kpiDefinitions.length}개</span>
        </div>
      </div>

      {/* KPI 달성 현황 요약 */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="font-semibold text-gray-900 min-w-0">KPI 달성 현황</h2>
          {rate === null ? (
            <span className="text-sm text-gray-400 whitespace-nowrap">KPI 미정의</span>
          ) : (
            <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">
              달성 {achieved} / 전체 {total} · {rate}%
            </span>
          )}
        </div>
        {rate === null ? (
          <p className="text-sm text-gray-500">
            아래 “KPI 정의 · 기업 관리” 탭에서 KPI 항목을 정의하면 달성 현황이 표시됩니다.
          </p>
        ) : (
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${rate}%` }} />
          </div>
        )}
      </section>

      {/* KPI 매트릭스 + 정의·기업 관리 (자기 것만, 회의록 탭 없음) */}
      <KpiPartnerTabs matrix={matrix} meetings={[]} isAdmin={false} />
    </main>
  );
}
