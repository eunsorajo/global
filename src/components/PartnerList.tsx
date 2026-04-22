'use client';

import { useState } from 'react';
import PartnerCard from './PartnerCard';
import { Partner, PartnerCategory, PartnerGrade } from '@/types/partner';

const grades: PartnerGrade[] = ['전략 파트너', '우선 파트너', '일반 파트너', '잠재 파트너'];
const categories: PartnerCategory[] = ['물류·공급망', 'IT·기술', '금융·투자', '제조·생산', '유통·판매', '컨설팅', '기타'];

interface PartnerListProps {
  partners: Partner[];
}

export default function PartnerList({ partners }: PartnerListProps) {
  const [selectedGrade, setSelectedGrade] = useState<PartnerGrade | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<PartnerCategory | null>(null);

  const filtered = partners.filter((p) => {
    if (selectedGrade && p.grade !== selectedGrade) return false;
    if (selectedCategory && p.category !== selectedCategory) return false;
    return true;
  });

  return (
    <div>
      {/* 등급 필터 */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <button
          onClick={() => setSelectedGrade(null)}
          className={`text-sm px-3 py-1.5 rounded-full transition-colors ${
            selectedGrade === null
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-600'
          }`}
        >
          전체
        </button>
        {grades.map((g) => (
          <button
            key={g}
            onClick={() => setSelectedGrade(selectedGrade === g ? null : g)}
            className={`text-sm px-3 py-1.5 rounded-full transition-colors ${
              selectedGrade === g
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-600'
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {/* 카테고리 필터 */}
      <div className="flex gap-2 mb-8 flex-wrap">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setSelectedCategory(selectedCategory === c ? null : c)}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
              selectedCategory === c
                ? 'bg-blue-600 text-white border-blue-600 border'
                : 'bg-white text-gray-500 border border-gray-200 hover:border-blue-300 hover:text-blue-600'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* 파트너 카드 그리드 */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          해당 조건의 파트너사가 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((partner) => (
            <PartnerCard key={partner.id} partner={partner} />
          ))}
        </div>
      )}
    </div>
  );
}
