'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import KpiMatrix from '@/components/KpiMatrix';
import KpiSettings from '@/components/KpiSettings';
import MeetingsTab from '@/components/MeetingsTab';
import PartnerInfoTab from '@/components/PartnerInfoTab';
import type { PartnerMatrix, DirectoryListItem } from '@/types/accelerating';
import type { MeetingWithFollowups } from '@/types/meeting';

type Tab = 'info' | 'matrix' | 'settings' | 'meetings';

export default function KpiPartnerTabs({
  matrix,
  meetings,
  directory,
  isAdmin,
}: {
  matrix: PartnerMatrix;
  meetings: MeetingWithFollowups[];
  // partners.directory_id 로 연결된 디렉토리 프로필. 미전달(파트너 본인 대시보드 등)이면 정보 탭 비노출.
  directory?: DirectoryListItem | null;
  // 관리자 여부 — 회의록 탭/협약 토글 등 관리자 전용 UI 노출 제어 (서버 측 집행과 별개의 UX)
  isAdmin: boolean;
}) {
  const { partner, companies, kpiDefinitions } = matrix;
  const canShowMatrix = companies.length > 0 && kpiDefinitions.length > 0;
  // '파트너사 정보' 탭은 directory prop 이 전달된 사업 파트너 상세에서만 노출.
  const showInfoTab = directory !== undefined;

  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  // 정보 탭이 있으면 기본 탭은 '파트너사 정보'. ?tab= 으로 명시 시 해당 탭으로.
  const initialTab: Tab =
    tabParam === 'matrix'
      ? 'matrix'
      : tabParam === 'settings'
        ? 'settings'
        : tabParam === 'meetings' && isAdmin
          ? 'meetings'
          : showInfoTab
            ? 'info'
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
        {showInfoTab && (
          <button className={tabBtn(tab === 'info')} onClick={() => setTab('info')}>
            파트너사 정보
          </button>
        )}
        <button className={tabBtn(tab === 'matrix')} onClick={() => setTab('matrix')}>
          KPI 매트릭스
        </button>
        <button className={tabBtn(tab === 'settings')} onClick={() => setTab('settings')}>
          KPI 정의 · 기업 관리
        </button>
        {isAdmin && (
          <button className={tabBtn(tab === 'meetings')} onClick={() => setTab('meetings')}>
            회의록 {meetings.length > 0 && <span className="text-gray-400">({meetings.length})</span>}
          </button>
        )}
      </div>

      {tab === 'info' && showInfoTab && (
        <PartnerInfoTab directory={directory ?? null} meetings={meetings} isAdmin={isAdmin} />
      )}

      {tab === 'matrix' && (
        canShowMatrix ? (
          <KpiMatrix matrix={matrix} isAdmin={isAdmin} />
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
        <KpiSettings partner={partner} initialDefinitions={kpiDefinitions} initialCompanies={companies} isAdmin={isAdmin} />
      )}

      {tab === 'meetings' && isAdmin && <MeetingsTab meetings={meetings} />}
    </div>
  );
}
