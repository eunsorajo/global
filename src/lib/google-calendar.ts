export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  meetLink?: string;
  zoomLink?: string;
  teamsLink?: string;
  attendees: { email: string; name?: string }[];
  description?: string;
}

const MEETING_LINK_PATTERNS = {
  meet: /https:\/\/meet\.google\.com\/[a-z-]+/,
  zoom: /https:\/\/[a-z0-9]+\.zoom\.us\/j\/[0-9]+/,
  teams: /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s"]+/,
};

function extractMeetingLinks(event: Record<string, unknown>) {
  const text = [
    (event.description as string) ?? '',
    JSON.stringify(event.conferenceData ?? {}),
  ].join(' ');

  return {
    meetLink: text.match(MEETING_LINK_PATTERNS.meet)?.[0],
    zoomLink: text.match(MEETING_LINK_PATTERNS.zoom)?.[0],
    teamsLink: text.match(MEETING_LINK_PATTERNS.teams)?.[0],
  };
}

export async function fetchUpcomingMeetings(accessToken: string): Promise<CalendarEvent[]> {
  const now = new Date().toISOString();
  const oneWeekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin', now);
  url.searchParams.set('timeMax', oneWeekLater);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '20');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 300 }, // 5분 캐시
  });

  if (!res.ok) throw new Error(`Calendar API 오류: ${res.status}`);

  const data = await res.json();
  const items: Record<string, unknown>[] = data.items ?? [];

  // Google Meet, Zoom, Teams 링크가 있는 회의만 필터링
  return items
    .map((item) => {
      const links = extractMeetingLinks(item);
      const startTime = (item.start as Record<string, string>)?.dateTime ?? (item.start as Record<string, string>)?.date ?? '';
      const endTime = (item.end as Record<string, string>)?.dateTime ?? (item.end as Record<string, string>)?.date ?? '';
      const attendees = ((item.attendees as Record<string, string>[]) ?? []).map((a) => ({
        email: a.email,
        name: a.displayName,
      }));

      return {
        id: item.id as string,
        summary: (item.summary as string) ?? '(제목 없음)',
        start: startTime,
        end: endTime,
        description: item.description as string | undefined,
        attendees,
        ...links,
      };
    })
    .filter((e) => e.meetLink || e.zoomLink || e.teamsLink);
}
