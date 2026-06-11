import { redirect } from 'next/navigation';
import LoginNotice from '@/components/LoginNotice';
import PendingNotice from '@/components/PendingNotice';
import RegisterForm from '@/components/RegisterForm';
import { getSessionAccount, partnerHomeHref, getSessionUser } from '@/lib/rbac';
import { getPartnerOptions } from '@/lib/meeting-data';

export const dynamic = 'force-dynamic';

// 가입 신청 화면 (게이트 예외 경로).
//   - 미인증 → 로그인 안내
//   - 이미 신청(pending) → 승인 대기 안내
//   - 이미 승인(active) → 본인 시작 화면으로 redirect
//   - 미신청 → 신청 폼
export default async function RegisterPage() {
  const account = await getSessionAccount();
  if (!account) return <LoginNotice title="가입 신청을 위해 로그인이 필요합니다" />;

  if (account.registered) {
    if (account.status === 'active') {
      const user = await getSessionUser();
      redirect(partnerHomeHref(user)); // admin→'/', partner→자기 KPI
    }
    return <PendingNotice email={account.email} />;
  }

  // 미신청: 파트너사 드롭다운 데이터 로드
  let partners: { id: string; name: string; country: string }[] = [];
  try {
    partners = await getPartnerOptions();
  } catch {
    partners = [];
  }

  return (
    <main className="max-w-md mx-auto px-6 py-16">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-gray-900">가입 신청</h1>
        <p className="text-gray-500 text-sm mt-1">
          이용 유형을 선택하고 신청하세요. 최고관리자 승인 후 이용할 수 있습니다.
        </p>
        <p className="text-xs text-gray-400 mt-2">{account.email}</p>
      </div>
      <RegisterForm partners={partners} />
    </main>
  );
}
