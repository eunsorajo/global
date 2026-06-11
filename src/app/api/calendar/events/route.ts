import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { requireAdmin, errorResponse } from '@/lib/rbac';
import { fetchUpcomingMeetings } from '@/lib/google-calendar';

// 권한: admin 전용 (회의 일정은 내부 운영 메뉴).
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const timeMin = searchParams.get('timeMin') ?? undefined;
  const timeMax = searchParams.get('timeMax') ?? undefined;

  try {
    const events = await fetchUpcomingMeetings(session.accessToken, timeMin, timeMax);
    return NextResponse.json({ events });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: '캘린더 조회 실패' }, { status: 500 });
  }
}
