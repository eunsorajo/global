import Link from 'next/link';
import { auth, signIn, signOut } from '@/auth';

export default async function Navbar() {
  const session = await auth();

  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <Link href="/" className="font-bold text-lg text-gray-900 tracking-tight">
        Partner Network
      </Link>

      <div className="flex items-center gap-6 text-sm text-gray-600">
        <Link href="/" className="hover:text-blue-600 transition-colors">파트너 목록</Link>
        <Link href="/calendar" className="hover:text-blue-600 transition-colors">회의 일정</Link>
        <Link href="/search" className="hover:text-blue-600 transition-colors">AI 검색</Link>

        {session ? (
          <>
            <Link href="/notifications" className="hover:text-blue-600 transition-colors flex items-center gap-1">
              알림
              <span className="bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">1</span>
            </Link>
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
