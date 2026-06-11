'use client';

// 관리자 전용 시트→대시보드 자동 동기화(pull) 폴러.
//
// 동작:
//   - 60초마다 /api/sync (mode:'pull') 를 조용히 호출.
//   - 변경(created/updated > 0)이 있으면 router.refresh() 로 목록 갱신.
//   - 충돌은 최신 우선 자동 적용 + 이전 값 sync_backup 백업 (008 정책).
//   - 대량변경 가드(BULK_LIMIT 초과) 발동 시 자동 적용하지 않고
//     "확인 필요" 배지를 띄워 /admin/sync 수동 확인으로 유도한다.
// 과다 호출 방지:
//   - 탭이 백그라운드(document.hidden)면 폴링 일시중지.
//   - 직전 호출이 진행 중이면 이번 주기는 스킵.
//   - on/off 토글(기본 on). 끄면 폴링 중지.
//
// 보안: 이 컴포넌트는 / 페이지(서버에서 admin 확정) 에서만 렌더된다.
//   추가로 /api/sync 자체가 requireAdmin 로 보호되므로 비관리자 호출은 서버가 차단한다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const POLL_INTERVAL_MS = 60_000;

interface PullResult {
  created: number;
  updated: number;
  conflicts: unknown[];
  needsConfirmation?: boolean;
  plannedChanges?: number;
}

export default function SheetPullPoller() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [secondsAgo, setSecondsAgo] = useState<number | null>(null);
  const [status, setStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  // 대량변경 가드 발동(자동 적용 보류) — /admin/sync 에서 확인 필요.
  const [blockedChanges, setBlockedChanges] = useState<number | null>(null);

  // 진행 중 플래그(중복 호출 방지) — 리렌더 영향 없이 즉시 읽기 위해 ref.
  const inFlightRef = useRef(false);

  const pollOnce = useCallback(async () => {
    if (inFlightRef.current) return; // 직전 호출 진행 중 → 스킵
    if (typeof document !== 'undefined' && document.hidden) return; // 백그라운드 탭 → 일시중지
    inFlightRef.current = true;
    setStatus('syncing');
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'pull' }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        result?: PullResult;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'pull 실패');
      const r = data.result;
      setLastSyncAt(Date.now());
      setStatus('idle');
      // 대량변경 가드 발동 → 자동 적용 보류 상태를 사용자에게 표시.
      setBlockedChanges(r?.needsConfirmation ? (r.plannedChanges ?? 0) : null);
      // 변경이 있으면 서버 컴포넌트 데이터 갱신.
      if (r && (r.created > 0 || r.updated > 0)) {
        router.refresh();
      }
    } catch (e) {
      // 폴링 실패는 조용히 — 다음 주기에 재시도. 콘솔만.
      console.warn('[sheet-poller] pull 실패:', e instanceof Error ? e.message : e);
      setStatus('error');
    } finally {
      inFlightRef.current = false;
    }
  }, [router]);

  // 폴링 타이머: enabled 일 때만 동작. 탭 복귀 시 즉시 1회.
  useEffect(() => {
    if (!enabled) return;
    // 마운트/활성화 직후 1회는 돌리지 않는다(초기 SSR 데이터가 최신). 첫 호출은 한 주기 뒤.
    const timer = setInterval(pollOnce, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) pollOnce();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, pollOnce]);

  // "N초 전" 표시 갱신(1초 틱).
  useEffect(() => {
    if (lastSyncAt == null) return;
    const tick = () => setSecondsAgo(Math.floor((Date.now() - lastSyncAt) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [lastSyncAt]);

  const dotClass =
    status === 'error'
      ? 'bg-red-400'
      : status === 'syncing'
        ? 'bg-blue-400 animate-pulse'
        : enabled
          ? 'bg-emerald-400'
          : 'bg-gray-300';

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
      <span className={`inline-block w-2 h-2 rounded-full ${dotClass}`} aria-hidden />
      <span>
        시트 자동 동기화{' '}
        {enabled ? (
          status === 'error' ? (
            <span className="text-red-500">· 일시 오류(재시도 예정)</span>
          ) : lastSyncAt != null ? (
            <span>· {secondsAgo ?? 0}초 전 갱신</span>
          ) : (
            <span>· 대기 중</span>
          )
        ) : (
          <span className="text-gray-400">· 꺼짐</span>
        )}
      </span>
      {blockedChanges != null && (
        <a
          href="/admin/sync"
          className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-700 font-medium hover:bg-amber-100"
        >
          ⚠ 대량 변경 {blockedChanges}건 보류 — 동기화 관리에서 확인
        </a>
      )}
      <button
        type="button"
        onClick={() => setEnabled((v) => !v)}
        className={`ml-1 rounded-full px-2 py-0.5 border whitespace-nowrap transition-colors ${
          enabled
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
        }`}
        aria-pressed={enabled}
      >
        {enabled ? '끄기' : '켜기'}
      </button>
    </div>
  );
}
