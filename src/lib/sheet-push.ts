// 서버 전용 — 디렉토리 저장(생성/수정) 직후 "시트 즉시 반영(push)" 의 best-effort 래퍼.
//
// 정책:
//   - DB 저장은 이미 성공한 상태에서 호출된다. 시트 쓰기 실패가 저장을 되돌리지 않는다.
//   - 모든 예외를 여기서 swallow → 서버 로그만 남기고 호출부에는 syncWarning 플래그로 알림.
//   - 잠재/협력 행만 시트 연동(syncRowToSheet 내부에서 status 검사). 그 외는 조용히 skip.
import 'server-only';
import { syncRowToSheet, type RowSyncResult } from '@/lib/sheet-sync';

export interface PushOutcome {
  // 시트 동기화에서 경고가 발생했는지(쓰기 실패 등). 저장 자체는 항상 성공.
  syncWarning: boolean;
  // skip/no-diff 등 비치명적 사유 또는 에러 메시지(디버깅용, 응답에 노출 가능).
  syncNote?: string;
}

// id 의 디렉토리 행을 시트에 반영. 절대 throw 하지 않는다.
export async function trySyncRowToSheet(id: string): Promise<PushOutcome> {
  try {
    const r: RowSyncResult = await syncRowToSheet(id);
    if (!r.didWrite && r.reason && r.reason !== 'no-diff') {
      // 정상 skip(미연동 상태/ID열 없음 등) — 경고는 아니지만 노트로 전달.
      return { syncWarning: false, syncNote: r.reason };
    }
    return { syncWarning: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sheet-push] 시트 즉시 반영 실패 (저장은 성공):', id, msg);
    return { syncWarning: true, syncNote: '시트 자동 반영에 실패했습니다. 수동 동기화로 반영하세요.' };
  }
}
