import { NextRequest, NextResponse } from 'next/server';
import { generatePostMeetingInsights } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  try {
    const { newMeetingPartner, allPartners } = await req.json();
    const insights = await generatePostMeetingInsights(newMeetingPartner, allPartners);
    return NextResponse.json({ insights });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: '인사이트 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
