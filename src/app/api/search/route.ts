import { NextRequest, NextResponse } from 'next/server';
import { searchMeetings } from '@/lib/search';

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q');
  if (!query?.trim()) return NextResponse.json({ results: [] });

  try {
    const results = await searchMeetings(query);
    return NextResponse.json({ results });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: '검색 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
