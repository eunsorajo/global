'use client';

// 모바일(<768px) 전용 햄버거 메뉴.
// 한국어 메뉴가 좁은 화면에서 글자 단위로 세로 쌓이는 것을 막기 위해
// 768px 미만에서는 가로 나열 대신 드로어로 전환한다 (데스크톱 메뉴는 Navbar 서버 컴포넌트 그대로).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavLinkItem {
  href: string;
  label: string;
  badge?: number;
}

export default function NavMobileMenu({ links }: { links: NavLinkItem[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // 경로가 바뀌면(메뉴로 이동하면) 드로어를 닫는다.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (links.length === 0) return null;

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="메뉴 열기"
        className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
      >
        {/* 햄버거 / 닫기 아이콘 */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          {open ? (
            <>
              <line x1="5" y1="5" x2="19" y2="19" />
              <line x1="19" y1="5" x2="5" y2="19" />
            </>
          ) : (
            <>
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </>
          )}
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-40 border-b border-gray-200 bg-white shadow-lg">
          <ul className="divide-y divide-gray-100">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="flex items-center justify-between px-6 py-3 text-sm text-gray-700 break-keep hover:bg-gray-50 hover:text-blue-600"
                >
                  <span>{l.label}</span>
                  {l.badge != null && l.badge > 0 && (
                    <span className="bg-red-500 text-white text-xs rounded-full min-w-4 h-4 px-1 flex items-center justify-center leading-none">
                      {l.badge > 99 ? '99+' : l.badge}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
