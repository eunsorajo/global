import Link from 'next/link';
import { auth, signIn, signOut } from '@/auth';
import { getNotificationBadgeCount } from '@/lib/notification-data';
import NavMobileMenu, { type NavLinkItem } from '@/components/NavMobileMenu';

export default async function Navbar() {
  const session = await auth();
  const role = session?.user?.role;
  const status = session?.user?.status;
  const isSuperAdmin = session?.user?.isSuperAdmin ?? false;
  const isActive = status === 'active';
  const isAdmin = role === 'admin' && isActive;
  const isPartner = role === 'partner' && isActive;

  // 알림 카운트는 활성 관리자에게만 의미가 있으므로 그때만 계산.
  const badgeCount = isAdmin ? await getNotificationBadgeCount() : 0;

  // 로그인 후 브랜드 링크 목적지: partner 는 자기 대시보드, admin/기타는 홈.
  const brandHref = isPartner ? '/partner' : '/';

  // 데스크톱/모바일 공용 메뉴 정의 (모바일 드로어는 NavMobileMenu 가 렌더).
  const links: NavLinkItem[] = [];
  if (isAdmin) {
    links.push(
      { href: '/', label: '파트너사 목록' },
      { href: '/business-partners', label: '사업파트너 관리' },
      { href: '/meetings/new', label: '회의록 가져오기' },
      { href: '/admin/sync', label: '시트 동기화' },
    );
    if (isSuperAdmin) links.push({ href: '/admin/users', label: '사용자 관리' });
    links.push({ href: '/notifications', label: '알림', badge: badgeCount });
  }
  if (isPartner) links.push({ href: '/partner', label: '내 대시보드' });

  return (
    <nav className="relative bg-white border-b border-gray-200 px-4 md:px-6 py-4 flex items-center justify-between">
      <Link href={brandHref} className="font-bold text-lg text-gray-900 tracking-tight whitespace-nowrap">
        Partner Network
      </Link>

      <div className="flex items-center gap-3 md:gap-6 text-sm text-gray-600">
        {/* 데스크톱 메뉴 (768px 미만에서는 햄버거로 대체 — 한국어 글자 세로쌓임 방지) */}
        <div className="hidden md:flex items-center gap-6">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="hover:text-blue-600 transition-colors whitespace-nowrap flex items-center gap-1"
            >
              {l.label}
              {l.badge != null && l.badge > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full min-w-4 h-4 px-1 flex items-center justify-center leading-none">
                  {l.badge > 99 ? '99+' : l.badge}
                </span>
              )}
            </Link>
          ))}
        </div>

        {session ? (
          <>
            <form action={async () => { 'use server'; await signOut(); }}>
              <button type="submit" className="hover:text-blue-600 transition-colors whitespace-nowrap">
                로그아웃
              </button>
            </form>
            <div className="w-8 h-8 shrink-0 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-semibold text-sm overflow-hidden">
              {session.user?.image
                ? <img src={session.user.image} alt="" className="w-full h-full object-cover" />
                : session.user?.name?.[0] ?? '?'}
            </div>
          </>
        ) : (
          <form action={async () => { 'use server'; await signIn('google'); }}>
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
              Google 로그인
            </button>
          </form>
        )}

        {/* 모바일 햄버거 (메뉴가 있을 때만) */}
        <NavMobileMenu links={links} />
      </div>
    </nav>
  );
}
