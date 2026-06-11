'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface PartnerOption {
  id: string;
  name: string;
  country: string;
}

// 가입 유형: 조직(SBA) 이용자 → admin, 파트너사 → partner
type AccountType = 'org' | 'partner';

export default function RegisterForm({ partners }: { partners: PartnerOption[] }) {
  const router = useRouter();
  const [type, setType] = useState<AccountType>('org');
  const [name, setName] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    if (!name.trim()) {
      setError('이름을 입력해주세요.');
      return;
    }
    if (type === 'partner' && !partnerId) {
      setError('소속 파트너사를 선택해주세요.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          name: name.trim(),
          partnerId: type === 'partner' ? partnerId : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? '신청에 실패했습니다.');
      // 신청 완료 → 승인 대기 화면으로 (세션 토큰이 갱신되며 pending 으로 반영)
      router.refresh();
      router.push('/register');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const typeBtn = (active: boolean) =>
    `flex-1 rounded-xl border p-4 text-left transition-colors ${
      active ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-gray-200 hover:border-gray-300'
    }`;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">이용 유형</label>
        <div className="flex flex-col sm:flex-row gap-3">
          <button type="button" onClick={() => setType('org')} className={typeBtn(type === 'org')}>
            <span className="block font-semibold text-gray-900">조직(SBA) 이용자</span>
            <span className="block text-xs text-gray-500 mt-1">전체 파트너 현황을 관리합니다.</span>
          </button>
          <button type="button" onClick={() => setType('partner')} className={typeBtn(type === 'partner')}>
            <span className="block font-semibold text-gray-900">파트너사</span>
            <span className="block text-xs text-gray-500 mt-1">소속 파트너의 KPI를 관리합니다.</span>
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="홍길동"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
        />
      </div>

      {type === 'partner' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">소속 파트너사</label>
          <select
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
          >
            <option value="">선택하세요</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.country} / {p.name}
              </option>
            ))}
          </select>
          {partners.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">파트너 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>
          )}
        </div>
      )}

      <button
        onClick={submit}
        disabled={busy}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-3 rounded-xl transition-colors disabled:opacity-50"
      >
        {busy ? '신청 중…' : '가입 신청'}
      </button>
      <p className="text-xs text-gray-400 text-center">신청 후 최고관리자의 승인을 기다려주세요.</p>
    </div>
  );
}
