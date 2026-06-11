'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DirectoryListItem, DirectoryStatus } from '@/types/accelerating';

const statusBadge: Record<DirectoryStatus, string> = {
  사업: 'bg-blue-50 text-blue-700 border-blue-200',
  협력: 'bg-green-50 text-green-700 border-green-200',
  잠재: 'bg-amber-50 text-amber-700 border-amber-200',
};

interface EditForm {
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

function toForm(i: DirectoryListItem): EditForm {
  return {
    name: i.name ?? '',
    country: i.country ?? '',
    sector: i.sector ?? '',
    contact_name: i.contact_name ?? '',
    contact_email: i.contact_email ?? '',
    contact_phone: i.contact_phone ?? '',
    website: i.website ?? '',
    last_contact_date: i.last_contact_date ?? '',
    discovery_note: i.discovery_note ?? '',
    note: i.note ?? '',
  };
}

// 협력/잠재 파트너 CRM 상세 + 편집 + 상태 변경(승격/강등).
export default function DirectoryDetail({ item }: { item: DirectoryListItem }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(toForm(item));
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const input =
    'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200';

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('파트너사명은 필수입니다.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/directory/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '저장에 실패했습니다.');
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status: DirectoryStatus) {
    if (status === item.status) return;
    const label =
      status === '사업'
        ? '사업 파트너로 승격하면 KPI 관리 화면이 생성됩니다. 진행할까요?'
        : `상태를 '${status}'(으)로 변경할까요?`;
    if (!confirm(label)) return;

    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/directory/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '상태 변경에 실패했습니다.');
      // 사업 승격 시 KPI 관리 화면으로 이동
      if (status === '사업' && data.businessPartnerId) {
        router.push(`/business-partners/${data.businessPartnerId}`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm('이 파트너사를 디렉토리에서 삭제할까요? 되돌릴 수 없습니다.')) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/directory/${item.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '삭제에 실패했습니다.');
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
      setBusy(false);
    }
  }

  const row = (label: string, value: string | null) => (
    <div className="flex gap-3 py-2 border-b border-gray-100">
      <span className="text-xs text-gray-400 w-24 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-800 whitespace-pre-wrap">{value || '-'}</span>
    </div>
  );

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <span className={`text-xs px-2 py-0.5 rounded-full border ${statusBadge[item.status]}`}>
            {item.status} 파트너
          </span>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">{item.name}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{item.country ?? '국가 미상'}</p>
        </div>
        {!editing && (
          <button
            onClick={() => { setForm(toForm(item)); setEditing(true); setError(''); }}
            className="text-sm border border-gray-300 hover:border-blue-400 hover:text-blue-600 px-4 py-2 rounded-lg"
          >
            편집
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {/* 상태 변경 */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <p className="text-sm font-semibold text-gray-800 mb-3">상태 변경 (잠재 → 협력 → 사업)</p>
        <div className="flex gap-2">
          {(['잠재', '협력', '사업'] as DirectoryStatus[]).map((s) => (
            <button
              key={s}
              disabled={busy || s === item.status}
              onClick={() => changeStatus(s)}
              className={`text-sm px-4 py-2 rounded-lg border transition-colors disabled:opacity-50 ${
                s === item.status
                  ? `${statusBadge[s]} cursor-default`
                  : 'border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          ‘사업’으로 승격하면 참여기업·KPI 관리 화면이 생성되고 사업파트너 목록에 나타납니다.
        </p>
      </div>

      {editing ? (
        <form onSubmit={save} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
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
            <textarea className={input} rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg">
              {saving ? '저장 중...' : '저장'}
            </button>
            <button type="button" onClick={() => { setEditing(false); setError(''); }} className="text-sm text-gray-500 px-4 py-2">
              취소
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          {row('분야', item.sector)}
          {row('담당자', item.contact_name)}
          {row('담당자 이메일', item.contact_email)}
          {row('담당자 연락처', item.contact_phone)}
          {row('웹사이트', item.website)}
          {row('최근 접촉일', item.last_contact_date)}
          {row('발굴 경위', item.discovery_note)}
          {row('메모', item.note)}
        </div>
      )}

      {!editing && (
        <div className="mt-6">
          <button onClick={remove} disabled={busy} className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50">
            이 파트너사 삭제
          </button>
        </div>
      )}
    </div>
  );
}
