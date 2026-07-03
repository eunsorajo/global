'use client';

import { useState } from 'react';

// 파트너용 매직링크 요청 폼. 이메일 입력 → /api/auth/magic/request 로 링크 발송 요청.
// 서버는 계정 열거 방지를 위해 항상 동일 응답을 주므로, 성공 UI도 동일하게 안내한다.
export default function MagicLinkForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setState('sending');
    setError(null);
    try {
      const res = await fetch('/api/auth/magic/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) throw new Error('요청에 실패했습니다.');
      setState('sent');
    } catch {
      setError('요청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      setState('idle');
    }
  }

  if (state === 'sent') {
    return (
      <div className="text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-left">
        입력하신 이메일이 등록되어 있으면 <b>로그인 링크</b>를 보냈습니다. 메일함(스팸함 포함)을 확인해주세요.
        링크는 <b>15분간 유효</b>하며 1회만 사용할 수 있습니다.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="text-left">
      <label className="block text-xs text-gray-500 mb-1">파트너 담당자 이메일</label>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-2 focus:outline-none focus:border-blue-400"
      />
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <button
        type="submit"
        disabled={state === 'sending'}
        className="w-full bg-gray-900 hover:bg-black disabled:opacity-50 text-white font-medium px-4 py-2.5 rounded-xl transition-colors"
      >
        {state === 'sending' ? '전송 중…' : '이메일로 로그인 링크 받기'}
      </button>
    </form>
  );
}
