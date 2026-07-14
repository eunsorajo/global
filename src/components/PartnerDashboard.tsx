import KpiPartnerTabs from '@/components/KpiPartnerTabs';
import type { PartnerMatrix } from '@/types/accelerating';

// 매트릭스로부터 달성 현황(정량)을 집계한다.
// (lib/kpi-data.getPartnerSummaries 와 동일한 규칙:
//  달성률 = 진행률 합 ÷ 전체 칸수(기업수 × KPI수).
//   칸별 진행률(0~1): ✓달성=1, ✗미달성·빈칸=0, 미정+목표입력=현재÷목표(상한 1).
//   → 목표 미입력·미판정 칸도 분모에 포함되어 0%로 반영.)
function summarize(matrix: PartnerMatrix): { total: number; achieved: number; rate: number | null } {
  const { kpiDefinitions, companies, progress } = matrix;
  const total = kpiDefinitions.length * companies.length;
  let sum = 0;
  for (const def of kpiDefinitions) {
    for (const company of companies) {
      const cell = progress[`${company.id}:${def.id}`];
      if (!cell) continue;
      if (cell.achieved === true) sum += 1;
      else if (cell.achieved === false) sum += 0;
      else if (cell.progressTarget != null && cell.progressTarget > 0) {
        sum += Math.min((cell.progressCurrent ?? 0) / cell.progressTarget, 1);
      }
    }
  }
  const rate = total > 0 ? Math.round((sum / total) * 100) : null;
  return { total, achieved: Math.round(sum), rate };
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
          {partner.program_type && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/25 text-white whitespace-nowrap font-medium">
              {partner.program_type}
            </span>
          )}
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
              달성 {achieved} / 전체 {total}칸 · {rate}%
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
