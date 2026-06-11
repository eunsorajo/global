import { redirect } from 'next/navigation';
import LoginNotice from '@/components/LoginNotice';
import PendingNotice from '@/components/PendingNotice';
import Forbidden from '@/components/Forbidden';
import DbErrorNotice from '@/components/DbErrorNotice';
import AdminUsersManager from '@/components/AdminUsersManager';
import { pageGate } from '@/lib/rbac';
import { listUsers, UserDataError } from '@/lib/user-data';
import { getPartnerOptions, MeetingDataError } from '@/lib/meeting-data';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  // 가입 게이트
  const gate = await pageGate();
  if (gate.state === 'login') return <LoginNotice />;
  if (gate.state === 'register') redirect('/register');
  if (gate.state === 'pending') return <PendingNotice email={gate.email} />;
  const user = gate.user;
  // 사용자 관리 + 가입 승인은 최고관리자 전용 (서버 측 집행)
  if (!user.isSuperAdmin) {
    return (
      <Forbidden
        message="사용자 관리·가입 승인은 최고관리자만 접근할 수 있습니다."
        homeHref={user.role === 'admin' ? '/' : '/partner'}
      />
    );
  }

  let users;
  let partners;
  try {
    [users, partners] = await Promise.all([listUsers(), getPartnerOptions()]);
  } catch (e) {
    const message =
      e instanceof UserDataError || e instanceof MeetingDataError
        ? e.message
        : '데이터베이스 연결에 실패했습니다.';
    return (
      <main className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">사용자 관리</h1>
        <DbErrorNotice message={message} />
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">사용자 관리</h1>
        <p className="text-gray-500 text-sm mt-1">
          로그인 허용 계정과 역할(관리자/파트너)을 관리합니다. 등록되지 않은 Google 계정은 로그인이 거부됩니다.
        </p>
      </div>

      <AdminUsersManager initialUsers={users} partners={partners} currentEmail={user.email} />
    </main>
  );
}
