// 시트 ↔ DB 동기화 엔드포인트. 관리자 전용 (서버측 requireAdmin 집행).
//
// POST { mode: 'dryrun' | 'pull' | 'push' | 'both' }
//   - dryrun: 쓰기 없이 변경 예정 목록(생성/수정/충돌) 산출 → 반환
//   - pull  : 시트 → DB upsert + ID 열 write-back
//   - push  : DB → 시트 (행/셀 단위)
//   - both  : pull 후 push
// 결과 JSON + sync_log 기록.
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
  try {
    const body = (await req.json()) as { mode?: string };
    if (!body.mode || !VALID_MODES.includes(body.mode as Mode)) {
      return NextResponse.json(
        { error: "mode 는 'dryrun' | 'pull' | 'push' | 'both' 중 하나여야 합니다." },
        { status: 400 },
      );
    }
    mode = body.mode as Mode;
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
      const result = await applyPull();
      await writeSyncLog({
        runBy: admin.email,
        direction: 'pull',
        created: result.created,
        updated: result.updated,
        conflicts: result.conflicts.length,
        details: result.details,
      });
      return NextResponse.json({ mode, result });
    }

    if (mode === 'push') {
      const result = await applyPush();
      await writeSyncLog({
        runBy: admin.email,
        direction: 'push',
        created: 0,
        updated: result.updated,
        conflicts: result.conflicts.length,
        details: result.details,
      });
      return NextResponse.json({ mode, result });
    }

    // both: pull → push
    const pull = await applyPull();
    const push = await applyPush();
    const merged = {
      created: pull.created,
      updated: pull.updated + push.updated,
      conflicts: [...pull.conflicts, ...push.conflicts],
    };
    await writeSyncLog({
      runBy: admin.email,
      direction: 'both',
      created: merged.created,
      updated: merged.updated,
      conflicts: merged.conflicts.length,
      details: { pull: pull.details, push: push.details },
    });
    return NextResponse.json({ mode, result: { pull, push } });
  } catch (e) {
    if (e instanceof SyncError || e instanceof SheetsError) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
    return errorResponse(e);
  }
}
