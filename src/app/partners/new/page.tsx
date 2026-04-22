'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PartnerCategory, PartnerGrade } from '@/types/partner';

const grades: PartnerGrade[] = ['전략 파트너', '우선 파트너', '일반 파트너', '잠재 파트너'];
const categories: PartnerCategory[] = ['물류·공급망', 'IT·기술', '금융·투자', '제조·생산', '유통·판매', '컨설팅', '기타'];

export default function NewPartnerPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    companyName: '',
    country: '',
    city: '',
    category: '기타' as PartnerCategory,
    grade: '잠재 파트너' as PartnerGrade,
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    assignee: '',
    notes: '',
  });

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    // TODO: Sheets API 연동 후 실제 저장
    // 지금은 더미로 목록 페이지로 이동
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    router.push('/');
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-8">
      <Link href="/" className="text-sm text-gray-500 hover:text-blue-600 mb-6 inline-block">
        ← 파트너 목록으로
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-8">파트너사 추가</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* 회사 기본 정보 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-800 text-sm">회사 정보</h2>

          <div>
            <label className="block text-xs text-gray-500 mb-1">파트너사명 *</label>
            <input
              required
              value={form.companyName}
              onChange={(e) => set('companyName', e.target.value)}
              placeholder="Apex Logistics Pte. Ltd."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">국가 *</label>
              <input
                required
                value={form.country}
                onChange={(e) => set('country', e.target.value)}
                placeholder="싱가포르"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">도시</label>
              <input
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
                placeholder="Singapore"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">카테고리</label>
              <select
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {categories.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">등급</label>
              <select
                value={form.grade}
                onChange={(e) => set('grade', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {grades.map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* 담당자 정보 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-800 text-sm">파트너사 담당자</h2>

          <div>
            <label className="block text-xs text-gray-500 mb-1">이름</label>
            <input
              value={form.contactName}
              onChange={(e) => set('contactName', e.target.value)}
              placeholder="James Tan"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">이메일</label>
              <input
                type="email"
                value={form.contactEmail}
                onChange={(e) => set('contactEmail', e.target.value)}
                placeholder="james@example.com"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">전화번호</label>
              <input
                value={form.contactPhone}
                onChange={(e) => set('contactPhone', e.target.value)}
                placeholder="+65-9123-4567"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* 내부 정보 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-800 text-sm">내부 정보</h2>

          <div>
            <label className="block text-xs text-gray-500 mb-1">우리 측 담당자</label>
            <input
              value={form.assignee}
              onChange={(e) => set('assignee', e.target.value)}
              placeholder="김민준"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">메모</label>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="파트너사에 대한 추가 메모..."
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <Link
            href="/"
            className="flex-1 text-center border border-gray-200 text-gray-600 py-3 rounded-xl hover:bg-gray-50 transition-colors text-sm"
          >
            취소
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium py-3 rounded-xl transition-colors text-sm"
          >
            {saving ? '저장 중...' : '파트너사 추가'}
          </button>
        </div>
      </form>
    </main>
  );
}
