import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, errorResponse } from '@/lib/rbac';
import { rollbackBackup } from '@/lib/sheet-sync';

// 동기화 백업(sync_backup) 한 건을 되돌린다. 관리자 전용.
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  let body: { backupId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }
  if (!body.backupId) {
    return NextResponse.json({ error: 'backupId 는 필수입니다.' }, { status: 400 });
  }

  try {
    const result = await rollbackBackup(body.backupId);
    if (!result.ok) {
      const status = result.reason === 'already-restored' ? 409 : result.reason === 'not-found' ? 404 : 400;
      return NextResponse.json({ error: result.reason }, { status });
    }
    return NextResponse.json({ ok: true, sheetSynced: result.sheetSynced ?? false });
  } catch (e) {
    return errorResponse(e);
  }
}
