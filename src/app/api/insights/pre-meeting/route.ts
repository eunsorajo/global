import { NextRequest, NextResponse } from 'next/server';
import { generatePreMeetingBriefing } from '@/lib/partner-insights';

export async function POST(req: NextRequest) {
  try {
    const { upcomingPartner, pastPartners } = await req.json();
    const insights = await generatePreMeetingBriefing(upcomingPartner, pastPartners);
    return NextResponse.json({ insights });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: '브리핑 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
