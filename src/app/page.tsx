import { redirect } from 'next/navigation';
import LoginNotice from '@/components/LoginNotice';
import PendingNotice from '@/components/PendingNotice';
import DirectoryList from '@/components/DirectoryList';
import DbErrorNotice from '@/components/DbErrorNotice';
import SheetPullPoller from '@/components/SheetPullPoller';
import { getDirectoryList, DirectoryDataError } from '@/lib/directory-data';
import { pageGate } from '@/lib/rbac';
import Forbidden from '@/components/Forbidden';

export const dynamic = 'force-dynamic';

// 홈(/) — 전체 파트너사 디렉토리(사업/협력/잠재). 관리자 전용.
export default async function Home() {
  // 가입 게이트: 미인증/미신청/승인대기 처리
  const gate = await pageGate();
  if (gate.state === 'login') return <LoginNotice />;
  if (gate.state === 'register') redirect('/register');
  if (gate.state === 'pending') return <PendingNotice email={gate.email} />;
  const user = gate.user;

  // 디렉토리는 관리자 전용 → 파트너는 자기 대시보드로
  if (user.role !== 'admin') {
    if (user.partnerId) redirect('/partner');
    return <Forbidden message="계정에 파트너가 매핑되어 있지 않습니다. 관리자에게 문의해주세요." />;
  }

  let items;
  try {
    items = await getDirectoryList();
  } catch (e) {
    const message = e instanceof DirectoryDataError ? e.message : '데이터베이스 연결에 실패했습니다.';
    return (
      <main className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">파트너사 목록</h1>
        <DbErrorNotice message={message} />
      </main>
    );
  }

  const counts = {
    total: items.length,
    business: items.filter((i) => i.status === '사업').length,
    cooperation: items.filter((i) => i.status === '협력').length,
    potential: items.filter((i) => i.status === '잠재').length,
  };

  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">파트너사 목록</h1>
          <p className="text-gray-500 text-sm mt-1">
            전체 파트너사 디렉토리 — 사업 · 협력 · 잠재 단계 통합 관리
          </p>
        </div>
        {/* 관리자 전용(이 페이지는 server 에서 admin 확정) 시트 자동 동기화 폴러 */}
        <SheetPullPoller />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">전체 파트너사</p>
          <p className="text-2xl font-bold text-gray-900">{counts.total}</p>
        </div>
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
          <p className="text-xs text-blue-700 mb-1">사업 파트너</p>
          <p className="text-2xl font-bold text-blue-700">{counts.business}</p>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-200 p-4">
          <p className="text-xs text-green-700 mb-1">협력 파트너</p>
          <p className="text-2xl font-bold text-green-700">{counts.cooperation}</p>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
          <p className="text-xs text-amber-700 mb-1">잠재 파트너</p>
          <p className="text-2xl font-bold text-amber-700">{counts.potential}</p>
        </div>
      </div>

      <DirectoryList items={items} />
    </main>
  );
}
