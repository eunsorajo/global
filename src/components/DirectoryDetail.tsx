'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DirectoryListItem, DirectoryStatus } from '@/types/accelerating';
import type { DirectoryFollowupRow, FollowupStatus } from '@/types/meeting';

const statusBadge: Record<DirectoryStatus, string> = {
  사업: 'bg-blue-50 text-blue-700 border-blue-200',
  협력: 'bg-green-50 text-green-700 border-green-200',
  잠재: 'bg-amber-50 text-amber-700 border-amber-200',
};

const todayStr = () => new Date().toISOString().slice(0, 10);

const FOLLOWUP_STATUS_META: Record<FollowupStatus, { label: string; className: string }> = {
  pending: { label: '대기', className: 'bg-gray-100 text-gray-600' },
  in_progress: { label: '진행 중', className: 'bg-blue-100 text-blue-600' },
  completed: { label: '완료', className: 'bg-green-100 text-green-600' },
};

const NEXT_FOLLOWUP_STATUS: Record<FollowupStatus, FollowupStatus> = {
  pending: 'in_progress',
  in_progress: 'completed',
  completed: 'pending',
};

const FOLLOWUP_STATUS_RANK: Record<FollowupStatus, number> = {
  pending: 0,
  in_progress: 1,
  completed: 2,
};

// 미완료 우선 → 기한 빠른 순(없으면 뒤) → 생성순
function sortFollowups(items: DirectoryFollowupRow[]): DirectoryFollowupRow[] {
  return [...items].sort((a, b) => {
    const s = FOLLOWUP_STATUS_RANK[a.status] - FOLLOWUP_STATUS_RANK[b.status];
    if (s !== 0) return s;
    const ad = a.due_date ?? '9999-12-31';
    const bd = b.due_date ?? '9999-12-31';
    if (ad !== bd) return ad < bd ? -1 : 1;
    return a.created_at.localeCompare(b.created_at);
  });
}

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

// 협력/잠재 파트너 CRM 상세 + 편집 + 상태 변경(승격/강등) + 팔로업.
export default function DirectoryDetail({
  item,
  initialFollowups = [],
}: {
  item: DirectoryListItem;
  initialFollowups?: DirectoryFollowupRow[];
}) {
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
      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <span className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${statusBadge[item.status]}`}>
            {item.status} 파트너
          </span>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">{item.name}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{item.country ?? '국가 미상'}</p>
        </div>
        {!editing && (
          <button
            onClick={() => { setForm(toForm(item)); setEditing(true); setError(''); }}
            className="text-sm border border-gray-300 hover:border-blue-400 hover:text-blue-600 px-4 py-2 rounded-lg shrink-0 whitespace-nowrap"
          >
            편집
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {/* 상태 변경 */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <p className="text-sm font-semibold text-gray-800 mb-3">상태 변경 (잠재 → 협력 → 사업)</p>
        <div className="flex flex-wrap gap-2">
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
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg whitespace-nowrap">
              {saving ? '저장 중...' : '저장'}
            </button>
            <button type="button" onClick={() => { setEditing(false); setError(''); }} className="text-sm text-gray-500 px-4 py-2 whitespace-nowrap">
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

      {/* 팔로업(해야 할 일) — 내용이 없어도 섹션·추가 폼 상시 표시 */}
      <FollowupSection directoryId={item.id} initial={initialFollowups} />

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

// ---------- 팔로업 섹션 (디렉토리 파트너 전용, 관리자) ----------

function FollowupSection({
  directoryId,
  initial,
}: {
  directoryId: string;
  initial: DirectoryFollowupRow[];
}) {
  const [items, setItems] = useState<DirectoryFollowupRow[]>(() => sortFollowups(initial));
  const [content, setContent] = useState('');
  const [assignee, setAssignee] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const openCount = items.filter((f) => f.status !== 'completed').length;

  const fieldInput =
    'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200';

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) {
      setError('내용을 입력하세요.');
      return;
    }
    setAdding(true);
    setError('');
    try {
      const res = await fetch(`/api/directory/${directoryId}/followups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content.trim(),
          assignee: assignee.trim() || null,
          due_date: dueDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '추가에 실패했습니다.');
      setItems((prev) => sortFollowups([...prev, data.followup as DirectoryFollowupRow]));
      setContent('');
      setAssignee('');
      setDueDate('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setAdding(false);
    }
  }

  async function cycle(f: DirectoryFollowupRow) {
    const next = NEXT_FOLLOWUP_STATUS[f.status];
    // 낙관적 업데이트
    setItems((prev) => sortFollowups(prev.map((x) => (x.id === f.id ? { ...x, status: next } : x))));
    try {
      const res = await fetch(`/api/followups/${f.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // 롤백
      setItems((prev) => sortFollowups(prev.map((x) => (x.id === f.id ? { ...x, status: f.status } : x))));
      setError('상태 변경에 실패했습니다.');
    }
  }

  async function removeItem(f: DirectoryFollowupRow) {
    if (!confirm('이 팔로업을 삭제할까요?')) return;
    const prev = items;
    // 낙관적 제거
    setItems((cur) => cur.filter((x) => x.id !== f.id));
    try {
      const res = await fetch(`/api/followups/${f.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
    } catch {
      setItems(prev); // 롤백
      setError('삭제에 실패했습니다.');
    }
  }

  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold text-gray-800 mb-3">
        해야 할 일 (팔로업)
        {items.length > 0 && (
          <span className="text-gray-400 font-normal">
            {' '}· 미완료 {openCount}건 / 전체 {items.length}건
          </span>
        )}
      </h2>

      {/* 추가 폼 — 항상 노출 */}
      <form onSubmit={add} className="bg-white border border-gray-200 rounded-xl p-4 mb-3 space-y-2">
        <input
          className={fieldInput}
          placeholder="후속 액션 내용 (필수)"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            className={fieldInput}
            placeholder="담당자 (선택)"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          />
          <input
            type="date"
            className={fieldInput}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={adding}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg whitespace-nowrap"
        >
          {adding ? '추가 중...' : '팔로업 추가'}
        </button>
      </form>

      {items.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-500">
          등록된 팔로업이 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((f) => {
            const isCompleted = f.status === 'completed';
            const isOverdue = !isCompleted && !!f.due_date && f.due_date < todayStr();
            const meta = FOLLOWUP_STATUS_META[f.status];
            return (
              <div
                key={f.id}
                className={`flex items-start justify-between gap-3 rounded-lg px-4 py-3 border ${
                  isCompleted ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-white border-gray-200'
                }`}
              >
                <div className="min-w-0">
                  <p
                    className={`text-sm ${
                      isCompleted ? 'text-gray-500 line-through' : 'text-gray-800'
                    } break-words`}
                  >
                    {f.content}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {f.assignee ?? '담당자 미정'}
                    {f.due_date ? ` · 기한 ${f.due_date}` : ''}
                    {isOverdue && <span className="text-red-500 font-medium"> · 기한 초과</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => cycle(f)}
                    className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap transition-opacity hover:opacity-80 ${meta.className}`}
                    title="클릭하여 상태 변경 (대기 → 진행 중 → 완료)"
                  >
                    {meta.label}
                  </button>
                  <button
                    onClick={() => removeItem(f)}
                    className="text-xs text-gray-300 hover:text-red-500"
                    title="삭제"
                  >
                    삭제
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
