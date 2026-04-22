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

async function fetchCalendarIds(accessToken: string): Promise<string[]> {
  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=50',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return ['primary'];
  const data = await res.json();
  return (data.items ?? []).map((c: { id: string }) => c.id);
}

export async function fetchUpcomingMeetings(
  accessToken: string,
  timeMin?: string,
  timeMax?: string
): Promise<CalendarEvent[]> {
  const now = new Date().toISOString();
  const oneWeekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const calendarIds = await fetchCalendarIds(accessToken);

  const allItems = await Promise.all(
    calendarIds.map(async (calId) => {
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`);
      url.searchParams.set('timeMin', timeMin ?? now);
      url.searchParams.set('timeMax', timeMax ?? oneWeekLater);
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('orderBy', 'startTime');
      url.searchParams.set('maxResults', '100');
      url.searchParams.set('conferenceDataVersion', '1');

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.items ?? [];
    })
  );

  const seen = new Set<string>();
  const items: Record<string, unknown>[] = allItems.flat().filter((item) => {
    const id = item.id as string;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

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
    .filter((e) => e.start); // 모든 일정 표시 (날짜 있는 항목만)
}
