import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import LoginNotice from '@/components/LoginNotice';
import DbErrorNotice from '@/components/DbErrorNotice';
import KpiPartnerTabs from '@/components/KpiPartnerTabs';
import { getPartnerMatrix, KpiDataError } from '@/lib/kpi-data';
import { getMeetingsByPartner } from '@/lib/meeting-data';
import type { MeetingWithFollowups } from '@/types/meeting';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ partnerId: string }>;
}

export default async function PartnerKpiPage({ params }: Props) {
  const { partnerId } = await params;

  // 인증 이후에만 데이터 조회
  const session = await auth();
  if (!session) return <LoginNotice />;

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

  // 회의록(meetings 테이블이 아직 없을 수 있으므로 실패해도 화면은 유지)
  let meetings: MeetingWithFollowups[] = [];
  try {
    meetings = await getMeetingsByPartner(partnerId);
  } catch {
    meetings = [];
  }

  const { partner } = matrix;

  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      <Link href="/" className="text-sm text-gray-500 hover:text-blue-600 mb-4 inline-block">← 파트너 목록으로</Link>

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

      <KpiPartnerTabs matrix={matrix} meetings={meetings} />
    </main>
  );
}
