'use client';

import { useState } from 'react';

// KPI/회의록 현황 .xlsx 다운로드 버튼.
// /api/kpi/export 를 fetch → blob 으로 받아 브라우저 다운로드 트리거.
export default function KpiExportButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/kpi/export');
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
      // 파일명: Content-Disposition 의 filename*(UTF-8) 우선, 없으면 기본값.
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
      const fileName = star ? decodeURIComponent(star[1]) : 'KPI현황.xlsx';

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
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleExport}
        disabled={loading}
        className="text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
      >
        {loading ? '내보내는 중…' : '엑셀 내보내기'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
