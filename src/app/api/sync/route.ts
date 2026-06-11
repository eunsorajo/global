// 시트 ↔ DB 동기화 엔드포인트. 관리자 전용 (서버측 requireAdmin 집행).
//
// POST { mode: 'dryrun' | 'pull' | 'push' | 'both', force?: boolean }
//   - dryrun: 쓰기 없이 변경 예정 목록(생성/수정/충돌) 산출 → 반환
//   - pull  : 시트 → DB upsert + ID 열 write-back
//   - push  : DB → 시트 (행/셀 단위)
//   - both  : pull 후 push
//   - force : 대량변경 가드(BULK_LIMIT) 무시. /admin/sync 의 관리자 확인 후에만 전달.
// 결과 JSON + sync_log 기록.
//   - 자동 폴링이 분당 1회 호출하므로, 변경 0건(pull/push/both)은 로그를 남기지 않는다
//     (sync_log noop 도배 방지 — 실제 변경 이력만 보존).
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, errorResponse } from '@/lib/rbac';
import {
  buildPlan,
  applyPull,
  applyPush,
  writeSyncLog,
  SyncError,
  SheetsError,
} from '@/lib/sheet-sync';

export const dynamic = 'force-dynamic';
// 전체 동기화는 시트 읽기 + 행 단위 쓰기가 누적되므로 Hobby 기본 10초보다 여유를 둔다.
export const maxDuration = 60;

type Mode = 'dryrun' | 'pull' | 'push' | 'both';
const VALID_MODES: Mode[] = ['dryrun', 'pull', 'push', 'both'];

export async function POST(req: NextRequest) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  let mode: Mode;
  let force = false;
  try {
    const body = (await req.json()) as { mode?: string; force?: boolean };
    if (!body.mode || !VALID_MODES.includes(body.mode as Mode)) {
      return NextResponse.json(
        { error: "mode 는 'dryrun' | 'pull' | 'push' | 'both' 중 하나여야 합니다." },
        { status: 400 },
      );
    }
    mode = body.mode as Mode;
    force = body.force === true;
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  try {
    if (mode === 'dryrun') {
      const plan = await buildPlan();
      // dry-run 도 이력 남김 (쓰기 없음)
      await writeSyncLog({
        runBy: admin.email,
        direction: 'dryrun',
        created: plan.pull.createdCount,
        updated: plan.pull.updatedCount + plan.push.updatedCount,
        conflicts: plan.pull.conflictCount,
        details: {
          pull: plan.pull.rows.filter((r) => r.action !== 'noop'),
          push: plan.push.rows,
          needsIdColumn: plan.pull.needsIdColumn,
        },
      });
      return NextResponse.json({ mode, plan });
    }

    if (mode === 'pull') {
      const result = await applyPull({ force });
      // 변경 0건(가드 보류 포함)은 로그 생략 — 폴링 noop 도배 방지.
      if (result.created + result.updated + result.conflicts.length > 0) {
        await writeSyncLog({
          runBy: admin.email,
          direction: 'pull',
          created: result.created,
          updated: result.updated,
          conflicts: result.conflicts.length,
          details: result.details,
        });
      }
      return NextResponse.json({ mode, result });
    }

    if (mode === 'push') {
      const result = await applyPush({ force });
      if (result.updated + result.conflicts.length > 0) {
        await writeSyncLog({
          runBy: admin.email,
          direction: 'push',
          created: 0,
          updated: result.updated,
          conflicts: result.conflicts.length,
          details: result.details,
        });
      }
      return NextResponse.json({ mode, result });
    }

    // both: pull → push.
    // pull 이 대량변경 가드에 걸리면 push 도 진행하지 않고 즉시 확인 요청을 반환한다
    // (pull 보류 상태에서 push 만 적용되면 시트/DB 가 어긋난 채 baseline 이 갱신될 수 있음).
    const pull = await applyPull({ force });
    if (pull.needsConfirmation) {
      return NextResponse.json({ mode, result: { pull, push: null } });
    }
    const push = await applyPush({ force });
    const merged = {
      created: pull.created,
      updated: pull.updated + push.updated,
      conflicts: [...pull.conflicts, ...push.conflicts],
    };
    if (merged.created + merged.updated + merged.conflicts.length > 0) {
      await writeSyncLog({
        runBy: admin.email,
        direction: 'both',
        created: merged.created,
        updated: merged.updated,
        conflicts: merged.conflicts.length,
        details: { pull: pull.details, push: push.details },
      });
    }
    return NextResponse.json({ mode, result: { pull, push } });
  } catch (e) {
    if (e instanceof SyncError || e instanceof SheetsError) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
    return errorResponse(e);
  }
}
