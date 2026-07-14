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
  progressPct,
}: {
  value: AchievedState;
  onClick: () => void;
  saving?: boolean;
  // 권한 없음(예: partner 의 파트너 레벨 판정) → 읽기 전용
  disabled?: boolean;
  // 정량 진행률(%) — 미정(null)이고 값이 있으면 "진행중 N%" 로 표시
  progressPct?: number | null;
}) {
  const inProgress = value === null && progressPct != null;
  const label =
    value === true
      ? '✓ 달성'
      : value === false
        ? '✗ 미달성'
        : inProgress
          ? `진행중 ${progressPct}%`
          : '— 미정';
  const cls =
    value === true
      ? 'bg-green-100 text-green-700 border-green-300'
      : value === false
        ? 'bg-red-100 text-red-700 border-red-300'
        : inProgress
          ? 'bg-blue-50 text-blue-700 border-blue-200'
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
          init[key] = { progressId: null, companyId: c.id, kpiDefinitionId: k.id, value: null, progressCurrent: null, progressTarget: null, achieved: null, note: null };
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
  // 기업별 비고(정성 메모) — 기업 행마다 1칸. KPI 칸별이 아니라 기업 단위.
  const [companyNotes, setCompanyNotes] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(companies.map((c) => [c.id, c.note]))
  );
  const [noteEditing, setNoteEditing] = useState<string | null>(null); // 편집 중인 기업 id
  const [cellNoteOpen, setCellNoteOpen] = useState<string | null>(null); // 편집 중인 셀 비고 키

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
            progressCurrent: optimistic.progressCurrent,
            progressTarget: optimistic.progressTarget,
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
            progressCurrent: data.progress.progress_current,
            progressTarget: data.progress.progress_target,
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

  // 기업 비고 저장 (낙관적 → 실패 시 롤백). PATCH /api/companies/[id]
  const saveCompanyNote = useCallback(
    async (companyId: string, note: string | null) => {
      const prev = companyNotes[companyId] ?? null;
      if (note === prev) return;
      const savingKey = `note:${companyId}`;
      setCompanyNotes((m) => ({ ...m, [companyId]: note }));
      markSaving(savingKey, true);
      try {
        const res = await fetch(`/api/companies/${companyId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? '저장 실패');
        }
      } catch (e) {
        setCompanyNotes((m) => ({ ...m, [companyId]: prev })); // 롤백
        showToast(`비고 저장 실패: ${(e as Error).message}`);
      } finally {
        markSaving(savingKey, false);
      }
    },
    [companyNotes, showToast]
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
      if (cell && (cell.progressCurrent != null || cell.progressTarget != null || cell.achieved !== null)) total += 1;
      if (cell && cell.achieved === true) achieved += 1;
    }
    return { achieved, total };
  };

  const [expanded, setExpanded] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  // 현재 저장 진행 중 여부 (셀/비고/파트너레벨 어느 것이든)
  const isSaving = savingKeys.size > 0;

  // "저장" 버튼: 입력 중이던 칸을 먼저 반영(포커스 아웃 → 자동 저장 트리거)한 뒤 확인 표시.
  // 각 칸은 이미 자동 저장되므로, 이 버튼은 마지막 입력 반영 + "저장됨" 안심용이다.
  const handleSave = () => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
  };

  return (
    <div>
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-red-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
      {savedFlash && !toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-green-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          모두 저장되었습니다 ✓
        </div>
      )}

      {/* 저장 상태 표시 + 저장 버튼 (입력은 자동 저장되며, 버튼은 마지막 입력 반영·확인용) */}
      <div className="flex items-center justify-end gap-3 mb-2">
        {isSaving ? (
          <span className="text-xs text-amber-600 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            저장 중…
          </span>
        ) : (
          <span className="text-xs text-green-600 flex items-center gap-1">✓ 저장됨</span>
        )}
        <button
          type="button"
          onClick={handleSave}
          className="text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-1.5 rounded-lg transition-colors"
        >
          저장
        </button>
      </div>

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
              <th className="text-left px-3 py-2 font-medium text-gray-700 text-xs border-b border-l border-gray-200 align-top min-w-[200px]">
                비고
                <div className="mt-1 text-[11px] text-gray-400 font-normal">참여기업별 정성 메모</div>
              </th>
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
                  const pct =
                    cell.progressTarget && cell.progressTarget > 0
                      ? Math.round(((cell.progressCurrent ?? 0) / cell.progressTarget) * 100)
                      : null;
                  return (
                    <td key={k.id} className="px-2 py-2 border-l border-gray-100 align-top min-w-[160px]">
                      {/* 정량: 달성 수 / 목표 수 */}
                      <div className="flex items-center gap-1 mb-1">
                        <input
                          type="number"
                          min={0}
                          key={`c:${key}:${cell.progressCurrent ?? ''}`}
                          defaultValue={cell.progressCurrent ?? ''}
                          placeholder="달성"
                          onBlur={(e) => {
                            const raw = e.target.value.trim();
                            if (raw !== '' && Number.isNaN(Number(raw))) return;
                            const v = raw === '' ? null : Math.max(0, Math.trunc(Number(raw)));
                            if (v !== (cell.progressCurrent ?? null)) saveCell(company.id, k.id, { progressCurrent: v });
                          }}
                          className="w-11 text-xs border border-gray-200 rounded px-1 py-1 text-right tabular-nums focus:outline-none focus:border-blue-400"
                        />
                        <span className="text-gray-400 text-xs">/</span>
                        <input
                          type="number"
                          min={0}
                          key={`t:${key}:${cell.progressTarget ?? ''}`}
                          defaultValue={cell.progressTarget ?? ''}
                          placeholder="목표"
                          onBlur={(e) => {
                            const raw = e.target.value.trim();
                            if (raw !== '' && Number.isNaN(Number(raw))) return;
                            const v = raw === '' ? null : Math.max(0, Math.trunc(Number(raw)));
                            if (v !== (cell.progressTarget ?? null)) saveCell(company.id, k.id, { progressTarget: v });
                          }}
                          className="w-11 text-xs border border-gray-200 rounded px-1 py-1 text-right tabular-nums focus:outline-none focus:border-blue-400"
                        />
                        {pct != null && <span className="text-[11px] text-gray-500 ml-0.5 tabular-nums">{pct}%</span>}
                      </div>
                      <AchievedToggle
                        value={cell.achieved}
                        progressPct={pct}
                        onClick={() => saveCell(company.id, k.id, { achieved: nextAchieved(cell.achieved) })}
                        saving={saving}
                      />
                      {/* 비고 (셀별 정성 메모) */}
                      <div className="mt-1">
                        {cellNoteOpen === key ? (
                          <textarea
                            autoFocus
                            defaultValue={cell.note ?? ''}
                            placeholder="비고 (정성 메모)"
                            onBlur={(e) => {
                              const v = e.target.value.trim() === '' ? null : e.target.value.trim();
                              if (v !== (cell.note ?? null)) saveCell(company.id, k.id, { note: v });
                              setCellNoteOpen(null);
                            }}
                            className="w-full text-[11px] border border-gray-200 rounded px-2 py-1 resize-y min-h-[42px] focus:outline-none focus:border-blue-400"
                          />
                        ) : cell.note ? (
                          <button
                            type="button"
                            onClick={() => setCellNoteOpen(key)}
                            title="비고 수정"
                            className="text-left w-full text-[11px] text-gray-500 hover:text-blue-600 whitespace-pre-wrap break-words leading-snug"
                          >
                            <span className="text-gray-400">비고 </span>{cell.note}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setCellNoteOpen(key)}
                            className="text-[11px] text-gray-300 hover:text-blue-500"
                          >
                            ＋ 비고
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
                {/* 기업별 비고 (정성 메모) — 행마다 1칸 */}
                <td className="px-2 py-2 border-l border-gray-100 align-top min-w-[200px]">
                  {noteEditing === company.id ? (
                    <textarea
                      autoFocus
                      defaultValue={companyNotes[company.id] ?? ''}
                      placeholder="비고 (정성 메모)"
                      onBlur={(e) => {
                        const v = e.target.value.trim() === '' ? null : e.target.value.trim();
                        saveCompanyNote(company.id, v);
                        setNoteEditing(null);
                      }}
                      className="w-full text-xs border border-gray-200 rounded px-2 py-1 resize-y min-h-[60px] focus:outline-none focus:border-blue-400"
                    />
                  ) : companyNotes[company.id] ? (
                    <button
                      type="button"
                      onClick={() => setNoteEditing(company.id)}
                      title="비고 수정"
                      className="text-left w-full text-xs text-gray-600 hover:text-blue-600 whitespace-pre-wrap break-words leading-snug"
                    >
                      {companyNotes[company.id]}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setNoteEditing(company.id)}
                      className="text-xs text-gray-300 hover:text-blue-500"
                    >
                      ＋ 비고 입력
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        각 칸에 <b>달성 수 / 목표 수</b>를 입력하면 진행률(%)이 자동 계산됩니다. 상태 버튼은 미정 → 달성 → 미달성 순으로 전환되며, <b>미정이면서 수치가 있으면 “진행중 N%”</b>로 표시됩니다. 그 아래 <b>비고</b>에 정성 메모를 적을 수 있어요. 입력은 자동 저장되며 <b>저장</b> 버튼으로 확인할 수 있습니다.
      </p>
    </div>
  );
}
