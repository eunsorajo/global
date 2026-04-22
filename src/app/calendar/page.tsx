import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import CalendarView from '@/components/CalendarView';

export default async function CalendarPage() {
  const session = await auth();
  if (!session?.accessToken) redirect('/api/auth/signin');

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
