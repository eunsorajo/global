import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import LoginNotice from '@/components/LoginNotice';
import Forbidden from '@/components/Forbidden';
import CalendarView from '@/components/CalendarView';
import { getSessionUser } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  // 인증 이후에만 캘린더 조회. 토큰 갱신 실패 시에도 재로그인 안내.
  const session = await auth();
  if (!session || !session.accessToken || session.error) {
    return <LoginNotice title="캘린더 연동을 위해 로그인이 필요합니다" />;
  }
  // 회의 일정은 관리자 전용 내부 운영 메뉴. partner 차단.
  const user = await getSessionUser();
  if (!user) return <LoginNotice title="캘린더 연동을 위해 로그인이 필요합니다" />;
  if (user.role !== 'admin') {
    if (user.partnerId) redirect(`/kpi/${user.partnerId}`);
    return <Forbidden message="계정에 파트너가 매핑되어 있지 않습니다. 관리자에게 문의해주세요." />;
  }

  return (
    <main className="max-w-7xl mx-auto px-6 py-6 flex flex-col" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">회의 일정</h1>
        <p className="text-gray-500 text-sm mt-1">Google 캘린더와 연동된 화상 회의 일정</p>
      </div>
      <div className="flex-1">
        <CalendarView />
      </div>
    </main>
  );
}
