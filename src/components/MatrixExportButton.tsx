'use client';

import { useState } from 'react';

// 단일 파트너 KPI 매트릭스 .xlsx 다운로드 버튼.
// /api/kpi/export/[partnerId] 를 fetch → blob 다운로드.
export default function MatrixExportButton({ partnerId }: { partnerId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/kpi/export/${partnerId}`);
      if (!res.ok) {
        let message = '엑셀 내보내기에 실패했습니다.';
        try {
          const data = await res.json();
          if (data?.error) message = data.error;
        } catch {
          /* 응답이 JSON 이 아닐 수 있음 */
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
      const fileName = star ? decodeURIComponent(star[1]) : 'KPI매트릭스.xlsx';

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '엑셀 내보내기에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        onClick={handleExport}
        disabled={loading}
        className="text-sm border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-60 text-gray-700 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
      >
        {loading ? '내보내는 중…' : '엑셀 내보내기'}
      </button>
    </div>
  );
}
