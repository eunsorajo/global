import Link from 'next/link';
import { auth, signIn, signOut } from '@/auth';
import { getNotificationBadgeCount } from '@/lib/notification-data';

export default async function Navbar() {
  const session = await auth();
  const role = session?.user?.role;
  const partnerId = session?.user?.partnerId ?? null;
  const isAdmin = role === 'admin';

  // 알림 카운트는 관리자에게만 의미가 있으므로 admin 일 때만 계산.
  const badgeCount = isAdmin ? await getNotificationBadgeCount() : 0;

  // 로그인 후 브랜드 링크 목적지: partner 는 자기 KPI, admin/기타는 홈.
  const brandHref = role === 'partner' && partnerId ? `/kpi/${partnerId}` : '/';

  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <Link href={brandHref} className="font-bold text-lg text-gray-900 tracking-tight">
        Partner Network
      </Link>

      <div className="flex items-center gap-6 text-sm text-gray-600">
        {isAdmin && (
          <>
            <Link href="/" className="hover:text-blue-600 transition-colors">파트너 목록</Link>
            <Link href="/kpi" className="hover:text-blue-600 transition-colors">KPI 관리</Link>
            <Link href="/calendar" className="hover:text-blue-600 transition-colors">회의 일정</Link>
            <Link href="/meetings/new" className="hover:text-blue-600 transition-colors">회의록 가져오기</Link>
            <Link href="/admin/users" className="hover:text-blue-600 transition-colors">사용자 관리</Link>
          </>
        )}

        {role === 'partner' && partnerId && (
          <Link href={`/kpi/${partnerId}`} className="hover:text-blue-600 transition-colors">내 KPI</Link>
        )}

        {session ? (
          <>
            {isAdmin && (
              <Link href="/notifications" className="hover:text-blue-600 transition-colors flex items-center gap-1">
                알림
                {badgeCount > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full min-w-4 h-4 px-1 flex items-center justify-center leading-none">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </Link>
            )}
            <form action={async () => { 'use server'; await signOut(); }}>
              <button type="submit" className="hover:text-blue-600 transition-colors">로그아웃</button>
            </form>
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-semibold text-sm overflow-hidden">
              {session.user?.image
                ? <img src={session.user.image} alt="" className="w-full h-full object-cover" />
                : session.user?.name?.[0] ?? '?'}
            </div>
          </>
        ) : (
          <form action={async () => { 'use server'; await signIn('google'); }}>
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors">
              Google 로그인
            </button>
          </form>
        )}
      </div>
    </nav>
  );
}
