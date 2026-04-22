import Link from 'next/link';

// 더미 알림 데이터 (Supabase 연동 전)
const dummyNotifications = [
  {
    id: '1',
    type: 'followup_overdue' as const,
    title: '팔로업 기한 초과',
    body: 'Apex Logistics — MOU 초안 검토 및 법무팀 전달 항목의 기한(2026-02-15)이 지났습니다.',
    partnerId: '1',
    partnerName: 'Apex Logistics Pte. Ltd.',
    isRead: false,
    createdAt: '2026-04-22T09:00:00',
  },
  {
    id: '2',
    type: 'meeting_reminder' as const,
    title: '회의 전 브리핑',
    body: '내일 NovaTech Solutions 미팅 전, 3개월 전 Apex Logistics와 물류 허브 논의 내용이 연관될 수 있습니다.',
    partnerId: '2',
    partnerName: 'NovaTech Solutions',
    isRead: false,
    createdAt: '2026-04-21T18:00:00',
  },
  {
    id: '3',
    type: 'partner_insight' as const,
    title: '파트너 연결 인사이트',
    body: 'Apex Logistics와 NovaTech Solutions 모두 싱가포르 기반이며 물류·IT 융합 분야에 관심이 있습니다. 컨소시엄 제안 가능성이 있습니다.',
    partnerId: '1',
    partnerName: 'Apex Logistics + NovaTech',
    isRead: true,
    createdAt: '2026-04-20T10:00:00',
  },
];

const typeConfig = {
  followup_overdue: { label: '기한 초과', className: 'bg-red-50 border-red-200', dotColor: 'bg-red-500' },
  meeting_reminder: { label: '회의 브리핑', className: 'bg-blue-50 border-blue-200', dotColor: 'bg-blue-500' },
  partner_insight: { label: '파트너 인사이트', className: 'bg-purple-50 border-purple-200', dotColor: 'bg-purple-500' },
};

export default function NotificationsPage() {
  const unread = dummyNotifications.filter((n) => !n.isRead).length;

  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">알림</h1>
          <p className="text-gray-500 text-sm mt-1">읽지 않은 알림 {unread}개</p>
        </div>
        <button className="text-sm text-gray-500 hover:text-blue-600 transition-colors">
          모두 읽음 처리
        </button>
      </div>

      <div className="space-y-3">
        {dummyNotifications.map((n) => {
          const config = typeConfig[n.type];
          return (
            <Link key={n.id} href={`/partners/${n.partnerId}`}>
              <div className={`rounded-xl border p-4 transition-shadow hover:shadow-sm ${config.className} ${n.isRead ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${n.isRead ? 'bg-gray-300' : config.dotColor}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-500">{config.label}</span>
                      <span className="text-xs text-gray-400">
                        {new Date(n.createdAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
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
    </main>
  );
}
