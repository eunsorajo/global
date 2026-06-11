import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ partnerId: string }>;
  searchParams: Promise<{ tab?: string }>;
}

// 구 경로 호환: /kpi/[partnerId] → /business-partners/[partnerId]
// 기존 북마크/알림 링크의 ?tab= 쿼리를 보존한다.
export default async function PartnerKpiRedirect({ params, searchParams }: Props) {
  const { partnerId } = await params;
  const { tab } = await searchParams;
  const suffix = tab ? `?tab=${encodeURIComponent(tab)}` : '';
  redirect(`/business-partners/${partnerId}${suffix}`);
}
