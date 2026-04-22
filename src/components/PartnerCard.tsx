'use client';

import { Partner, PartnerGrade } from '@/types/partner';
import Link from 'next/link';

interface PartnerCardProps {
  partner: Partner;
}

const gradeColors: Record<PartnerGrade, string> = {
  '전략 파트너': 'bg-purple-100 text-purple-700',
  '우선 파트너': 'bg-blue-100 text-blue-700',
  '일반 파트너': 'bg-gray-100 text-gray-700',
  '잠재 파트너': 'bg-yellow-100 text-yellow-700',
};

const followUpStatusCount = (partner: Partner) => {
  const all = partner.meetings.flatMap((m) => m.followUps);
  const overdue = all.filter((f) => f.status === 'overdue').length;
  const pending = all.filter((f) => f.status === 'pending' || f.status === 'in_progress').length;
  return { overdue, pending };
};

export default function PartnerCard({ partner }: PartnerCardProps) {
  const { overdue, pending } = followUpStatusCount(partner);

  return (
    <Link href={`/partners/${partner.id}`}>
      <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-900 text-base leading-tight">{partner.companyName}</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {partner.country} · {partner.city}
            </p>
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ml-2 ${gradeColors[partner.grade]}`}>
            {partner.grade}
          </span>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs bg-gray-50 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full">
            {partner.category}
          </span>
        </div>

        <div className="text-sm text-gray-600 mb-3">
          <p className="font-medium text-gray-700">{partner.contactName}</p>
          <p className="text-xs text-gray-400">{partner.contactEmail}</p>
        </div>

        <div className="text-xs text-gray-500 mb-3">
          담당자: <span className="text-gray-700 font-medium">{partner.assignee}</span>
        </div>

        <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
          <div className="text-xs text-gray-400">
            {partner.lastMeetingDate
              ? `최근 미팅: ${partner.lastMeetingDate}`
              : '미팅 이력 없음'}
          </div>
          <div className="flex gap-1.5">
            {overdue > 0 && (
              <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">
                기한 초과 {overdue}
              </span>
            )}
            {pending > 0 && (
              <span className="text-xs bg-orange-50 text-orange-600 border border-orange-200 px-2 py-0.5 rounded-full">
                팔로업 {pending}
              </span>
            )}
            {overdue === 0 && pending === 0 && partner.meetings.length > 0 && (
              <span className="text-xs bg-green-50 text-green-600 border border-green-200 px-2 py-0.5 rounded-full">
                완료
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
