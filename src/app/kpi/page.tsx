import Link from 'next/link';
import { redirect } from 'next/navigation';
import LoginNotice from '@/components/LoginNotice';
import PendingNotice from '@/components/PendingNotice';
import Forbidden from '@/components/Forbidden';
import DbErrorNotice from '@/components/DbErrorNotice';
import { getPartnerSummaries, KpiDataError } from '@/lib/kpi-data';
import { pageGate } from '@/lib/rbac';
import KpiExportButton from '@/components/KpiExportButton';
import type { PartnerStatus } from '@/types/accelerating';

export const dynamic = 'force-dynamic';

const statusLabel: Record<PartnerStatus, string> = {
  managing: '관리중',
  kpi_undefined: 'KPI 미정의',
  no_companies: '기업 미확정',
};

const statusBadge: Record<PartnerStatus, string> = {
  managing: 'bg-green-50 text-green-700 border-green-200',
  kpi_undefined: 'bg-amber-50 text-amber-700 border-amber-200',
  no_companies: 'bg-gray-100 text-gray-600 border-gray-200',
};

export default async function KpiDashboardPage() {
  // 가입 게이트
  const gate = await pageGate();
  if (gate.state === 'login') return <LoginNotice />;
  if (gate.state === 'register') redirect('/register');
  if (gate.state === 'pending') return <PendingNotice email={gate.email} />;
  const user = gate.user;
  // 현황판은 관리자 전용. partner 는 자기 대시보드로.
  if (user.role !== 'admin') {
    if (user.partnerId) redirect('/partner');
    return <Forbidden message="계정에 파트너가 매핑되어 있지 않습니다. 최고관리자에게 문의해주세요." />;
  }

  let partners;
  try {
    partners = await getPartnerSummaries();
  } catch (e) {
    const message = e instanceof KpiDataError ? e.message : '데이터베이스 연결에 실패했습니다.';
    return (
      <main className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">KPI 대시보드</h1>
        <DbErrorNotice message={message} />
      </main>
    );
  }

  const counts = {
    managing: partners.filter((p) => p.status === 'managing').length,
    kpi_undefined: partners.filter((p) => p.status === 'kpi_undefined').length,
    no_companies: partners.filter((p) => p.status === 'no_companies').length,
  };

  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">KPI 대시보드</h1>
          <p className="text-gray-500 text-sm mt-1">파트너 {partners.length}곳의 KPI 현황 종합</p>
        </div>
        <KpiExportButton />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-xs text-green-700 mb-1">정상 관리중</p>
          <p className="text-2xl font-bold text-green-700">{counts.managing}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-xs text-amber-700 mb-1">협약서 미제출 · KPI 미정의</p>
          <p className="text-2xl font-bold text-amber-700">{counts.kpi_undefined}</p>
        </div>
        <div className="bg-gray-100 border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-600 mb-1">참여기업 미확정</p>
          <p className="text-2xl font-bold text-gray-700">{counts.no_companies}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-left px-4 py-3 font-medium">No.</th>
              <th className="text-left px-4 py-3 font-medium">국가 / 파트너</th>
              <th className="text-center px-4 py-3 font-medium">참여기업</th>
              <th className="text-center px-4 py-3 font-medium">KPI</th>
              <th className="text-left px-4 py-3 font-medium w-64">달성률</th>
              <th className="text-center px-4 py-3 font-medium">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {partners.map((p) => {
              const rate = p.achievementRate;
              const barColor = (rate ?? 0) >= 70 ? 'bg-green-500' : (rate ?? 0) >= 40 ? 'bg-blue-500' : 'bg-orange-400';
              return (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400">{p.no}</td>
                  <td className="px-4 py-3">
                    <Link href={`/kpi/${p.id}`} className="hover:text-blue-600">
                      <span className="text-xs text-gray-400 block">{p.country}</span>
                      <span className="font-medium text-gray-900">{p.name}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-700">{p.companyCount}</td>
                  <td className="px-4 py-3 text-center text-gray-700">{p.kpiCount || '-'}</td>
                  <td className="px-4 py-3">
                    {rate === null ? (
                      <span className="text-xs text-gray-400">미정의</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full ${barColor} rounded-full`} style={{ width: `${rate}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-gray-700 w-9 text-right">{rate}%</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${statusBadge[p.status]}`}>
                      {statusLabel[p.status]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
