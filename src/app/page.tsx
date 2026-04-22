import { dummyPartners } from '@/data/dummy';
import Link from 'next/link';
import PartnerList from '@/components/PartnerList';

export default function Home() {
  const totalFollowUps = dummyPartners
    .flatMap((p) => p.meetings.flatMap((m) => m.followUps))
    .filter((f) => f.status === 'pending' || f.status === 'in_progress' || f.status === 'overdue').length;

  const overdueCount = dummyPartners
    .flatMap((p) => p.meetings.flatMap((m) => m.followUps))
    .filter((f) => f.status === 'overdue').length;

  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">파트너 네트워크</h1>
          <p className="text-gray-500 text-sm mt-1">총 {dummyPartners.length}개 파트너사</p>
        </div>
        <Link href="/partners/new" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          + 파트너사 추가
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">전체 파트너사</p>
          <p className="text-2xl font-bold text-gray-900">{dummyPartners.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">전략 파트너</p>
          <p className="text-2xl font-bold text-purple-600">
            {dummyPartners.filter((p) => p.grade === '전략 파트너').length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">미완료 팔로업</p>
          <p className="text-2xl font-bold text-orange-500">{totalFollowUps}</p>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-200 p-4">
          <p className="text-xs text-red-500 mb-1">기한 초과</p>
          <p className="text-2xl font-bold text-red-600">{overdueCount}</p>
        </div>
      </div>

      <PartnerList partners={dummyPartners} />
    </main>
  );
}
