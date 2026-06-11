import { auth } from '@/auth';
import LoginNotice from '@/components/LoginNotice';
import CalendarView from '@/components/CalendarView';

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  // 인증 이후에만 캘린더 조회. 토큰 갱신 실패 시에도 재로그인 안내.
  const session = await auth();
  if (!session || !session.accessToken || session.error) {
    return <LoginNotice title="캘린더 연동을 위해 로그인이 필요합니다" />;
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
