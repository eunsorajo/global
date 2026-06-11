'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DirectoryListItem, DirectoryStatus } from '@/types/accelerating';

const statusBadge: Record<DirectoryStatus, string> = {
  사업: 'bg-blue-50 text-blue-700 border-blue-200',
  협력: 'bg-green-50 text-green-700 border-green-200',
  잠재: 'bg-amber-50 text-amber-700 border-amber-200',
};

const STATUS_FILTERS: ('전체' | DirectoryStatus)[] = ['전체', '사업', '협력', '잠재'];

interface NewForm {
  name: string;
  country: string;
  sector: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  website: string;
  last_contact_date: string;
  discovery_note: string;
  note: string;
}

const emptyForm: NewForm = {
  name: '',
  country: '',
  sector: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  website: '',
  last_contact_date: '',
  discovery_note: '',
  note: '',
};

export default function DirectoryList({ items }: { items: DirectoryListItem[] }) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<'전체' | DirectoryStatus>('전체');
  const [country, setCountry] = useState<string | null>(null);
  const [sector, setSector] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const countries = useMemo(
    () => Array.from(new Set(items.map((i) => i.country).filter(Boolean))) as string[],
    [items],
  );
  const sectors = useMemo(
    () => Array.from(new Set(items.map((i) => i.sector).filter(Boolean))) as string[],
    [items],
  );

  const filtered = items.filter((i) => {
    if (statusFilter !== '전체' && i.status !== statusFilter) return false;
    if (country && i.country !== country) return false;
    if (sector && i.sector !== sector) return false;
    return true;
  });

  function rowHref(i: DirectoryListItem): string {
    if (i.status === '사업' && i.businessPartnerId) return `/business-partners/${i.businessPartnerId}`;
    return `/partners/${i.id}`;
  }

  async function submitNew(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('파트너사명은 필수입니다.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '추가에 실패했습니다.');
      setForm(emptyForm);
      setShowForm(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  }

  const pill = (active: boolean) =>
    `text-xs px-3 py-1.5 rounded-full transition-colors ${
      active
        ? 'bg-blue-600 text-white'
        : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-600'
    }`;

  const input = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200';

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        {/* 필터 카드: 상태 / 국가 / 분야 행 사이에 가로 구분선 */}
        <div className="min-w-0 flex-1 bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
          <FilterRow label="상태">
            {STATUS_FILTERS.map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)} className={pill(statusFilter === s)}>
                {s}
              </button>
            ))}
          </FilterRow>
          {countries.length > 0 && (
            <FilterRow label="국가">
              <button onClick={() => setCountry(null)} className={pill(country === null)}>전체</button>
              {countries.map((c) => (
                <button key={c} onClick={() => setCountry(country === c ? null : c)} className={pill(country === c)}>
                  {c}
                </button>
              ))}
            </FilterRow>
          )}
          {sectors.length > 0 && (
            <FilterRow label="분야">
              <button onClick={() => setSector(null)} className={pill(sector === null)}>전체</button>
              {sectors.map((s) => (
                <button key={s} onClick={() => setSector(sector === s ? null : s)} className={pill(sector === s)}>
                  {s}
                </button>
              ))}
            </FilterRow>
          )}
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
        >
          {showForm ? '닫기' : '+ 파트너사 추가'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submitNew} className="bg-white border border-gray-200 rounded-xl p-5 mb-6 space-y-3">
          <p className="text-sm font-semibold text-gray-800">신규 파트너사 (잠재로 등록)</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">파트너사명 *</label>
              <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="text-xs text-gray-500">국가</label>
              <input className={input} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500">분야</label>
              <input className={input} value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500">최근 접촉일</label>
              <input type="date" className={input} value={form.last_contact_date} onChange={(e) => setForm({ ...form, last_contact_date: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500">담당자</label>
              <input className={input} value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500">담당자 이메일</label>
              <input type="email" className={input} value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500">담당자 연락처</label>
              <input className={input} value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500">웹사이트</label>
              <input className={input} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">발굴 경위</label>
            <textarea className={input} rows={2} value={form.discovery_note} onChange={(e) => setForm({ ...form, discovery_note: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-500">메모</label>
            <textarea className={input} rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg">
              {saving ? '저장 중...' : '추가'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setError(''); }} className="text-sm text-gray-500 px-4 py-2">
              취소
            </button>
          </div>
        </form>
      )}

      {/* 결과 카운트 */}
      <p className="text-xs text-gray-400 mb-2">
        총 {filtered.length}곳
        {filtered.length !== items.length && <span> (전체 {items.length}곳 중)</span>}
      </p>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">해당 조건의 파트너사가 없습니다.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm break-keep">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr className="border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium">파트너사 / 국가</th>
                <th className="text-center px-4 py-3 font-medium">상태</th>
                <th className="text-left px-4 py-3 font-medium">분야</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">최근 접촉일</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">발굴 경위</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((i) => (
                <tr
                  key={i.id}
                  onClick={() => router.push(rowHref(i))}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-400 block">{i.country ?? '-'}</span>
                    <span className="font-medium text-gray-900">{i.name}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${statusBadge[i.status]}`}>
                      {i.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{i.sector ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{i.last_contact_date ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate hidden md:table-cell">
                    {i.status === '잠재' ? (i.discovery_note ?? '-') : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// 필터 한 행 — 라벨 + 칩 목록. 행 사이 구분선은 부모의 divide-y 가 그린다.
function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 flex-wrap items-center px-4 py-2.5">
      <span className="text-xs text-gray-400 w-10 shrink-0">{label}</span>
      {children}
    </div>
  );
}
