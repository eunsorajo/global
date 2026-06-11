'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// /api/sync 응답 타입 (sheet-sync.ts 와 구조 일치, 클라이언트 표시용 최소 정의)
type DirectoryField = string;
interface FieldDiff {
  field: DirectoryField;
  dbValue: string | null;
  sheetValue: string | null;
}
interface PullPlanRow {
  rowNumber: number;
  id: string | null;
  name: string;
  action: 'create' | 'update' | 'conflict' | 'noop';
  updates: FieldDiff[];
  conflicts: FieldDiff[];
  matchedBy: 'id' | 'name+country' | 'new' | null;
}
interface PushPlanRow {
  id: string;
  rowNumber: number | null;
  name: string;
  action: string;
  updates: FieldDiff[];
}
interface SyncPlan {
  pull: {
    rows: PullPlanRow[];
    createdCount: number;
    updatedCount: number;
    conflictCount: number;
    needsIdColumn: boolean;
  };
  push: { rows: PushPlanRow[]; updatedCount: number };
}
interface ConflictDetail {
  name: string;
  field: string;
  dbValue: string | null;
  sheetValue: string | null;
}
interface ApplyResult {
  created: number;
  updated: number;
  conflicts: ConflictDetail[];
}

const FIELD_LABEL: Record<string, string> = {
  name: '기관명',
  country: '국가',
  city: '도시',
  category: '구분',
  biz_summary: '주요 사업',
  discovery_note: '발굴 소스',
  sba_owner: '담당자(SBA)',
  contact_name: '담당자(파트너)',
  contact_title: '직급',
  contact_email: '이메일',
  website: '홈페이지',
  future_plan: '향후 협업계획',
  note: '비고',
};
const label = (f: string) => FIELD_LABEL[f] ?? f;

