'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { MeetingWithFollowups, FollowupStatus, FollowupRow } from '@/types/meeting';

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

export default function MeetingsTab({ meetings }: { meetings: MeetingWithFollowups[] }) {
  if (meetings.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <p className="text-gray-500 text-sm mb-4">아직 등록된 회의록이 없습니다.</p>
        <Link
          href="/meetings/new"
          className="inline-block text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          회의록 가져오기
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link
          href="/meetings/new"
          className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          회의록 가져오기
        </Link>
      </div>
      {meetings.map((m) => (
        <MeetingCard key={m.id} meeting={m} />
      ))}
    </div>
  );
}

function MeetingCard({ meeting }: { meeting: MeetingWithFollowups }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div>
          <p className="font-semibold text-gray-900">{meeting.title}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {meeting.meeting_date ?? '날짜 미정'}
            {meeting.attendees ? ` · ${meeting.attendees}` : ''}
          </p>
        </div>
        <span className="text-gray-400 text-sm shrink-0 ml-3">{open ? '접기 ▲' : '펼치기 ▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
          {meeting.summary && (
            <Section title="요약">
              <p className="text-sm text-gray-700 whitespace-pre-line">{meeting.summary}</p>
            </Section>
          )}
          {meeting.key_points && (
            <Section title="핵심사항">
              <TextList text={meeting.key_points} dot="text-blue-500" />
            </Section>
          )}
          {meeting.decisions && (
            <Section title="결정사항">
              <TextList text={meeting.decisions} dot="text-green-600" />
            </Section>
          )}
          <Section title={`팔로업 (${meeting.followups.length})`}>
            {meeting.followups.length === 0 ? (
              <p className="text-sm text-gray-400">없음</p>
            ) : (
              <div className="space-y-2">
                {meeting.followups.map((f) => (
                  <FollowupRowItem key={f.id} initial={f} />
                ))}
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-400 mb-1.5">{title}</p>
      {children}
    </div>
  );
}

function TextList({ text, dot }: { text: string; dot: string }) {
  const items = text.split('\n').map((s) => s.trim()).filter(Boolean);
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="text-sm text-gray-700 flex gap-2">
          <span className={`${dot} shrink-0`}>•</span>
          {it}
        </li>
      ))}
    </ul>
  );
}

function FollowupRowItem({ initial }: { initial: FollowupRow }) {
  const [status, setStatus] = useState<FollowupStatus>(initial.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function cycle() {
    const next = NEXT_STATUS[status];
    const prev = status;
    setStatus(next);
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
      setStatus(prev); // 롤백
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  const meta = STATUS_META[status];

  return (
    <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm text-gray-700 truncate">{initial.content}</p>
        <p className="text-xs text-gray-400">
          {initial.assignee ?? '담당자 미정'}
          {initial.due_date ? ` · 기한 ${initial.due_date}` : ''}
          {error && <span className="text-red-500"> · 저장 실패</span>}
        </p>
      </div>
      <button
        onClick={cycle}
        disabled={saving}
        className={`text-xs px-2.5 py-1 rounded-full shrink-0 ml-3 transition-opacity ${meta.className} ${
          saving ? 'opacity-50' : 'hover:opacity-80'
        }`}
        title="클릭하여 상태 변경"
      >
        {meta.label}
      </button>
    </div>
  );
}
