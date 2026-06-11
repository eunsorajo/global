import { redirect } from 'next/navigation';

// 구 경로 호환: /kpi → /business-partners (사업파트너 관리로 이전됨)
export default function KpiDashboardRedirect() {
  redirect('/business-partners');
}
