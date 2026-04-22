'use client';

import { useState } from 'react';
import Link from 'next/link';

interface SearchResult {
  meetingId: string;
  partnerName: string;
  meetingDate: string;
  meetingTitle: string;
  summary: string;
  similarity: number;
}

const EXAMPLE_QUERIES = [
  'MOU 초안 검토 어디까지 됐지?',
  '싱가포르 물류 허브 협의 내용',
  '일본 파트너와 투자 펀드 논의',
  'AI 재고 관리 파일럿 프로젝트',
];

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.results ?? []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">회의 내용 검색</h1>
        <p className="text-gray-500 text-sm mt-1">자연어로 물어보면 관련 회의록을 찾아드립니다.</p>
      </div>

      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch(query)}
          placeholder="예: 싱가포르 물류 허브 협의 내용이 뭐였지?"
          className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => handleSearch(query)}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-5 py-3 rounded-xl text-sm font-medium transition-colors"
        >
          {loading ? '검색 중...' : '검색'}
        </button>
      </div>

      {!searched && (
        <div>
          <p className="text-xs text-gray-400 mb-3">예시 질문</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_QUERIES.map((q) => (
              <button
                key={q}
                onClick={() => { setQuery(q); handleSearch(q); }}
                className="text-sm bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-full hover:border-blue-300 hover:text-blue-600 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {searched && !loading && results.length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">
          관련 회의록을 찾지 못했습니다. 다른 키워드로 검색해보세요.
          <p className="text-xs mt-2 text-gray-300">Supabase + pgvector 연동 후 실제 검색이 활성화됩니다.</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((r) => (
            <Link key={r.meetingId} href={`/partners/${r.meetingId}`}>
              <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-900 text-sm">{r.partnerName}</span>
                  <span className="text-xs text-gray-400">{r.meetingDate}</span>
                </div>
                <p className="text-sm text-gray-700 font-medium mb-1">{r.meetingTitle}</p>
                <p className="text-sm text-gray-500 leading-relaxed">{r.summary}</p>
                <div className="mt-2 flex justify-end">
                  <span className="text-xs text-blue-500">유사도 {Math.round(r.similarity * 100)}%</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
