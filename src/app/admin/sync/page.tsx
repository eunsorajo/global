import { redirect } from 'next/navigation';
import LoginNotice from '@/components/LoginNotice';
import PendingNotice from '@/components/PendingNotice';
import Forbidden from '@/components/Forbidden';
import SheetSyncManager from '@/components/SheetSyncManager';
import SyncHistory from '@/components/SyncHistory';
import { pageGate } from '@/lib/rbac';
import { getRecentSyncLogs, getRecentBackups } from '@/lib/sync-log-data';

export const dynamic = 'force-dynamic';

// 관리자 전용 — Google Sheets("1-1. 잠재 파트너사 DB") ↔ partner_directory 동기화.
export default async function AdminSyncPage() {
  const gate = await pageGate();
  if (gate.state === 'login') return <LoginNotice />;
  if (gate.state === 'register') redirect('/register');
  if (gate.state === 'pending') return <PendingNotice email={gate.email} />;
  const user = gate.user;

  // 동기화는 관리자 전용 (서버측 requireAdmin 이 API 에서도 재집행)
  if (user.role !== 'admin') {
    return (
      <Forbidden
        message="시트 동기화는 관리자만 접근할 수 있습니다."
        homeHref={user.partnerId ? '/partner' : '/'}
      />
    );
  }

  const [logs, backups] = await Promise.all([
    getRecentSyncLogs(20).catch(() => []),
    getRecentBackups(50).catch(() => []),
  ]);

  return (
    <main className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">시트 동기화</h1>
        <p className="text-gray-500 text-sm mt-1">
          Google Sheets &quot;1-1. 잠재 파트너사 DB&quot; ↔ 파트너사 디렉토리(잠재) 양방향 동기화.
          먼저 <span className="font-medium">변경 미리보기(dry-run)</span> 로 확인한 뒤 적용하세요.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 mb-6 text-xs text-gray-600 leading-relaxed">
        <p>· pull: 시트 → DB (신규 생성/수정). 시트에 ID 열을 만들고 매핑 키를 기록합니다.</p>
        <p>· push: DB → 시트 (변경된 셀만 기록). ID 열이 있어야 동작합니다.</p>
        <p>· 충돌(양쪽 모두 변경): 자동으로 가장 최근 값이 적용되고, 덮어쓴 이전 값은 아래 백업에 보관됩니다(되돌리기 가능).</p>
        <p>· 한 번에 15건 넘게 바뀌면 자동 적용을 멈추고 확인을 요청합니다.</p>
      </div>

      <SheetSyncManager />

      <SyncHistory logs={logs} backups={backups} />
    </main>
  );
}
