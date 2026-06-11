// 서버 전용 회의록(meetings/followups) 데이터 접근 계층.
// 페이지(서버 컴포넌트)와 API 라우트가 공유한다.
import 'server-only';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';
import type {
  MeetingRow,
  FollowupRow,
  MeetingWithFollowups,
  ParsedMeeting,
} from '@/types/meeting';

export class MeetingDataError extends Error {}

// 파트너 목록(매칭/선택용) — id + name 만
export async function getPartnerOptions(): Promise<{ id: string; name: string; country: string }[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('partners')
    .select('id, name, country')
    .order('no', { ascending: true });
  if (error) throw new MeetingDataError(describeSupabaseError(error));
  return (data ?? []) as { id: string; name: string; country: string }[];
}

// 특정 파트너의 회의록 목록 + 팔로업 (최신순)
export async function getMeetingsByPartner(partnerId: string): Promise<MeetingWithFollowups[]> {
  const supabase = getSupabaseAdmin();

  const meetingsRes = await supabase
    .from('meetings')
    .select('*')
    .eq('partner_id', partnerId)
    .order('meeting_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (meetingsRes.error) throw new MeetingDataError(describeSupabaseError(meetingsRes.error));

  const meetings = (meetingsRes.data ?? []) as MeetingRow[];
  if (meetings.length === 0) return [];

  const meetingIds = meetings.map((m) => m.id);
  const fuRes = await supabase
    .from('followups')
    .select('*')
    .in('meeting_id', meetingIds)
    .order('created_at', { ascending: true });
  if (fuRes.error) throw new MeetingDataError(describeSupabaseError(fuRes.error));

  const followupsByMeeting = new Map<string, FollowupRow[]>();
  for (const f of (fuRes.data ?? []) as FollowupRow[]) {
    const arr = followupsByMeeting.get(f.meeting_id) ?? [];
    arr.push(f);
    followupsByMeeting.set(f.meeting_id, arr);
  }

  return meetings.map((m) => ({ ...m, followups: followupsByMeeting.get(m.id) ?? [] }));
}

// 파트너별 최근 회의일 맵 (홈 카드 표시용)
export async function getLatestMeetingDates(): Promise<Map<string, string>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('meetings')
    .select('partner_id, meeting_date')
    .not('meeting_date', 'is', null);
  if (error) throw new MeetingDataError(describeSupabaseError(error));

  const latest = new Map<string, string>();
  for (const row of (data ?? []) as { partner_id: string; meeting_date: string | null }[]) {
    if (!row.meeting_date) continue;
    const cur = latest.get(row.partner_id);
    if (!cur || row.meeting_date > cur) latest.set(row.partner_id, row.meeting_date);
  }
  return latest;
}

// 파싱된 회의록 1건 저장 (meetings + followups insert). 저장된 meeting id 반환.
export async function saveParsedMeeting(
  partnerId: string,
  parsed: Pick<
    ParsedMeeting,
    'meetingDate' | 'title' | 'attendees' | 'summary' | 'keyPoints' | 'decisions' | 'followups' | 'rawNotes'
  >,
): Promise<string> {
  const supabase = getSupabaseAdmin();

  const insertRes = await supabase
    .from('meetings')
    .insert({
      partner_id: partnerId,
      meeting_date: parsed.meetingDate ?? null,
      title: parsed.title,
      attendees: parsed.attendees ?? null,
      summary: parsed.summary ?? null,
      key_points: parsed.keyPoints.length > 0 ? parsed.keyPoints.join('\n') : null,
      decisions: parsed.decisions.length > 0 ? parsed.decisions.join('\n') : null,
      raw_notes: parsed.rawNotes ?? null,
    })
    .select('id')
    .single();
  if (insertRes.error) throw new MeetingDataError(describeSupabaseError(insertRes.error));

  const meetingId = (insertRes.data as { id: string }).id;

  const followupRows = parsed.followups
    .filter((f) => f.content.trim())
    .map((f) => ({
      meeting_id: meetingId,
      content: f.content.trim(),
      assignee: f.assignee ?? null,
      due_date: f.dueDate ?? null,
      status: 'pending' as const,
    }));

  if (followupRows.length > 0) {
    const fuRes = await supabase.from('followups').insert(followupRows);
    if (fuRes.error) throw new MeetingDataError(describeSupabaseError(fuRes.error));
  }

  return meetingId;
}
