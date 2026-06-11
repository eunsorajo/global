import Link from 'next/link';
import { redirect } from 'next/navigation';
import LoginNotice from '@/components/LoginNotice';
import PendingNotice from '@/components/PendingNotice';
import Forbidden from '@/components/Forbidden';
import DbErrorNotice from '@/components/DbErrorNotice';
import { getNotifications, NotificationDataError } from '@/lib/notification-data';
import type { NotificationLevel } from '@/lib/notification-data';
import { pageGate } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

const levelConfig: Record<
  NotificationLevel,
  { label: string; className: string; dotColor: string }
> = {
  overdue: { label: '기한 초과', className: 'bg-red-50 border-red-200', dotColor: 'bg-red-500' },
  due_soon: { label: '기한 임박', className: 'bg-amber-50 border-amber-200', dotColor: 'bg-amber-500' },
  kpi_undefined: { label: 'KPI 미정의', className: 'bg-gray-50 border-gray-200', dotColor: 'bg-gray-400' },
};

export default async function NotificationsPage() {
  // 가입 게이트
  const gate = await pageGate();
  if (gate.state === 'login') return <LoginNotice />;
  if (gate.state === 'register') redirect('/register');
  if (gate.state === 'pending') return <PendingNotice email={gate.email} />;
  const user = gate.user;
  // 알림은 관리자 전용 내부 운영 메뉴. partner 차단.
  if (user.role !== 'admin') {
    if (user.partnerId) redirect('/partner');
    return <Forbidden message="계정에 파트너가 매핑되어 있지 않습니다. 최고관리자에게 문의해주세요." />;
  }

  let result;
  try {
    result = await getNotifications();
  } catch (e) {
    const message = e instanceof NotificationDataError ? e.message : '데이터베이스 연결에 실패했습니다.';
    return (
      <main className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">알림</h1>
        <DbErrorNotice message={message} />
      </main>
    );
  }

  const { items, counts } = result;

  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">알림</h1>
        <p className="text-gray-500 text-sm mt-1">
          기한 초과 {counts.overdue}건 · 임박 {counts.dueSoon}건 · KPI 미정의 {counts.kpiUndefined}건
        </p>
      </div>

      {items.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
          <p className="text-gray-500 text-sm">처리할 알림이 없습니다. 모든 항목이 정상입니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((n) => {
            const config = levelConfig[n.level];
            return (
              <Link key={n.id} href={n.href}>
                <div className={`rounded-xl border p-4 transition-shadow hover:shadow-sm ${config.className}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${config.dotColor}`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-gray-500">{config.label}</span>
                        {n.dueDate && <span className="text-xs text-gray-400">기한 {n.dueDate}</span>}
                      </div>
                      <p className="text-sm font-semibold text-gray-900 mb-0.5">{n.title}</p>
                      <p className="text-sm text-gray-600 leading-relaxed">{n.body}</p>
                      <p className="text-xs text-gray-400 mt-1">{n.partnerName}</p>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
