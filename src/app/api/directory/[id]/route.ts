import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, errorResponse } from '@/lib/rbac';
import {
  updateDirectoryEntry,
  changeDirectoryStatus,
  deleteDirectoryEntry,
  DirectoryDataError,
} from '@/lib/directory-data';
import type { DirectoryInput, DirectoryStatus } from '@/types/accelerating';

const STATUSES: DirectoryStatus[] = ['사업', '협력', '잠재'];

// 디렉토리 수정 또는 상태 변경(승격/강등). 관리자 전용.
//   - body.status 존재: 상태 변경 (사업 승격 시 partners 상세 생성)
//   - 그 외: 정보 수정
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 });

  let body: DirectoryInput & { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  try {
    // 상태 변경 요청
    if (typeof body.status === 'string') {
      if (!STATUSES.includes(body.status as DirectoryStatus)) {
        return NextResponse.json({ error: "status 는 '사업'|'협력'|'잠재' 중 하나여야 합니다." }, { status: 400 });
      }
      const result = await changeDirectoryStatus(id, body.status as DirectoryStatus);
      return NextResponse.json(result);
    }
    // 정보 수정
    const entry = await updateDirectoryEntry(id, body);
    return NextResponse.json({ entry });
  } catch (e) {
    if (e instanceof DirectoryDataError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return errorResponse(e);
  }
}

// 디렉토리 삭제 (사업 연결 항목은 거부). 관리자 전용.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 });

  try {
    await deleteDirectoryEntry(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DirectoryDataError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return errorResponse(e);
  }
}
