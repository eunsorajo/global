'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PartnerRow, KpiDefinitionRow, CompanyRow, KpiCategory } from '@/types/accelerating';

interface Props {
  partner: PartnerRow;
  initialDefinitions: KpiDefinitionRow[];
  initialCompanies: CompanyRow[];
  // 관리자 여부. partner 는 협약 토글 비노출 + 협약 제출 후 KPI 정의 편집 잠금(서버도 집행).
  isAdmin: boolean;
}

export default function KpiSettings({ partner, initialDefinitions, initialCompanies }: Props) {
  const router = useRouter();
  const [defs, setDefs] = useState<KpiDefinitionRow[]>(initialDefinitions);
  const [companies, setCompanies] = useState<CompanyRow[]>(initialCompanies);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // "저장" 버튼: 입력 중이던 칸을 먼저 반영(포커스 아웃 → 자동 저장 트리거)한 뒤 확인 표시.
  // 각 항목은 이미 자동 저장되므로, 이 버튼은 마지막 입력 반영 + "저장됨" 안심용이다.
  function handleSave() {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
  }

  // 새 KPI 폼
  const [newKpi, setNewKpi] = useState<{ category: KpiCategory; name: string; target: string; note: string }>({
    category: '공통',
    name: '',
    target: '',
    note: '',
  });
  // 새 기업 폼
  const [newCompany, setNewCompany] = useState({ name: '', sector: '', description: '' });

  const refresh = () => router.refresh();

  async function call(url: string, method: string, body?: unknown) {
    setError(null);
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? '요청 실패');
    }
    return res.json();
  }

  // ---------- KPI 정의 ----------
  async function addKpi() {
    if (!newKpi.name.trim()) {
      setError('KPI 항목명을 입력하세요.');
      return;
    }
    setBusy(true);
    try {
      const { definition } = await call('/api/kpi/definitions', 'POST', {
        partnerId: partner.id,
        category: newKpi.category,
        name: newKpi.name,
        target: newKpi.target || null,
        note: newKpi.note || null,
      });
      setDefs((d) => [...d, definition]);
      setNewKpi({ category: '공통', name: '', target: '', note: '' });
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function updateKpi(id: string, patch: Partial<KpiDefinitionRow>) {
    setBusy(true);
    try {
      const { definition } = await call(`/api/kpi/definitions/${id}`, 'PATCH', patch);
      setDefs((d) => d.map((k) => (k.id === id ? definition : k)));
    } catch (e) {
      setError((e as Error).message);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function deleteKpi(id: string) {
    if (!confirm('이 KPI 항목을 삭제하시겠습니까? 관련 진척도도 함께 삭제됩니다.')) return;
    setBusy(true);
    try {
      await call(`/api/kpi/definitions/${id}`, 'DELETE');
      setDefs((d) => d.filter((k) => k.id !== id));
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function applyTemplate() {
    setBusy(true);
    try {
      const { definitions } = await call(`/api/kpi/templates/${partner.id}`, 'POST');
      if (definitions?.length) setDefs((d) => [...d, ...definitions]);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ---------- 참여기업 ----------
  async function addCompany() {
    if (!newCompany.name.trim()) {
      setError('기업명을 입력하세요.');
      return;
    }
    setBusy(true);
    try {
      const { company } = await call('/api/companies', 'POST', {
        partnerId: partner.id,
        name: newCompany.name,
        sector: newCompany.sector || null,
        description: newCompany.description || null,
      });
      setCompanies((c) => [...c, company]);
      setNewCompany({ name: '', sector: '', description: '' });
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteCompany(id: string) {
    if (!confirm('이 참여기업을 삭제하시겠습니까? 관련 진척도도 함께 삭제됩니다.')) return;
    setBusy(true);
    try {
      await call(`/api/companies/${id}`, 'DELETE');
      setCompanies((c) => c.filter((x) => x.id !== id));
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input = 'border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-400';

  // 협약서 개념 제거 — KPI 편집 잠금 없음(파트너도 항상 편집 가능). 권한은 서버에서 집행.
  const kpiLocked = false;

  return (
    <div className="space-y-8">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>
      )}
      {savedFlash && !error && (
        <div className="fixed bottom-6 right-6 z-50 bg-green-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          모두 저장되었습니다 ✓
        </div>
      )}

      {/* 저장 상태 표시 + 저장 버튼 (입력은 자동 저장되며, 버튼은 마지막 입력 반영·확인용) */}
      <div className="flex items-center justify-end gap-3">
        {busy ? (
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

      {/* KPI 정의 관리 */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <h3 className="font-semibold text-gray-900 min-w-0">KPI 항목 관리</h3>
          {!kpiLocked && defs.length === 0 && (
            <button
              onClick={applyTemplate}
              disabled={busy}
              className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 shrink-0 whitespace-nowrap"
            >
              공통 KPI 3종 템플릿 채우기
            </button>
          )}
        </div>

        {defs.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
            아직 정의된 KPI 가 없습니다. 위 템플릿 버튼으로 공통 KPI 3종(사전 컨설팅/비즈니스 매칭/사후 관리)을 한 번에 채우거나, 아래에서 직접 추가하세요.
          </p>
        ) : (
          <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm break-keep">
            <thead className="text-xs text-gray-400">
              <tr>
                <th className="text-left py-2 w-12">순번</th>
                <th className="text-left py-2 w-20">구분</th>
                <th className="text-left py-2">항목명</th>
                <th className="text-left py-2">목표 기준</th>
                <th className="text-left py-2">비고</th>
                <th className="py-2 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {defs.map((k) => (
                <tr key={k.id}>
                  <td className="py-2 text-gray-400">{k.kpi_order}</td>
                  <td className="py-2">
                    <select
                      defaultValue={k.category ?? ''}
                      disabled={kpiLocked}
                      onChange={(e) => updateKpi(k.id, { category: (e.target.value || null) as KpiCategory | null })}
                      className={`${input} disabled:bg-gray-50 disabled:text-gray-400`}
                    >
                      <option value="">미정</option>
                      <option value="공통">공통</option>
                      <option value="특화">특화</option>
                    </select>
                  </td>
                  <td className="py-2">
                    <input
                      defaultValue={k.name}
                      disabled={kpiLocked}
                      onBlur={(e) => e.target.value.trim() && e.target.value !== k.name && updateKpi(k.id, { name: e.target.value })}
                      className={`${input} w-full disabled:bg-gray-50 disabled:text-gray-400`}
                    />
                  </td>
                  <td className="py-2">
                    <input
                      defaultValue={k.target ?? ''}
                      disabled={kpiLocked}
                      onBlur={(e) => e.target.value !== (k.target ?? '') && updateKpi(k.id, { target: e.target.value || null })}
                      className={`${input} w-full disabled:bg-gray-50 disabled:text-gray-400`}
                    />
                  </td>
                  <td className="py-2">
                    <input
                      defaultValue={k.note ?? ''}
                      disabled={kpiLocked}
                      onBlur={(e) => e.target.value !== (k.note ?? '') && updateKpi(k.id, { note: e.target.value || null })}
                      className={`${input} w-full disabled:bg-gray-50 disabled:text-gray-400`}
                    />
                  </td>
                  <td className="py-2 text-right">
                    {!kpiLocked && (
                      <button onClick={() => deleteKpi(k.id)} className="text-xs text-red-500 hover:text-red-700">
                        삭제
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        {/* 새 KPI 추가 (협약 제출 후 partner 는 비노출) */}
        {!kpiLocked && (
        <div className="flex flex-wrap gap-2 items-end border-t border-gray-100 pt-4">
          <div>
            <label className="block text-xs text-gray-400 mb-0.5">구분</label>
            <select
              value={newKpi.category}
              onChange={(e) => setNewKpi({ ...newKpi, category: e.target.value as KpiCategory })}
              className={input}
            >
              <option value="공통">공통</option>
              <option value="특화">특화</option>
            </select>
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-gray-400 mb-0.5">항목명 *</label>
            <input value={newKpi.name} onChange={(e) => setNewKpi({ ...newKpi, name: e.target.value })} className={`${input} w-full`} />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-gray-400 mb-0.5">목표 기준</label>
            <input value={newKpi.target} onChange={(e) => setNewKpi({ ...newKpi, target: e.target.value })} className={`${input} w-full`} />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="block text-xs text-gray-400 mb-0.5">비고</label>
            <input value={newKpi.note} onChange={(e) => setNewKpi({ ...newKpi, note: e.target.value })} className={`${input} w-full`} />
          </div>
          <button onClick={addKpi} disabled={busy} className="text-sm bg-gray-900 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 whitespace-nowrap">
            + 추가
          </button>
        </div>
        )}
      </section>

      {/* 참여기업 관리 */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-4">참여기업 관리</h3>
        {companies.length === 0 ? (
          <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-4">
            아직 등록된 참여기업이 없습니다. 아래에서 추가하세요.
          </p>
        ) : (
          <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm break-keep">
            <thead className="text-xs text-gray-400">
              <tr>
                <th className="text-left py-2 w-12">순번</th>
                <th className="text-left py-2">기업명</th>
                <th className="text-left py-2">분야</th>
                <th className="text-left py-2">사업내용</th>
                <th className="py-2 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {companies.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 text-gray-400">{c.no}</td>
                  <td className="py-2">
                    <input
                      defaultValue={c.name}
                      onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && call(`/api/companies/${c.id}`, 'PATCH', { name: e.target.value }).then(refresh).catch((err) => setError((err as Error).message))}
                      className={`${input} w-full`}
                    />
                  </td>
                  <td className="py-2">
                    <input
                      defaultValue={c.sector ?? ''}
                      onBlur={(e) => e.target.value !== (c.sector ?? '') && call(`/api/companies/${c.id}`, 'PATCH', { sector: e.target.value || null }).then(refresh).catch((err) => setError((err as Error).message))}
                      className={`${input} w-full`}
                    />
                  </td>
                  <td className="py-2">
                    <input
                      defaultValue={c.description ?? ''}
                      onBlur={(e) => e.target.value !== (c.description ?? '') && call(`/api/companies/${c.id}`, 'PATCH', { description: e.target.value || null }).then(refresh).catch((err) => setError((err as Error).message))}
                      className={`${input} w-full`}
                    />
                  </td>
                  <td className="py-2 text-right">
                    <button onClick={() => deleteCompany(c.id)} className="text-xs text-red-500 hover:text-red-700">삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-end border-t border-gray-100 pt-4">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-gray-400 mb-0.5">기업명 *</label>
            <input value={newCompany.name} onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })} className={`${input} w-full`} />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="block text-xs text-gray-400 mb-0.5">분야</label>
            <input value={newCompany.sector} onChange={(e) => setNewCompany({ ...newCompany, sector: e.target.value })} className={`${input} w-full`} />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-gray-400 mb-0.5">사업내용</label>
            <input value={newCompany.description} onChange={(e) => setNewCompany({ ...newCompany, description: e.target.value })} className={`${input} w-full`} />
          </div>
          <button onClick={addCompany} disabled={busy} className="text-sm bg-gray-900 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 whitespace-nowrap">
            + 추가
          </button>
        </div>
      </section>
    </div>
  );
}
