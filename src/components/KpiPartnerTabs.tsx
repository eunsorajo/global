'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import KpiMatrix from '@/components/KpiMatrix';
import KpiSettings from '@/components/KpiSettings';
import MeetingsTab from '@/components/MeetingsTab';
import type { PartnerMatrix } from '@/types/accelerating';
import type { MeetingWithFollowups } from '@/types/meeting';

type Tab = 'matrix' | 'settings' | 'meetings';

export default function KpiPartnerTabs({
  matrix,
  meetings,
}: {
  matrix: PartnerMatrix;
  meetings: MeetingWithFollowups[];
}) {
  const { partner, companies, kpiDefinitions } = matrix;
  const canShowMatrix = companies.length > 0 && kpiDefinitions.length > 0;

  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialTab: Tab =
    tabParam === 'meetings'
      ? 'meetings'
      : tabParam === 'settings'
        ? 'settings'
        : canShowMatrix
          ? 'matrix'
          : 'settings';
  const [tab, setTab] = useState<Tab>(initialTab);

  const tabBtn = (active: boolean) =>
    `text-sm px-4 py-2 border-b-2 transition-colors ${
      active ? 'border-blue-600 text-blue-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'
    }`;

  return (
    <div>
      <div className="flex gap-2 border-b border-gray-200 mb-6">
        <button className={tabBtn(tab === 'matrix')} onClick={() => setTab('matrix')}>
          KPI 매트릭스
        </button>
        <button className={tabBtn(tab === 'settings')} onClick={() => setTab('settings')}>
          KPI 정의 · 기업 관리
        </button>
        <button className={tabBtn(tab === 'meetings')} onClick={() => setTab('meetings')}>
          회의록 {meetings.length > 0 && <span className="text-gray-400">({meetings.length})</span>}
        </button>
      </div>

      {tab === 'matrix' && (
        canShowMatrix ? (
          <KpiMatrix matrix={matrix} />
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
            <p className="font-semibold text-amber-800 mb-1">
              {kpiDefinitions.length === 0
                ? '협약서 미제출 — KPI 항목을 입력해주세요'
                : '참여기업이 아직 없습니다'}
            </p>
            <p className="text-amber-700 text-sm mb-4">
              {kpiDefinitions.length === 0
                ? '아래 "KPI 정의 · 기업 관리" 탭에서 KPI 항목을 정의하면 매트릭스가 활성화됩니다.'
                : '참여기업을 추가하면 기업 × KPI 매트릭스를 입력할 수 있습니다.'}
            </p>
            <button
              onClick={() => setTab('settings')}
              className="text-sm bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg"
            >
              정의 · 기업 관리로 이동
            </button>
          </div>
        )
      )}

      {tab === 'settings' && (
        <KpiSettings partner={partner} initialDefinitions={kpiDefinitions} initialCompanies={companies} />
      )}

      {tab === 'meetings' && <MeetingsTab meetings={meetings} />}
    </div>
  );
}
