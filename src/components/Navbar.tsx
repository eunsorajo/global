import Link from 'next/link';

export default function Navbar() {
  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <Link href="/" className="font-bold text-lg text-gray-900 tracking-tight">
        Partner Network
      </Link>
      <div className="flex items-center gap-6 text-sm text-gray-600">
        <Link href="/" className="hover:text-blue-600 transition-colors">파트너 목록</Link>
        <div className="relative">
          <button className="hover:text-blue-600 transition-colors flex items-center gap-1">
            알림
            <span className="bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
              1
            </span>
          </button>
        </div>
        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-semibold text-sm">
          김
        </div>
      </div>
    </nav>
  );
}
