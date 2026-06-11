'use client';

import { useState, useCallback } from 'react';
import type { PartnerMatrix, MatrixCell } from '@/types/accelerating';

type AchievedState = boolean | null;

function cellKey(companyId: string, kpiId: string) {
  return `${companyId}:${kpiId}`;
}

// 달성여부 토글 버튼: 미정(null) → 달성(true) → 미달성(false) → 미정
function nextAchieved(cur: AchievedState): AchievedState {
  if (cur === null) return true;
  if (cur === true) return false;
  return null;
}

function AchievedToggle({
  value,
  onClick,
  saving,
  disabled,
}: {
  value: AchievedState;
  onClick: () => void;
  saving?: boolean;
  // 권한 없음(예: partner 의 파트너 레벨 판정) → 읽기 전용
  disabled?: boolean;
}) {
  const label = value === true ? '✓ 달성' : value === false ? '✗ 미달성' : '— 미정';
  const cls =
    value === true
      ? 'bg-green-100 text-green-700 border-green-300'
      : value === false
        ? 'bg-red-100 text-red-700 border-red-300'
        : 'bg-gray-50 text-gray-400 border-gray-200';
  const inert = saving || disabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={inert}
      title={disabled ? '달성여부 판정은 관리자만 변경할 수 있습니다.' : undefined}
      className={`text-xs px-2 py-0.5 rounded border ${cls} ${inert ? 'opacity-50' : 'hover:brightness-95'} ${disabled ? 'cursor-not-allowed' : ''}`}
    >
      {label}
    </button>
  );
}

