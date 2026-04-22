'use client';

import { useState } from 'react';
import { FollowUpItem, FollowUpStatus } from '@/types/partner';

const statusLabel: Record<FollowUpStatus, { label: string; className: string }> = {
  pending: { label: '대기', className: 'bg-gray-100 text-gray-600' },
  in_progress: { label: '진행 중', className: 'bg-blue-100 text-blue-600' },
  completed: { label: '완료', className: 'bg-green-100 text-green-600' },
  overdue: { label: '기한 초과', className: 'bg-red-100 text-red-600' },
};

interface FollowUpListProps {
  followUps: FollowUpItem[];
}

export default function FollowUpList({ followUps }: FollowUpListProps) {
  const [items, setItems] = useState(followUps);

  function toggle(id: string) {
    setItems((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const next: FollowUpStatus = f.status === 'completed' ? 'pending' : 'completed';
        return { ...f, status: next };
      })
    );
    // TODO: Sheets API 연동 후 서버에 상태 저장
  }

  return (
    <div className="space-y-2">
      {items.map((f) => {
        const s = statusLabel[f.status];
        const done = f.status === 'completed';
        return (
          <div
            key={f.id}
            className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={done}
                onChange={() => toggle(f.id)}
                className="rounded cursor-pointer"
              />
              <span className={`text-sm ${done ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                {f.content}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-gray-400">{f.assignee}</span>
              <span className="text-xs text-gray-400">· {f.dueDate}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${s.className}`}>
                {s.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
