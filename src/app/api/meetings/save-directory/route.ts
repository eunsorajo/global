import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, errorResponse } from '@/lib/rbac';
import {
  createDirectoryEntry,
  saveMeetingNoteToDirectory,
  DirectoryDataError,
} from '@/lib/directory-data';
import { trySyncRowToSheet } from '@/lib/sheet-push';
import type { ParsedFollowup } from '@/types/meeting';

// POST: 회의록 내용을 협력/잠재 파트너(partner_directory) 기록에 저장.
//   - directoryId 지정: 기존 협력/잠재 파트너의 메모·향후계획·최근접촉일·팔로업에 반영
//   - createNew 지정: 신규 잠재 파트너로 등록 후 동일하게 반영 (회의록에서 신규 거래처 감지 흐름)
// meetings 테이블은 사업 파트너 전용이므로, 협력/잠재 단계의 회의 기록은 CRM 필드로 보존한다.
// 권한: admin 전용.

interface SaveDirectoryBody {
  directoryId?: string;
  createNew?: { name?: string; country?: string | null; sector?: string | null };
  meetingDate?: string | null;
  title?: string;
  attendees?: string | null;
  summary?: string | null;
  keyPoints?: string[];
  decisions?: string[];
  followups?: ParsedFollowup[];
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  let body: SaveDirectoryBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const title = (body.title ?? '').trim();
  if (!title) {
    return NextResponse.json({ error: '제목은 필수입니다.' }, { status: 400 });
  }
  if (!body.directoryId && !body.createNew?.name?.trim()) {
    return NextResponse.json(
      { error: 'directoryId 또는 createNew.name 중 하나가 필요합니다.' },
      { status: 400 },
    );
  }

  const meetingDate =
    typeof body.meetingDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.meetingDate)
      ? body.meetingDate
      : null;
  const keyPoints = Array.isArray(body.keyPoints)
    ? body.keyPoints.filter((s) => typeof s === 'string' && s.trim())
    : [];
  const decisions = Array.isArray(body.decisions)
    ? body.decisions.filter((s) => typeof s === 'string' && s.trim())
    : [];
  const followups: ParsedFollowup[] = Array.isArray(body.followups)
    ? body.followups
        .filter((f) => f && typeof f.content === 'string' && f.content.trim())
        .map((f) => ({
          content: String(f.content).trim(),
          assignee: f.assignee ? String(f.assignee) : null,
          dueDate: f.dueDate ? String(f.dueDate) : null,
        }))
    : [];

  try {
    let directoryId = body.directoryId ?? null;
    let created = false;

    if (!directoryId) {
      // 신규 잠재 파트너 등록 (발굴 경위 = 회의록 자동 등록 흔적)
      const entry = await createDirectoryEntry({
        name: body.createNew!.name!.trim(),
        country: body.createNew?.country?.trim() || null,
        sector: body.createNew?.sector?.trim() || null,
        discovery_note: `회의록 가져오기에서 신규 등록 (${meetingDate ?? '날짜 미상'} · ${title})`,
        last_contact_date: meetingDate,
      });
      directoryId = entry.id;
      created = true;
    }

    await saveMeetingNoteToDirectory(directoryId, {
      meetingDate,
      title,
      attendees: body.attendees ?? null,
      summary: body.summary ?? null,
      keyPoints,
      decisions,
      followups: followups.map((f) => ({
        content: f.content,
        assignee: f.assignee ?? null,
        dueDate: f.dueDate ?? null,
      })),
    });

    // 시트 즉시 반영 (best-effort — 실패해도 저장은 유지)
    const sync = await trySyncRowToSheet(directoryId);

    return NextResponse.json({
      directoryId,
      created,
      syncWarning: sync.syncWarning,
      syncNote: sync.syncNote ?? null,
    });
  } catch (e) {
    const message = e instanceof DirectoryDataError ? e.message : '저장에 실패했습니다.';
    if (!(e instanceof DirectoryDataError)) console.error('[POST /api/meetings/save-directory]', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
