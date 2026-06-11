import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, errorResponse } from '@/lib/rbac';
import {
  getDirectoryList,
  createDirectoryEntry,
  DirectoryDataError,
} from '@/lib/directory-data';
import { trySyncRowToSheet } from '@/lib/sheet-push';
import type { DirectoryInput } from '@/types/accelerating';

// 디렉토리 목록 조회. 관리자 전용 (파트너는 디렉토리 접근 불가).
export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    return errorResponse(e);
  }
  try {
    const items = await getDirectoryList();
    return NextResponse.json({ items });
  } catch (e) {
    if (e instanceof DirectoryDataError) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
    return errorResponse(e);
  }
}

// 신규 파트너사 추가 (기본 status='잠재'). 관리자 전용.
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  let body: DirectoryInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  try {
    const entry = await createDirectoryEntry(body);
    // 저장 성공 후 시트 즉시 반영(best-effort). 실패해도 저장은 유지.
    const sync = await trySyncRowToSheet(entry.id);
    return NextResponse.json({ entry, syncWarning: sync.syncWarning, syncNote: sync.syncNote });
  } catch (e) {
    if (e instanceof DirectoryDataError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return errorResponse(e);
  }
}
