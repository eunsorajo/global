import { redirect } from 'next/navigation';
import LoginNotice from '@/components/LoginNotice';
import AcceleratingPartnerList from '@/components/AcceleratingPartnerList';
import DbErrorNotice from '@/components/DbErrorNotice';
import { getPartnerSummaries, KpiDataError } from '@/lib/kpi-data';
import { getLatestMeetingDates } from '@/lib/meeting-data';
import { getSessionUser } from '@/lib/rbac';
import Forbidden from '@/components/Forbidden';

export const dynamic = 'force-dynamic';

export default async function Home() {
  // 인증 이후에만 데이터 조회
  const user = await getSessionUser();
  if (!user) return <LoginNotice />;
  // partner 는 파트너 목록 전체를 볼 수 없음 → 자기 KPI 로 이동
  if (user.role !== 'admin') {
    if (user.partnerId) redirect(`/kpi/${user.partnerId}`);
    // 파트너 매핑이 없는 비정상 상태 (DB 제약상 발생하지 않아야 함)
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
        <h1 className="text-2xl font-bold text-gray-900 mb-6">파트너 네트워크</h1>
        <DbErrorNotice message={message} />
      </main>
    );
  }

  const totalCompanies = partners.reduce((s, p) => s + p.companyCount, 0);
  const submitted = partners.filter((p) => p.agreementSubmitted).length;
  const submitRate = partners.length > 0 ? Math.round((submitted / partners.length) * 100) : 0;

  // 전체 달성률: KPI 가 정의된 파트너들의 판정 단위 합산
  const totalUnits = partners.reduce((s, p) => s + p.totalKpiUnits, 0);
  const achievedUnits = partners.reduce((s, p) => s + p.achievedCount, 0);
  const overallRate = totalUnits > 0 ? Math.round((achievedUnits / totalUnits) * 100) : 0;

  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">파트너 네트워크</h1>
        <p className="text-gray-500 text-sm mt-1">
          해외 액셀러레이팅 프로그램 — 국가별 현지 파트너 {partners.length}곳
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">전체 파트너</p>
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
          <p className="text-xs text-gray-500 mb-1">전체 KPI 달성률</p>
          <p className="text-2xl font-bold text-green-600">{overallRate}%</p>
        </div>
      </div>

      <AcceleratingPartnerList
        partners={partners}
        lastMeetingDates={Object.fromEntries(lastMeetingDates)}
      />
    </main>
  );
}
