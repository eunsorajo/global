'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';

// 매직링크 착지 페이지. 메일 링크(?token=&email=)를 열면 여기서
// signIn('magic-token') 으로 토큰을 검증·소비하고 세션을 발급한다.
function VerifyInner() {
  const sp = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = sp.get('token');
    const email = sp.get('email');
    if (!token || !email) {
      setError('로그인 링크가 올바르지 않습니다.');
      return;
    }
    let cancelled = false;
    signIn('magic-token', { email, token, redirect: false })
      .then((res) => {
        if (cancelled) return;
        if (res?.ok && !res.error) {
          window.location.assign('/partner');
        } else {
          setError('링크가 만료되었거나 이미 사용되었습니다. 로그인 화면에서 다시 요청해주세요.');
        }
      })
      .catch(() => {
        if (!cancelled) setError('로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      });
    return () => {
      cancelled = true;
    };
  }, [sp]);

  return (
    <main className="max-w-md mx-auto px-6 py-20 text-center">
      <div className="bg-white rounded-2xl border border-gray-200 p-8">
        {error ? (
          <>
            <h1 className="text-xl font-bold text-gray-900 mb-2">로그인할 수 없습니다</h1>
            <p className="text-sm text-gray-500 mb-6">{error}</p>
            <a href="/" className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-xl">
              로그인 화면으로
            </a>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-gray-900 mb-2">로그인 중…</h1>
            <p className="text-sm text-gray-500">잠시만 기다려주세요.</p>
          </>
        )}
      </div>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<main className="max-w-md mx-auto px-6 py-20 text-center text-gray-500">로그인 중…</main>}>
      <VerifyInner />
    </Suspense>
  );
}
