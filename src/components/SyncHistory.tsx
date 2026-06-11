'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SyncLogRow, SyncBackupRow } from '@/lib/sync-log-data';

const FIELD_LABEL: Record<string, string> = {
  name: '기관명', country: '국가', city: '도시', category: '구분',
  biz_summary: '주요 사업', discovery_note: '발굴 소스', sba_owner: '담당자(SBA)',
  contact_name: '담당자', contact_title: '직급', contact_email: '이메일',
  website: '홈페이지', future_plan: '향후 협업계획', note: '비고',
};
const DIRECTION_LABEL: Record<string, string> = {
  pull: '시트→DB', push: 'DB→시트', both: '양방향', dryrun: '미리보기',
};
const REASON_LABEL: Record<string, string> = {
  'conflict-latest-wins': '충돌(최신 우선)', overwrite: '덮어쓰기',
};

function fmt(ts: string): string {
  // 서버에서 온 ISO 문자열을 그대로 잘라 표기(로케일 차이 회피)
  return ts.replace('T', ' ').slice(0, 16);
}

export default function SyncHistory({
  logs,
  backups,
}: {
  logs: SyncLogRow[];
  backups: SyncBackupRow[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(backups);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function rollback(id: string) {
    if (!confirm('이 변경을 이전 값으로 되돌릴까요? (DB + 시트 모두 반영)')) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch('/api/sync/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupId: id }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? '되돌리기 실패');
      }
      setItems((prev) => prev.map((b) => (b.id === id ? { ...b, restored: true } : b)));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '되돌리기 실패');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-10 space-y-8">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>
      )}

      {/* 백업 · 되돌리기 */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">덮어쓰기 백업 · 되돌리기</h3>
          <p className="text-xs text-gray-400 mt-0.5">자동 동기화가 값을 덮어쓰기 전 보관한 이전 값입니다. 잘못됐으면 되돌리세요.</p>
        </div>
        {items.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-400">백업된 변경이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">시각</th>
                  <th className="text-left px-4 py-2 font-medium">파트너</th>
                  <th className="text-left px-4 py-2 font-medium">필드</th>
                  <th className="text-left px-4 py-2 font-medium">이전 → 적용</th>
                  <th className="text-left px-4 py-2 font-medium">사유</th>
                  <th className="px-4 py-2 w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{fmt(b.created_at)}</td>
                    <td className="px-4 py-2 text-gray-900">{b.partner_name ?? '-'}</td>
                    <td className="px-4 py-2 text-gray-700">{FIELD_LABEL[b.field] ?? b.field}</td>
                    <td className="px-4 py-2 text-gray-600 max-w-xs truncate">
                      <span className="text-gray-400 line-through">{b.old_value ?? '(빈값)'}</span>
                      {' → '}
                      <span>{b.new_value ?? '(빈값)'}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {REASON_LABEL[b.reason ?? ''] ?? b.reason ?? '-'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {b.restored ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-600">복원됨</span>
                      ) : (
                        <button
                          onClick={() => rollback(b.id)}
                          disabled={busyId === b.id}
                          className="text-xs border border-gray-300 rounded px-2 py-1 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                        >
                          {busyId === b.id ? '...' : '되돌리기'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 동기화 이력 */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">최근 동기화 이력</h3>
        </div>
        {logs.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-400">동기화 이력이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">시각</th>
                  <th className="text-left px-4 py-2 font-medium">실행자</th>
                  <th className="text-left px-4 py-2 font-medium">방향</th>
                  <th className="text-right px-4 py-2 font-medium">생성</th>
                  <th className="text-right px-4 py-2 font-medium">수정</th>
                  <th className="text-right px-4 py-2 font-medium">충돌</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{fmt(l.run_at)}</td>
                    <td className="px-4 py-2 text-gray-700">{l.run_by ?? '-'}</td>
                    <td className="px-4 py-2 text-gray-700">{DIRECTION_LABEL[l.direction] ?? l.direction}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{l.created_count}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{l.updated_count}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{l.conflict_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
