import { dummyPartners } from '@/data/dummy';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { FollowUpStatus, PartnerGrade } from '@/types/partner';

const gradeColors: Record<PartnerGrade, string> = {
  '전략 파트너': 'bg-purple-100 text-purple-700',
  '우선 파트너': 'bg-blue-100 text-blue-700',
  '일반 파트너': 'bg-gray-100 text-gray-700',
  '잠재 파트너': 'bg-yellow-100 text-yellow-700',
};

const followUpStatusLabel: Record<FollowUpStatus, { label: string; className: string }> = {
  pending: { label: '대기', className: 'bg-gray-100 text-gray-600' },
  in_progress: { label: '진행 중', className: 'bg-blue-100 text-blue-600' },
  completed: { label: '완료', className: 'bg-green-100 text-green-600' },
  overdue: { label: '기한 초과', className: 'bg-red-100 text-red-600' },
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PartnerDetailPage({ params }: Props) {
  const { id } = await params;
  const partner = dummyPartners.find((p) => p.id === id);

  if (!partner) notFound();

  return (
    <main className="max-w-4xl mx-auto px-6 py-8">
      <Link href="/" className="text-sm text-gray-500 hover:text-blue-600 mb-6 inline-block">
        ← 파트너 목록으로
      </Link>

      {/* 헤더 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{partner.companyName}</h1>
            <p className="text-gray-500 text-sm mt-1">
              {partner.country} · {partner.city}
            </p>
          </div>
          <span className={`text-sm font-medium px-3 py-1 rounded-full ${gradeColors[partner.grade]}`}>
            {partner.grade}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs text-gray-400 mb-1">카테고리</p>
            <p className="text-sm text-gray-800">{partner.category}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">담당자 (우리 측)</p>
            <p className="text-sm text-gray-800">{partner.assignee}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">담당 연락처</p>
            <p className="text-sm text-gray-800">{partner.contactName}</p>
            <p className="text-xs text-gray-500">{partner.contactEmail}</p>
            <p className="text-xs text-gray-500">{partner.contactPhone}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">최근 미팅</p>
            <p className="text-sm text-gray-800">{partner.lastMeetingDate ?? '이력 없음'}</p>
          </div>
        </div>

        {partner.notes && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-1">메모</p>
            <p className="text-sm text-gray-700">{partner.notes}</p>
          </div>
        )}
      </div>

      {/* 미팅 이력 + 팔로업 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">회의 이력</h2>
          <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            + 회의록 추가
          </button>
        </div>

        {partner.meetings.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
            아직 회의 이력이 없습니다.
          </div>
        ) : (
          <div className="space-y-4">
            {partner.meetings.map((meeting) => (
              <div key={meeting.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 text-sm">{meeting.title}</h3>
                  <span className="text-xs text-gray-400">{meeting.date}</span>
                </div>
                <p className="text-sm text-gray-600 mb-4">{meeting.summary}</p>

                {meeting.followUps.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">팔로업 항목</p>
                    <div className="space-y-2">
                      {meeting.followUps.map((f) => {
                        const status = followUpStatusLabel[f.status];
                        return (
                          <div
                            key={f.id}
                            className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2"
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                defaultChecked={f.status === 'completed'}
                                className="rounded"
                                readOnly
                              />
                              <span className={f.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-700'}>
                                {f.content}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-gray-400">{f.assignee}</span>
                              <span className="text-xs text-gray-400">· {f.dueDate}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${status.className}`}>
                                {status.label}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
