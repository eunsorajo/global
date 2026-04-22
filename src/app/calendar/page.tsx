import { auth } from '@/auth';
import { fetchUpcomingMeetings } from '@/lib/google-calendar';
import { redirect } from 'next/navigation';
import Link from 'next/link';

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function MeetingTypeTag({ event }: { event: { meetLink?: string; zoomLink?: string; teamsLink?: string } }) {
  if (event.meetLink) return <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">Google Meet</span>;
  if (event.zoomLink) return <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">Zoom</span>;
  if (event.teamsLink) return <span className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">Teams</span>;
  return null;
}

export default async function CalendarPage() {
  const session = await auth();
  if (!session?.accessToken) redirect('/api/auth/signin');

  const meetings = await fetchUpcomingMeetings(session.accessToken);

  return (
    <main className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">예정된 회의</h1>
          <p className="text-gray-500 text-sm mt-1">향후 7일 · {meetings.length}개 화상 회의</p>
        </div>
      </div>

      {meetings.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-sm">향후 7일간 예정된 화상 회의가 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {meetings.map((meeting) => (
            <div key={meeting.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">{meeting.summary}</h3>
                    <MeetingTypeTag event={meeting} />
                  </div>
                  <p className="text-sm text-gray-500 mb-3">
                    {formatDateTime(meeting.start)} → {formatDateTime(meeting.end)}
                  </p>
                  {meeting.attendees.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {meeting.attendees.slice(0, 5).map((a) => (
                        <span key={a.email} className="text-xs bg-gray-50 border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                          {a.name ?? a.email}
                        </span>
                      ))}
                      {meeting.attendees.length > 5 && (
                        <span className="text-xs text-gray-400">+{meeting.attendees.length - 5}명</span>
                      )}
                    </div>
                  )}
                </div>
                <Link
                  href={`/meetings/new?calendarEventId=${meeting.id}&title=${encodeURIComponent(meeting.summary)}`}
                  className="shrink-0 ml-4 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                >
                  회의록 작성
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