export default function KpiMatrix({ matrix, isAdmin = true }: { matrix: PartnerMatrix; isAdmin?: boolean }) {
  const { partner, companies, kpiDefinitions } = matrix;

  // 셀 상태 (낙관적 업데이트)
  const [cells, setCells] = useState<Record<string, MatrixCell>>(() => {
    const init: Record<string, MatrixCell> = { ...matrix.progress };
    for (const c of companies) {
      for (const k of kpiDefinitions) {
        const key = cellKey(c.id, k.id);
        if (!init[key]) {
          init[key] = { progressId: null, companyId: c.id, kpiDefinitionId: k.id, value: null, achieved: null, note: null };
        }
      }
    }
    return init;
  });

  // 파트너 레벨 KPI 달성여부
  const [defAchieved, setDefAchieved] = useState<Record<string, AchievedState>>(() =>
    Object.fromEntries(kpiDefinitions.map((k) => [k.id, k.achieved ?? null]))
  );

  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const markSaving = (key: string, on: boolean) =>
    setSavingKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  // 셀 저장 (낙관적 → 실패 시 롤백)
  const saveCell = useCallback(
    async (companyId: string, kpiId: string, patch: Partial<MatrixCell>) => {
      const key = cellKey(companyId, kpiId);
      const prev = cells[key];
      const optimistic = { ...prev, ...patch };
      setCells((c) => ({ ...c, [key]: optimistic }));
      markSaving(key, true);
      try {
        const res = await fetch('/api/kpi/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId,
            kpiDefinitionId: kpiId,
            value: optimistic.value,
            achieved: optimistic.achieved,
            note: optimistic.note,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? '저장 실패');
        }
        const data = await res.json();
        setCells((c) => ({
          ...c,
          [key]: {
            progressId: data.progress.id,
            companyId,
            kpiDefinitionId: kpiId,
            value: data.progress.value,
            achieved: data.progress.achieved,
            note: data.progress.note,
          },
        }));
      } catch (e) {
        setCells((c) => ({ ...c, [key]: prev })); // 롤백
        showToast(`저장 실패: ${(e as Error).message}`);
      } finally {
        markSaving(key, false);
      }
    },
    [cells, showToast]
  );

  // 파트너 레벨 KPI achieved 저장
  const saveDefAchieved = useCallback(
    async (kpiId: string) => {
      const prev = defAchieved[kpiId] ?? null;
      const next = nextAchieved(prev);
      const key = `def:${kpiId}`;
      setDefAchieved((d) => ({ ...d, [kpiId]: next }));
      markSaving(key, true);
      try {
        const res = await fetch(`/api/kpi/definitions/${kpiId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ achieved: next }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? '저장 실패');
        }
      } catch (e) {
        setDefAchieved((d) => ({ ...d, [kpiId]: prev }));
        showToast(`저장 실패: ${(e as Error).message}`);
      } finally {
        markSaving(key, false);
      }
    },
    [defAchieved, showToast]
  );

  // KPI 열별 집계: 달성 기업 수 / 진척도 입력된 기업 수
  const columnStats = (kpiId: string) => {
    let achieved = 0;
    let total = 0;
    for (const c of companies) {
      const cell = cells[cellKey(c.id, kpiId)];
      if (cell && (cell.value || cell.achieved !== null)) total += 1;
      if (cell && cell.achieved === true) achieved += 1;
    }
    return { achieved, total };
  };

  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div>
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-red-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
        <table className="text-sm border-collapse min-w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="sticky left-0 z-10 bg-gray-50 text-left px-4 py-3 font-medium text-gray-500 text-xs border-b border-gray-200 min-w-[180px]">
                참여기업 \ KPI
              </th>
              {kpiDefinitions.map((k) => {
                const stats = columnStats(k.id);
                return (
                  <th
                    key={k.id}
                    className="text-left px-3 py-2 font-medium text-gray-700 text-xs border-b border-l border-gray-200 align-top min-w-[160px]"
                  >
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="text-gray-400">KPI {k.kpi_order}</span>
                      {k.category && (
                        <span
                          className={`text-[10px] px-1 rounded ${
                            k.category === '공통' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                          }`}
                        >
                          {k.category}
                        </span>
                      )}
                    </div>
                    <div className="text-gray-900 font-semibold leading-tight">{k.name}</div>
                    {k.target && <div className="text-[11px] text-gray-400 font-normal mt-0.5">{k.target}</div>}
                    <div className="mt-1 text-[11px] text-gray-500 font-normal">
                      집계 {stats.achieved}/{stats.total} 달성
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      <span className="text-[10px] text-gray-400">파트너 레벨</span>
                      <AchievedToggle
                        value={defAchieved[k.id] ?? null}
                        onClick={() => saveDefAchieved(k.id)}
                        saving={savingKeys.has(`def:${k.id}`)}
                        disabled={!isAdmin}
                      />
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {companies.map((company) => (
              <tr key={company.id} className="hover:bg-gray-50/50">
                <td className="sticky left-0 z-10 bg-white px-4 py-2 border-r border-gray-100 align-top min-w-[180px]">
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === company.id ? null : company.id)}
                    className="text-left"
                  >
                    <span className="text-xs text-gray-400">{company.no}</span>{' '}
                    <span className="font-medium text-gray-900">{company.name}</span>
                    {company.sector && <span className="block text-[11px] text-gray-400">{company.sector}</span>}
                  </button>
                  {expanded === company.id && company.description && (
                    <p className="mt-1 text-[11px] text-gray-500 max-w-[200px]">{company.description}</p>
                  )}
                </td>
                {kpiDefinitions.map((k) => {
                  const key = cellKey(company.id, k.id);
                  const cell = cells[key];
                  const saving = savingKeys.has(key);
                  return (
                    <td key={k.id} className="px-2 py-2 border-l border-gray-100 align-top min-w-[160px]">
                      <input
                        type="text"
                        defaultValue={cell.value ?? ''}
                        placeholder="진척도 입력"
                        onBlur={(e) => {
                          const v = e.target.value.trim() === '' ? null : e.target.value;
                          if (v !== (cell.value ?? null)) saveCell(company.id, k.id, { value: v });
                        }}
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1 mb-1 focus:outline-none focus:border-blue-400"
                      />
                      <AchievedToggle
                        value={cell.achieved}
                        onClick={() => saveCell(company.id, k.id, { achieved: nextAchieved(cell.achieved) })}
                        saving={saving}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        진척도는 입력 후 포커스를 벗어나면 자동 저장됩니다. 달성여부 버튼은 미정 → 달성 → 미달성 순으로 전환됩니다.
      </p>
    </div>
  );
}