export default function SheetSyncManager() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<SyncPlan | null>(null);
  const [applied, setApplied] = useState<{ mode: string; result: unknown } | null>(null);

  async function call(mode: 'dryrun' | 'pull' | 'push' | 'both') {
    setBusy(mode);
    setError(null);
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? '동기화 요청 실패');
      if (mode === 'dryrun') {
        setPlan(data.plan as SyncPlan);
        setApplied(null);
      } else {
        setApplied({ mode, result: data.result });
        setPlan(null);
        router.refresh(); // 목록(/) 갱신
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setBusy(null);
    }
  }

  const pullChanged = plan?.pull.rows.filter((r) => r.action !== 'noop') ?? [];

  return (
    <div className="space-y-6">
      {/* 동작 버튼 */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => call('dryrun')}
          disabled={busy !== null}
          className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-800 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          {busy === 'dryrun' ? '미리보기 계산 중…' : '변경 미리보기 (dry-run)'}
        </button>
        <button
          onClick={() => call('pull')}
          disabled={busy !== null}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {busy === 'pull' ? '적용 중…' : '시트 → DB 적용 (pull)'}
        </button>
        <button
          onClick={() => call('push')}
          disabled={busy !== null}
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy === 'push' ? '적용 중…' : 'DB → 시트 적용 (push)'}
        </button>
        <button
          onClick={() => call('both')}
          disabled={busy !== null}
          className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-medium hover:bg-gray-900 disabled:opacity-50"
        >
          {busy === 'both' ? '적용 중…' : '양방향 (pull → push)'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 적용 결과 */}
      {applied && <AppliedResult mode={applied.mode} result={applied.result} />}

      {/* dry-run 미리보기 */}
      {plan && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-3 text-sm">
            <Stat label="신규 생성" value={plan.pull.createdCount} tone="blue" />
            <Stat label="수정(pull)" value={plan.pull.updatedCount} tone="amber" />
            <Stat label="충돌" value={plan.pull.conflictCount} tone="red" />
            <Stat label="수정(push)" value={plan.push.updatedCount} tone="emerald" />
          </div>

          {plan.pull.needsIdColumn && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              시트에 ID 열이 없습니다. pull 적용 시 헤더(2행) 오른쪽 끝에 ID 열이 추가되고 각 행에
              매핑 키가 기록됩니다.
            </div>
          )}

          {/* PULL 변경 목록 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              시트 → DB 변경 예정 ({pullChanged.length}건)
            </h3>
            {pullChanged.length === 0 ? (
              <p className="text-sm text-gray-400">변경 없음</p>
            ) : (
              <div className="space-y-2">
                {pullChanged.map((r) => (
                  <div
                    key={`${r.rowNumber}-${r.id ?? 'new'}`}
                    className="rounded-lg border border-gray-200 bg-white p-3 text-sm"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <ActionBadge action={r.action} />
                      <span className="font-medium text-gray-900">{r.name || '(이름 없음)'}</span>
                      <span className="text-xs text-gray-400">시트 {r.rowNumber}행</span>
                      {r.matchedBy && (
                        <span className="text-xs text-gray-400">· 매칭 {r.matchedBy}</span>
                      )}
                    </div>
                    {r.updates.length > 0 && (
                      <ul className="ml-1 space-y-0.5 text-gray-600">
                        {r.updates.map((u) => (
                          <li key={u.field}>
                            <span className="text-gray-500">{label(u.field)}:</span>{' '}
                            <span className="line-through text-gray-400">{u.dbValue ?? '∅'}</span>{' '}
                            → <span className="text-gray-900">{u.sheetValue ?? '∅'}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {r.conflicts.length > 0 && (
                      <ul className="ml-1 mt-1 space-y-0.5 text-red-600">
                        {r.conflicts.map((c) => (
                          <li key={c.field}>
                            ⚠ {label(c.field)} 충돌 — DB:{' '}
                            <span className="font-medium">{c.dbValue ?? '∅'}</span> / 시트:{' '}
                            <span className="font-medium">{c.sheetValue ?? '∅'}</span> (건너뜀)
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* PUSH 변경 목록 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              DB → 시트 변경 예정 ({plan.push.rows.length}건)
            </h3>
            {plan.push.rows.length === 0 ? (
              <p className="text-sm text-gray-400">변경 없음</p>
            ) : (
              <div className="space-y-2">
                {plan.push.rows.map((r) => (
                  <div key={r.id} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="rounded bg-emerald-100 text-emerald-700 px-1.5 py-0.5 text-xs font-medium">
                        push
                      </span>
                      <span className="font-medium text-gray-900">{r.name}</span>
                      <span className="text-xs text-gray-400">시트 {r.rowNumber}행</span>
                    </div>
                    <ul className="ml-1 space-y-0.5 text-gray-600">
                      {r.updates.map((u) => (
                        <li key={u.field}>
                          <span className="text-gray-500">{label(u.field)}:</span>{' '}
                          <span className="line-through text-gray-400">{u.sheetValue ?? '∅'}</span>{' '}
                          → <span className="text-gray-900">{u.dbValue ?? '∅'}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function AppliedResult({ mode, result }: { mode: string; result: unknown }) {
  // 결과 형태가 mode 마다 달라 안전하게 추출
  const r = result as
    | ApplyResult
    | { pull: ApplyResult; push: ApplyResult }
    | undefined;
  let created = 0;
  let updated = 0;
  let conflicts: ConflictDetail[] = [];
  if (r && 'pull' in r) {
    created = r.pull.created + r.push.created;
    updated = r.pull.updated + r.push.updated;
    conflicts = [...r.pull.conflicts, ...r.push.conflicts];
  } else if (r) {
    created = r.created;
    updated = r.updated;
    conflicts = r.conflicts;
  }
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 space-y-2">
      <p className="font-medium">
        {mode} 적용 완료 — 생성 {created}건, 수정 {updated}건, 충돌 {conflicts.length}건
      </p>
      {conflicts.length > 0 && (
        <div className="text-red-700">
          <p className="font-medium">충돌(건너뜀) — sync_log 기록됨:</p>
          <ul className="ml-3 list-disc">
            {conflicts.map((c, i) => (
              <li key={i}>
                {c.name} · {label(c.field)} — DB: {c.dbValue ?? '∅'} / 시트: {c.sheetValue ?? '∅'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  const tones: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
  return (
    <div className={`rounded-lg border px-3 py-2 ${tones[tone] ?? ''}`}>
      <span className="text-xs">{label}</span>{' '}
      <span className="font-bold">{value}</span>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const map: Record<string, string> = {
    create: 'bg-blue-100 text-blue-700',
    update: 'bg-amber-100 text-amber-700',
    conflict: 'bg-red-100 text-red-700',
    noop: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${map[action] ?? ''}`}>
      {action}
    </span>
  );
}
