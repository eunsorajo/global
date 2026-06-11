import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import LoginNotice from '@/components/LoginNotice';
import PendingNotice from '@/components/PendingNotice';
import Forbidden from '@/components/Forbidden';
import DbErrorNotice from '@/components/DbErrorNotice';
import DirectoryDetail from '@/components/DirectoryDetail';
import { getDirectoryItem, getDirectoryFollowups, DirectoryDataError } from '@/lib/directory-data';
import type { DirectoryFollowupRow } from '@/types/meeting';
import { pageGate } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

// 협력/잠재 파트너 CRM 상세 (partner_directory 기준). 관리자 전용.
// id 는 partner_directory.id. 사업 파트너의 directory id 로 들어오면
// /business-partners/[partners.id] 로 redirect (중복 방지).
export default async function DirectoryDetailPage({ params }: Props) {
  const { id } = await params;

  const gate = await pageGate();
  if (gate.state === 'login') return <LoginNotice />;
  if (gate.state === 'register') redirect('/register');
  if (gate.state === 'pending') return <PendingNotice email={gate.email} />;
  const user = gate.user;

  // 디렉토리 CRM 은 관리자 전용 → 파트너는 자기 대시보드로
  if (user.role !== 'admin') {
    if (user.partnerId) redirect('/partner');
    return <Forbidden message="해당 페이지에 접근할 수 없습니다." homeHref="/partner" />;
  }

  let item;
  try {
    item = await getDirectoryItem(id);
  } catch (e) {
    const message = e instanceof DirectoryDataError ? e.message : '데이터베이스 연결에 실패했습니다.';
    return (
      <main className="max-w-3xl mx-auto px-6 py-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-blue-600 mb-6 inline-block">← 파트너사 목록으로</Link>
        <DbErrorNotice message={message} />
      </main>
    );
  }

  if (!item) notFound();

  // 사업 파트너는 KPI 관리 화면으로 (중복 방지)
  if (item.status === '사업' && item.businessPartnerId) {
    redirect(`/business-partners/${item.businessPartnerId}`);
  }

  // 팔로업 목록(서버 로드). 실패해도 화면은 띄우고 빈 목록으로 폴백.
  let followups: DirectoryFollowupRow[] = [];
  try {
    followups = await getDirectoryFollowups(id);
  } catch {
    followups = [];
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      <Link href="/" className="text-sm text-gray-500 hover:text-blue-600 mb-6 inline-block">← 파트너사 목록으로</Link>
      <DirectoryDetail item={item} initialFollowups={followups} />
    </main>
  );
}
