'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { CalendarEvent } from '@/lib/google-calendar';

type ViewMode = 'month' | 'week';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getMeetTag(event: CalendarEvent) {
  if (event.meetLink) return { label: 'Meet', color: 'bg-green-500' };
  if (event.zoomLink) return { label: 'Zoom', color: 'bg-blue-500' };
  if (event.teamsLink) return { label: 'Teams', color: 'bg-purple-500' };
  return { label: '', color: 'bg-gray-400' };
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function CalendarView() {
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [current, setCurrent] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const fetchEvents = useCallback(async (start: Date, end: Date) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/calendar/events?timeMin=${start.toISOString()}&timeMax=${end.toISOString()}`
      );
      const data = await res.json();
      setEvents(data.events ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === 'month') {
      const start = startOfMonth(current);
      const end = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      fetchEvents(start, end);
    } else {
      const start = startOfWeek(current);
      const end = addDays(start, 7);
      fetchEvents(start, end);
    }
  }, [current, viewMode, fetchEvents]);

  function navigate(dir: number) {
    setCurrent(prev => {
      const d = new Date(prev);
      if (viewMode === 'month') {
        d.setMonth(d.getMonth() + dir);
        d.setDate(1);
      } else {
        d.setDate(d.getDate() + dir * 7);
      }
      return d;
    });
  }

  function goToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setCurrent(d);
  }

  function eventsOnDay(day: Date) {
    return events.filter(e => isSameDay(new Date(e.start), day));
  }

  const title = viewMode === 'month'
    ? current.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })
    : (() => {
        const ws = startOfWeek(current);
        const we = addDays(ws, 6);
        return `${ws.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} – ${we.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}`;
      })();

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={goToday} className="text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
            오늘
          </button>
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button onClick={() => navigate(1)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
          <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
          {loading && <span className="text-xs text-gray-400 ml-2">불러오는 중...</span>}
        </div>

        <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
          <button
            onClick={() => setViewMode('month')}
            className={`text-sm px-3 py-1.5 rounded-md transition-colors ${viewMode === 'month' ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            월
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={`text-sm px-3 py-1.5 rounded-md transition-colors ${viewMode === 'week' ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            주
          </button>
        </div>
      </div>

      {/* 월별 뷰 */}
      {viewMode === 'month' && <MonthView current={current} events={events} onSelectEvent={setSelectedEvent} />}

      {/* 주별 뷰 */}
      {viewMode === 'week' && <WeekView current={current} events={events} onSelectEvent={setSelectedEvent} />}

      {/* 이벤트 상세 모달 */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setSelectedEvent(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${getMeetTag(selectedEvent).color}`} />
                <span className="text-xs text-gray-500">{getMeetTag(selectedEvent).label}</span>
              </div>
              <button onClick={() => setSelectedEvent(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{selectedEvent.summary}</h3>
            <p className="text-sm text-gray-500 mb-4">
              {new Date(selectedEvent.start).toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })}
              {' – '}
              {formatTime(selectedEvent.end)}
            </p>
            {selectedEvent.attendees.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-gray-400 mb-1">참석자</p>
                <div className="flex flex-wrap gap-1">
                  {selectedEvent.attendees.map(a => (
                    <span key={a.email} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{a.name ?? a.email}</span>
                  ))}
                </div>
              </div>
            )}
            <Link
              href={`/meetings/new?calendarEventId=${selectedEvent.id}&title=${encodeURIComponent(selectedEvent.summary)}`}
              className="block text-center bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
            >
              회의록 작성
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function MonthView({ current, events, onSelectEvent }: {
  current: Date;
  events: CalendarEvent[];
  onSelectEvent: (e: CalendarEvent) => void;
}) {
  const today = new Date();
  const year = current.getFullYear();
  const month = current.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  const cells: { date: Date; isCurrentMonth: boolean }[] = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, daysInPrev - i), isCurrentMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), isCurrentMonth: true });
  }
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ date: new Date(year, month + 1, d), isCurrentMonth: false });
  }

  return (
    <div className="flex-1 border border-gray-200 rounded-xl overflow-hidden bg-white">
      <div className="grid grid-cols-7 border-b border-gray-200">
        {WEEKDAYS.map((d, i) => (
          <div key={d} className={`text-center text-xs font-medium py-2 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6 flex-1" style={{ minHeight: '500px' }}>
        {cells.map(({ date, isCurrentMonth }, idx) => {
          const dayEvents = events.filter(e => isSameDay(new Date(e.start), date));
          const isToday = isSameDay(date, today);
          const isSun = date.getDay() === 0;
          const isSat = date.getDay() === 6;

          return (
            <div
              key={idx}
              className={`border-b border-r border-gray-100 p-1 min-h-[90px] ${!isCurrentMonth ? 'bg-gray-50' : ''}`}
            >
              <div className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                isToday ? 'bg-blue-600 text-white' :
                !isCurrentMonth ? 'text-gray-300' :
                isSun ? 'text-red-500' :
                isSat ? 'text-blue-500' : 'text-gray-700'
              }`}>
                {date.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map(ev => {
                  const tag = getMeetTag(ev);
                  return (
                    <button
                      key={ev.id}
                      onClick={() => onSelectEvent(ev)}
                      className={`w-full text-left text-xs text-white px-1.5 py-0.5 rounded truncate ${tag.color} hover:opacity-90 transition-opacity`}
                    >
                      {formatTime(ev.start)} {ev.summary}
                    </button>
                  );
                })}
                {dayEvents.length > 3 && (
                  <p className="text-xs text-gray-400 pl-1">+{dayEvents.length - 3}개</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ current, events, onSelectEvent }: {
  current: Date;
  events: CalendarEvent[];
  onSelectEvent: (e: CalendarEvent) => void;
}) {
  const today = new Date();
  const weekStart = startOfWeek(current);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="flex-1 border border-gray-200 rounded-xl overflow-auto bg-white">
      {/* 요일 헤더 */}
      <div className="grid sticky top-0 bg-white z-10 border-b border-gray-200" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
        <div className="border-r border-gray-100" />
        {days.map((day, i) => {
          const isToday = isSameDay(day, today);
          return (
            <div key={i} className="text-center py-2 border-r border-gray-100 last:border-r-0">
              <div className={`text-xs ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'}`}>
                {WEEKDAYS[i]}
              </div>
              <div className={`text-sm font-semibold w-8 h-8 flex items-center justify-center rounded-full mx-auto mt-0.5 ${isToday ? 'bg-blue-600 text-white' : 'text-gray-800'}`}>
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* 시간 그리드 */}
      <div className="relative" style={{ height: `${24 * 48}px` }}>
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
          {/* 시간 레이블 */}
          <div className="relative border-r border-gray-100">
            {HOURS.map(h => (
              <div key={h} className="absolute w-full text-right pr-2" style={{ top: `${h * 48}px`, height: '48px' }}>
                <span className="text-xs text-gray-400 leading-none">{h === 0 ? '' : `${h}시`}</span>
              </div>
            ))}
          </div>

          {/* 날짜 열 */}
          {days.map((day, di) => {
            const dayEvents = events.filter(e => isSameDay(new Date(e.start), day));
            return (
              <div key={di} className="relative border-r border-gray-100 last:border-r-0">
                {HOURS.map(h => (
                  <div key={h} className="absolute w-full border-b border-gray-50" style={{ top: `${h * 48}px`, height: '48px' }} />
                ))}
                {dayEvents.map(ev => {
                  const start = new Date(ev.start);
                  const end = new Date(ev.end);
                  const top = (start.getHours() + start.getMinutes() / 60) * 48;
                  const height = Math.max(((end.getTime() - start.getTime()) / 3600000) * 48, 20);
                  const tag = getMeetTag(ev);
                  return (
                    <button
                      key={ev.id}
                      onClick={() => onSelectEvent(ev)}
                      className={`absolute left-0.5 right-0.5 ${tag.color} text-white text-xs rounded p-1 text-left overflow-hidden hover:opacity-90 transition-opacity`}
                      style={{ top: `${top}px`, height: `${height}px` }}
                    >
                      <div className="font-medium truncate">{ev.summary}</div>
                      <div className="opacity-80">{formatTime(ev.start)}</div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
