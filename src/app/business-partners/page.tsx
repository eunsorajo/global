import { redirect } from 'next/navigation';
import LoginNotice from '@/components/LoginNotice';
import PendingNotice from '@/components/PendingNotice';
import AcceleratingPartnerList from '@/components/AcceleratingPartnerList';
import DbErrorNotice from '@/components/DbErrorNotice';
import KpiExportButton from '@/components/KpiExportButton';
import { getPartnerSummaries, KpiDataError } from '@/lib/kpi-data';
import { getLatestMeetingDates } from '@/lib/meeting-data';
import { pageGate } from '@/lib/rbac';
import Forbidden from '@/components/Forbidden';

export const dynamic = 'force-dynamic';

// 사업 파트너 관리 — 참여기업·KPI 보유 파트너 13곳. 관리자 전용.
// 기존 홈(/)의 사업파트너 카드 목록 + /kpi 현황판 요약을 통합.
export default async function BusinessPartnersPage() {
  const gate = await pageGate();
  if (gate.state === 'login') return <LoginNotice />;
  if (gate.state === 'register') redirect('/register');
  if (gate.state === 'pending') return <PendingNotice email={gate.email} />;
  const user = gate.user;

  // 관리자 전용 → 파트너는 자기 대시보드로
  if (user.role !== 'admin') {
    if (user.partnerId) redirect('/partner');
    return <Forbidden message="계정에 파트너가 매핑되어 있지 않습니다. 관리자에게 문의해주세요." />;
  }

  let partners;
  let lastMeetingDates = new Map<string, string>();
  try {
    [partners, lastMeetingDates] = await Promise.all([
      getPartnerSummaries(),
      getLatestMeetingDates().catch(() => new Map<string, string>()),
    ]);
  } catch (e) {
    const message = e instanceof KpiDataError ? e.message : '데이터베이스 연결에 실패했습니다.';
    return (
      <main className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">사업파트너 관리</h1>
        <DbErrorNotice message={message} />
      </main>
    );
  }

  const totalCompanies = partners.reduce((s, p) => s + p.companyCount, 0);
  const submitted = partners.filter((p) => p.agreementSubmitted).length;
  const submitRate = partners.length > 0 ? Math.round((submitted / partners.length) * 100) : 0;

  // 상태 구분 카운트
  const statusCounts = {
    managing: partners.filter((p) => p.status === 'managing').length,
    kpi_undefined: partners.filter((p) => p.status === 'kpi_undefined').length,
    no_companies: partners.filter((p) => p.status === 'no_companies').length,
  };

  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">사업파트너 관리</h1>
          <p className="text-gray-500 text-sm mt-1">
            해외 액셀러레이팅 진행 중 — 사업 파트너 {partners.length}곳 · 참여기업·KPI 관리
          </p>
        </div>
        <KpiExportButton />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">사업 파트너</p>
          <p className="text-2xl font-bold text-gray-900">{partners.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">참여기업 총수</p>
          <p className="text-2xl font-bold text-blue-600">{totalCompanies}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">협약 제출 비율</p>
          <p className="text-2xl font-bold text-purple-600">{submitRate}%</p>
          <p className="text-xs text-gray-400 mt-0.5">{submitted}/{partners.length}곳</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">상태 구분</p>
          <p className="text-sm text-gray-700 mt-1 leading-relaxed">
            <span className="text-green-700 font-semibold">{statusCounts.managing}</span> 관리중 ·{' '}
            <span className="text-amber-700 font-semibold">{statusCounts.kpi_undefined}</span> KPI미정의 ·{' '}
            <span className="text-gray-600 font-semibold">{statusCounts.no_companies}</span> 기업미확정
          </p>
        </div>
      </div>

      <AcceleratingPartnerList
        partners={partners}
        lastMeetingDates={Object.fromEntries(lastMeetingDates)}
      />
    </main>
  );
}
