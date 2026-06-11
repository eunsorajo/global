import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, errorResponse } from '@/lib/rbac';
import { getMeetingsByPartner, saveParsedMeeting, MeetingDataError } from '@/lib/meeting-data';
import type { ParsedFollowup } from '@/types/meeting';

// GET: 파트너별 회의록 목록 (?partnerId=)
// 권한: admin 전용 (회의록은 내부 운영 메뉴).
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const partnerId = req.nextUrl.searchParams.get('partnerId');
  if (!partnerId) {
    return NextResponse.json({ error: 'partnerId 가 필요합니다.' }, { status: 400 });
  }

  try {
    const meetings = await getMeetingsByPartner(partnerId);
    return NextResponse.json({ meetings });
  } catch (e) {
    const message = e instanceof MeetingDataError ? e.message : '회의록을 불러오지 못했습니다.';
    if (!(e instanceof MeetingDataError)) console.error('[GET /api/meetings]', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface SaveBody {
  partnerId?: string;
  meetingDate?: string | null;
  title?: string;
  attendees?: string | null;
  summary?: string | null;
  keyPoints?: string[];
  decisions?: string[];
  followups?: ParsedFollowup[];
  rawNotes?: string | null;
}

// POST: 파싱·확정된 회의록 저장
// 권한: admin 전용.
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  let body: SaveBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  if (!body.partnerId || typeof body.partnerId !== 'string') {
    return NextResponse.json({ error: '파트너를 선택해주세요.' }, { status: 400 });
  }
  const title = (body.title ?? '').trim();
  if (!title) {
    return NextResponse.json({ error: '제목은 필수입니다.' }, { status: 400 });
  }

  const keyPoints = Array.isArray(body.keyPoints) ? body.keyPoints.filter((s) => typeof s === 'string') : [];
  const decisions = Array.isArray(body.decisions) ? body.decisions.filter((s) => typeof s === 'string') : [];
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
    const meetingId = await saveParsedMeeting(body.partnerId, {
      meetingDate: body.meetingDate ?? null,
      title,
      attendees: body.attendees ?? null,
      summary: body.summary ?? null,
      keyPoints,
      decisions,
      followups,
      rawNotes: body.rawNotes ?? null,
    });
    return NextResponse.json({ id: meetingId });
  } catch (e) {
    const message = e instanceof MeetingDataError ? e.message : '회의록 저장에 실패했습니다.';
    if (!(e instanceof MeetingDataError)) console.error('[POST /api/meetings]', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
