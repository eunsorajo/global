import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import LoginNotice from '@/components/LoginNotice';
import PendingNotice from '@/components/PendingNotice';
import Forbidden from '@/components/Forbidden';
import DbErrorNotice from '@/components/DbErrorNotice';
import KpiPartnerTabs from '@/components/KpiPartnerTabs';
import { getPartnerMatrix, KpiDataError } from '@/lib/kpi-data';
import { getMeetingsByPartner } from '@/lib/meeting-data';
import { pageGate } from '@/lib/rbac';
import type { MeetingWithFollowups } from '@/types/meeting';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ partnerId: string }>;
}

export default async function PartnerKpiPage({ params }: Props) {
  const { partnerId } = await params;

  // 가입 게이트
  const gate = await pageGate();
  if (gate.state === 'login') return <LoginNotice />;
  if (gate.state === 'register') redirect('/register');
  if (gate.state === 'pending') return <PendingNotice email={gate.email} />;
  const user = gate.user;

  // RBAC: admin 은 모든 파트너, partner 는 자기 partnerId 만.
  if (user.role !== 'admin' && user.partnerId !== partnerId) {
    return (
      <Forbidden
        message="다른 파트너의 KPI 페이지에는 접근할 수 없습니다."
        homeHref="/partner"
      />
    );
  }
  // 파트너 본인은 전용 대시보드로 안내 (이 경로는 관리자 전용 레이아웃)
  if (user.role !== 'admin') redirect('/partner');
  const isAdmin = user.role === 'admin';

  let matrix;
  try {
    matrix = await getPartnerMatrix(partnerId);
  } catch (e) {
    const message = e instanceof KpiDataError ? e.message : '데이터베이스 연결에 실패했습니다.';
    return (
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-blue-600 mb-6 inline-block">← 파트너 목록으로</Link>
        <DbErrorNotice message={message} />
      </main>
    );
  }

  if (!matrix) notFound();

  // 회의록은 관리자 전용 (partner 는 회의록 탭 자체가 비노출).
  let meetings: MeetingWithFollowups[] = [];
  if (isAdmin) {
    try {
      meetings = await getMeetingsByPartner(partnerId);
    } catch {
      meetings = [];
    }
  }

  const { partner } = matrix;

  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      {isAdmin && (
        <Link href="/" className="text-sm text-gray-500 hover:text-blue-600 mb-4 inline-block">← 파트너 목록으로</Link>
      )}

      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-sm text-gray-400">No.{partner.no} · {partner.country}</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-0.5">{partner.name}</h1>
          <div className="flex gap-2 mt-2">
            <span
              className={`text-xs px-2 py-0.5 rounded-full border ${
                partner.agreement_submitted
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-red-50 text-red-600 border-red-200'
              }`}
            >
              협약서 {partner.agreement_submitted ? '제출' : '미제출'}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full border bg-gray-50 text-gray-600 border-gray-200">
              참여기업 {matrix.companies.length}개사
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full border bg-gray-50 text-gray-600 border-gray-200">
              KPI {matrix.kpiDefinitions.length}개
            </span>
          </div>
        </div>
      </div>

      <KpiPartnerTabs matrix={matrix} meetings={meetings} isAdmin={isAdmin} />
    </main>
  );
}
