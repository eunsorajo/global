'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';

// 파트너용 이메일+비밀번호 로그인 폼.
// 관리자가 /admin/users 에서 발급한 회사 이메일 + 비밀번호로 로그인한다.
export default function PasswordLoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signIn('password', {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (res?.ok && !res.error) {
        window.location.assign('/partner');
      } else {
        setError('이메일 또는 비밀번호가 올바르지 않습니다.');
      }
    } catch {
      setError('로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="text-left">
      <label className="block text-xs text-gray-500 mb-1">이메일</label>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        autoComplete="username"
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-blue-400"
      />
      <label className="block text-xs text-gray-500 mb-1">비밀번호</label>
      <input
        type="password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="비밀번호"
        autoComplete="current-password"
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-2 focus:outline-none focus:border-blue-400"
      />
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full bg-gray-900 hover:bg-black disabled:opacity-50 text-white font-medium px-4 py-2.5 rounded-xl transition-colors"
      >
        {busy ? '로그인 중…' : '파트너 로그인'}
      </button>
      <p className="text-[11px] text-gray-400 mt-2">
        비밀번호는 SBA 담당자가 발급합니다. 분실 시 담당자에게 재설정을 요청하세요.
      </p>
    </form>
  );
}
