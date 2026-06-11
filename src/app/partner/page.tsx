import { redirect } from 'next/navigation';
import LoginNotice from '@/components/LoginNotice';
import PendingNotice from '@/components/PendingNotice';
import Forbidden from '@/components/Forbidden';
import DbErrorNotice from '@/components/DbErrorNotice';
import PartnerDashboard from '@/components/PartnerDashboard';
import { getPartnerMatrix, KpiDataError } from '@/lib/kpi-data';
import { pageGate } from '@/lib/rbac';
import type { PartnerMatrix } from '@/types/accelerating';

export const dynamic = 'force-dynamic';

// 파트너 전용 대시보드 — 자기 파트너사 정보 + KPI 현황만.
// 관리자가 접근하면 전체 현황판(/kpi)으로 보낸다.
export default async function PartnerHomePage() {
  const gate = await pageGate();
  if (gate.state === 'login') return <LoginNotice />;
  if (gate.state === 'register') redirect('/register');
  if (gate.state === 'pending') return <PendingNotice email={gate.email} />;
  const user = gate.user;

  // 관리자는 파트너 대시보드 대상이 아님 → 관리자 현황판으로
  if (user.role === 'admin') redirect('/kpi');

  if (!user.partnerId) {
    return <Forbidden message="계정에 파트너가 매핑되어 있지 않습니다. 최고관리자에게 문의해주세요." />;
  }

  let matrix: PartnerMatrix | null;
  try {
    matrix = await getPartnerMatrix(user.partnerId);
  } catch (e) {
    const message = e instanceof KpiDataError ? e.message : '데이터베이스 연결에 실패했습니다.';
    return (
      <main className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">내 대시보드</h1>
        <DbErrorNotice message={message} />
      </main>
    );
  }

  if (!matrix) {
    return <Forbidden message="파트너 정보를 찾을 수 없습니다. 최고관리자에게 문의해주세요." />;
  }

  return <PartnerDashboard matrix={matrix} />;
}
