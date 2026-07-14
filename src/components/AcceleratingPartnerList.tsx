'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { PartnerSummary, PartnerStatus } from '@/types/accelerating';

const statusLabel: Record<PartnerStatus, string> = {
  managing: '관리중',
  kpi_undefined: 'KPI 미정의',
  no_companies: '기업 미확정',
};

const statusBadge: Record<PartnerStatus, string> = {
  managing: 'bg-green-50 text-green-700 border-green-200',
  kpi_undefined: 'bg-amber-50 text-amber-700 border-amber-200',
  no_companies: 'bg-gray-100 text-gray-600 border-gray-200',
};

// 프로그램 유형별 배지 색상
const programBadge: Record<string, string> = {
  AC: 'bg-blue-100 text-blue-700 border-blue-200',
  PoC: 'bg-purple-100 text-purple-700 border-purple-200',
  스케일업: 'bg-amber-100 text-amber-800 border-amber-200',
  'PoC/스케일업': 'bg-teal-100 text-teal-700 border-teal-200',
  전시회: 'bg-rose-100 text-rose-700 border-rose-200',
};

// 프로그램 단계(그룹) 정렬 순서 + 표시 라벨
const PHASE_ORDER = ['1차', '2차', '전시회'];
const phaseLabel: Record<string, string> = {
  '1차': '1차 프로그램',
  '2차': '2차 프로그램',
  전시회: '전시회',
};

function RateBar({ rate }: { rate: number }) {
  const color = rate >= 70 ? 'bg-green-500' : rate >= 40 ? 'bg-blue-500' : 'bg-orange-400';
  return (
    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full`} style={{ width: `${rate}%` }} />
    </div>
  );
}

function PartnerCard({ p, lastMeetingDate }: { p: PartnerSummary; lastMeetingDate?: string }) {
  return (
    <Link href={`/business-partners/${p.id}`}>
      <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer h-full flex flex-col">
        <div className="flex items-start justify-between mb-2">
          <div className="min-w-0">
            <p className="text-xs text-gray-400">No.{p.no} · {p.country}</p>
            <h3 className="font-semibold text-gray-900 text-base leading-tight mt-0.5">{p.name}</h3>
          </div>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 ml-2 whitespace-nowrap ${statusBadge[p.status]}`}>
            {statusLabel[p.status]}
          </span>
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {p.programType && (
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${
                programBadge[p.programType] ?? 'bg-gray-100 text-gray-600 border-gray-200'
              }`}
            >
              {p.programType}
            </span>
          )}
          <span className="text-xs bg-gray-50 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full whitespace-nowrap">
            참여기업 {p.companyCount}개사
          </span>
        </div>

        <div className="mt-auto pt-3 border-t border-gray-100">
          {p.kpiCount > 0 ? (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5 text-xs">
                <span className="text-gray-500 min-w-0">KPI 달성률 ({p.kpiCount}개 정의)</span>
                <span className="font-semibold text-gray-800 shrink-0 whitespace-nowrap">{p.achievementRate}%</span>
              </div>
              <RateBar rate={p.achievementRate ?? 0} />
            </div>
          ) : (
            <p className="text-xs text-gray-400">KPI 미정의 — 항목을 입력해주세요</p>
          )}
          {lastMeetingDate && (
            <p className="text-xs text-gray-400 mt-2">최근 회의 {lastMeetingDate}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function AcceleratingPartnerList({
  partners,
  lastMeetingDates = {},
}: {
  partners: PartnerSummary[];
  lastMeetingDates?: Record<string, string>;
}) {
  const [country, setCountry] = useState<string | null>(null);
  const [kpiFilter, setKpiFilter] = useState<'all' | 'defined' | 'undefined'>('all');

  const countries = useMemo(() => Array.from(new Set(partners.map((p) => p.country))), [partners]);

  const filtered = partners.filter((p) => {
    if (country && p.country !== country) return false;
    if (kpiFilter === 'defined' && p.kpiCount === 0) return false;
    if (kpiFilter === 'undefined' && p.kpiCount > 0) return false;
    return true;
  });

  // 프로그램 단계(1차 → 2차 → 전시회)로 그룹화. 그 외/미지정은 마지막 '기타'.
  const groups = useMemo(() => {
    const gs = PHASE_ORDER.map((ph) => ({ phase: ph, items: filtered.filter((p) => p.programPhase === ph) })).filter(
      (g) => g.items.length > 0,
    );
    const rest = filtered.filter((p) => !p.programPhase || !PHASE_ORDER.includes(p.programPhase));
    if (rest.length) gs.push({ phase: '기타', items: rest });
    return gs;
  }, [filtered]);

  const pill = (active: boolean) =>
    `text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
      active
        ? 'bg-blue-600 text-white'
        : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-600'
    }`;

  return (
    <div>
      <div className="space-y-2 mb-6">
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-gray-400 w-14">국가</span>
          <button onClick={() => setCountry(null)} className={pill(country === null)}>전체</button>
          {countries.map((c) => (
            <button key={c} onClick={() => setCountry(country === c ? null : c)} className={pill(country === c)}>
              {c}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-gray-400 w-14">KPI</span>
          <button onClick={() => setKpiFilter('all')} className={pill(kpiFilter === 'all')}>전체</button>
          <button onClick={() => setKpiFilter('defined')} className={pill(kpiFilter === 'defined')}>정의됨</button>
          <button onClick={() => setKpiFilter('undefined')} className={pill(kpiFilter === 'undefined')}>미정의</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">해당 조건의 파트너가 없습니다.</div>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.phase}>
              <h3 className="text-sm font-semibold text-gray-500 mb-3">
                {phaseLabel[g.phase] ?? g.phase} <span className="text-gray-400 font-normal">({g.items.length})</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {g.items.map((p) => (
                  <PartnerCard key={p.id} p={p} lastMeetingDate={lastMeetingDates[p.id]} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
