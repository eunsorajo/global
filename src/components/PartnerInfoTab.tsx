'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DirectoryListItem } from '@/types/accelerating';
import type { MeetingWithFollowups, FollowupStatus, FollowupRow } from '@/types/meeting';

// 팔로업 상태 메타
const STATUS_META: Record<FollowupStatus, { label: string; className: string }> = {
  pending: { label: '대기', className: 'bg-gray-100 text-gray-600' },
  in_progress: { label: '진행 중', className: 'bg-blue-100 text-blue-600' },
  completed: { label: '완료', className: 'bg-green-100 text-green-600' },
};

// 다음 상태 순환: 대기 → 진행 중 → 완료 → 대기
const NEXT_STATUS: Record<FollowupStatus, FollowupStatus> = {
  pending: 'in_progress',
  in_progress: 'completed',
  completed: 'pending',
};

const STATUS_RANK: Record<FollowupStatus, number> = {
  pending: 0,
  in_progress: 1,
  completed: 2,
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

function toForm(d: DirectoryListItem): EditForm {
  return {
    name: d.name ?? '',
    country: d.country ?? '',
    sector: d.sector ?? '',
    contact_name: d.contact_name ?? '',
    contact_email: d.contact_email ?? '',
    contact_phone: d.contact_phone ?? '',
    website: d.website ?? '',
    last_contact_date: d.last_contact_date ?? '',
    discovery_note: d.discovery_note ?? '',
    note: d.note ?? '',
  };
}

// 미팅 정보가 붙은 팔로업 (어느 회의에서 나왔는지 표시용)
interface FollowupWithMeeting extends FollowupRow {
  meetingTitle: string;
  meetingDate: string | null;
}

function flattenFollowups(meetings: MeetingWithFollowups[]): FollowupWithMeeting[] {
  const out: FollowupWithMeeting[] = [];
  for (const m of meetings) {
    for (const f of m.followups) {
      out.push({ ...f, meetingTitle: m.title, meetingDate: m.meeting_date });
    }
  }
  return out;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

// 정렬: 미완료 우선 → 기한 지난 것 우선 → 기한 빠른 순. 완료는 맨 뒤.
function sortFollowups(items: FollowupWithMeeting[]): FollowupWithMeeting[] {
  const today = todayStr();
  return [...items].sort((a, b) => {
    const sr = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (sr !== 0) return sr;
    // 동일 상태 내: 기한 지난 것/빠른 것 우선, 기한 없는 것은 뒤로
    const aOver = a.due_date && a.due_date < today ? 0 : 1;
    const bOver = b.due_date && b.due_date < today ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return 0;
  });
}

export default function PartnerInfoTab({
  directory,
  meetings,
  isAdmin,
}: {
  // partners.directory_id 로 연결된 디렉토리 프로필. 미연결(이론상)이면 null.
  directory: DirectoryListItem | null;
  meetings: MeetingWithFollowups[];
  isAdmin: boolean;
}) {
  const followups = useMemo(() => sortFollowups(flattenFollowups(meetings)), [meetings]);

  return (
    <div className="space-y-8">
      <ProfileSection directory={directory} isAdmin={isAdmin} />
      <FollowupSection followups={followups} isAdmin={isAdmin} />
    </div>
  );
}

// ---------- 프로필 ----------

function ProfileSection({
  directory,
  isAdmin,
}: {
  directory: DirectoryListItem | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(() => (directory ? toForm(directory) : ({} as EditForm)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const input =
    'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200';

  const row = (label: string, value: string | null) => (
    <div className="flex gap-3 py-2 border-b border-gray-100">
      <span className="text-xs text-gray-400 w-24 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-800 whitespace-pre-wrap break-words">{value || '-'}</span>
    </div>
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!directory) return;
    if (!form.name.trim()) {
      setError('파트너사명은 필수입니다.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/directory/${directory.id}`, {
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

  // 디렉토리 프로필이 연결되지 않은 경우 (이론상) — 안내만.
  if (!directory) {
    return (
      <section>
        <h2 className="text-sm font-semibold text-gray-800 mb-3">파트너사 정보</h2>
        <div className="bg-white border border-gray-200 rounded-xl p-5 text-sm text-gray-500">
          이 사업 파트너에 연결된 디렉토리 프로필이 없습니다.
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-800 min-w-0">파트너사 정보</h2>
        {isAdmin && !editing && (
          <button
            onClick={() => {
              setForm(toForm(directory));
              setEditing(true);
              setError('');
            }}
            className="text-sm border border-gray-300 hover:border-blue-400 hover:text-blue-600 px-3 py-1.5 rounded-lg shrink-0 whitespace-nowrap"
          >
            편집
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

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
          {row('국가', directory.country)}
          {row('상태', `${directory.status} 파트너`)}
          {row('분야', directory.sector)}
          {row('담당자', directory.contact_name)}
          {row('담당자 이메일', directory.contact_email)}
          {row('담당자 연락처', directory.contact_phone)}
          {row('웹사이트', directory.website)}
          {row('최근 접촉일', directory.last_contact_date)}
          {row('발굴 경위', directory.discovery_note)}
          {row('메모', directory.note)}
        </div>
      )}
    </section>
  );
}

// ---------- 팔로업(해야 할 일) ----------

function FollowupSection({
  followups,
  isAdmin,
}: {
  followups: FollowupWithMeeting[];
  isAdmin: boolean;
}) {
  const openCount = followups.filter((f) => f.status !== 'completed').length;

  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-800 mb-3">
        해야 할 일 (팔로업)
        {followups.length > 0 && (
          <span className="text-gray-400 font-normal"> · 미완료 {openCount}건 / 전체 {followups.length}건</span>
        )}
      </h2>

      {followups.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-500">
          등록된 팔로업이 없습니다 (회의록 가져오기에서 생성됩니다).
        </div>
      ) : (
        <div className="space-y-2">
          {followups.map((f) => (
            <FollowupItem key={f.id} initial={f} isAdmin={isAdmin} />
          ))}
        </div>
      )}
    </section>
  );
}

function FollowupItem({ initial, isAdmin }: { initial: FollowupWithMeeting; isAdmin: boolean }) {
  const [status, setStatus] = useState<FollowupStatus>(initial.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const isCompleted = status === 'completed';
  const isOverdue = !isCompleted && !!initial.due_date && initial.due_date < todayStr();

  async function cycle() {
    if (!isAdmin) return;
    const next = NEXT_STATUS[status];
    const prev = status;
    setStatus(next); // 낙관적 업데이트
    setSaving(true);
    setError(false);
    try {
      const res = await fetch(`/api/followups/${initial.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setStatus(prev); // 실패 롤백
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  const meta = STATUS_META[status];
  const meetingLabel = `${initial.meetingTitle}${initial.meetingDate ? ` · ${initial.meetingDate}` : ''}`;

  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-lg px-4 py-3 border ${
        isCompleted ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-white border-gray-200'
      }`}
    >
      <div className="min-w-0">
        <p className={`text-sm ${isCompleted ? 'text-gray-500 line-through' : 'text-gray-800'} break-words`}>
          {initial.content}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          {initial.assignee ?? '담당자 미정'}
          {initial.due_date ? ` · 기한 ${initial.due_date}` : ''}
          {isOverdue && <span className="text-red-500 font-medium"> · 기한 초과</span>}
          {error && <span className="text-red-500"> · 저장 실패</span>}
        </p>
        <p className="text-xs text-gray-300 mt-0.5 truncate">회의: {meetingLabel}</p>
      </div>
      <button
        onClick={cycle}
        disabled={saving || !isAdmin}
        className={`text-xs px-2.5 py-1 rounded-full shrink-0 whitespace-nowrap transition-opacity ${meta.className} ${
          saving ? 'opacity-50' : isAdmin ? 'hover:opacity-80' : 'cursor-default'
        }`}
        title={isAdmin ? '클릭하여 상태 변경 (대기 → 진행 중 → 완료)' : undefined}
      >
        {meta.label}
      </button>
    </div>
  );
}
