import PartnerCard from '@/components/PartnerCard';
import { dummyPartners } from '@/data/dummy';
import { PartnerCategory, PartnerGrade } from '@/types/partner';

const grades: PartnerGrade[] = ['전략 파트너', '우선 파트너', '일반 파트너', '잠재 파트너'];
const categories: PartnerCategory[] = ['물류·공급망', 'IT·기술', '금융·투자', '제조·생산', '유통·판매', '컨설팅', '기타'];

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
        <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          + 파트너사 추가
        </button>
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

      <div className="flex gap-3 mb-4 flex-wrap">
        <button className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-full">전체</button>
        {grades.map((g) => (
          <button
            key={g}
            className="text-sm bg-white text-gray-600 border border-gray-200 px-3 py-1.5 rounded-full hover:border-blue-300 hover:text-blue-600 transition-colors"
          >
            {g}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-8 flex-wrap">
        {categories.map((c) => (
          <button
            key={c}
            className="text-xs bg-white text-gray-500 border border-gray-200 px-2.5 py-1 rounded-full hover:border-blue-300 hover:text-blue-600 transition-colors"
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {dummyPartners.map((partner) => (
          <PartnerCard key={partner.id} partner={partner} />
        ))}
      </div>
    </main>
  );
}
