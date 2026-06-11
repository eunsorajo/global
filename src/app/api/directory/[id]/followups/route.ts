import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, errorResponse } from '@/lib/rbac';
import {
  getDirectoryFollowups,
  createDirectoryFollowup,
  DirectoryDataError,
} from '@/lib/directory-data';

// 디렉토리(협력/잠재 파트너) 팔로업 목록/생성.
// 권한: admin 전용 (디렉토리 CRM 은 내부 운영 메뉴).

// GET: 해당 파트너의 팔로업 목록
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 });

  try {
    const followups = await getDirectoryFollowups(id);
    return NextResponse.json({ followups });
  } catch (e) {
    if (e instanceof DirectoryDataError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error('[GET /api/directory/[id]/followups]', e);
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

// POST: 팔로업 추가 (content 필수, assignee/due_date 선택, status 기본 pending)
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 });

  let body: { content?: string; assignee?: string | null; due_date?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  try {
    const followup = await createDirectoryFollowup(id, {
      content: body.content ?? '',
      assignee: body.assignee ?? null,
      due_date: body.due_date ?? null,
    });
    return NextResponse.json({ followup }, { status: 201 });
  } catch (e) {
    if (e instanceof DirectoryDataError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error('[POST /api/directory/[id]/followups]', e);
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
