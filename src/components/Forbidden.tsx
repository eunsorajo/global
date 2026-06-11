import Link from 'next/link';

// 로그인했지만 권한이 없는 사용자에게 노출하는 403 화면 (서버에서 차단).
export default function Forbidden({
  title = '접근 권한이 없습니다',
  message = '이 페이지에 접근할 권한이 없습니다. 권한이 필요하면 관리자에게 문의해주세요.',
  homeHref,
}: {
  title?: string;
  message?: string;
  // 돌아갈 링크 (partner 는 자기 KPI 페이지로)
  homeHref?: string;
}) {
  return (
    <main className="max-w-md mx-auto px-6 py-20 text-center">
      <div className="bg-white rounded-2xl border border-gray-200 p-8">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center text-red-500 text-2xl">
          ✕
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">{title}</h1>
        <p className="text-sm text-gray-500 mb-6">{message}</p>
        {homeHref && (
          <Link
            href={homeHref}
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            내 KPI 페이지로 이동
          </Link>
        )}
      </div>
    </main>
  );
}
