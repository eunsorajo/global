import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { saveToDrive } from '@/lib/google-drive';
import { upsertPartnerToSheets, ensureSheetHeaders } from '@/lib/google-sheets';
import { MeetingMinutes } from '@/lib/claude';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const body = await req.json() as {
    title: string;
    date: string;
    partnerId: string;
    partnerName: string;
    partnerCountry: string;
    partnerContact: string;
    partnerEmail: string;
    category: string;
    grade: string;
    assignee: string;
    minutes: MeetingMinutes;
    rawTranscript: string;
    spreadsheetId: string;
    driveFolderId?: string;
  };

  try {
    // 1. Google Drive에 회의록 저장
    const driveUrl = await saveToDrive(session.accessToken, {
      title: body.title,
      date: body.date,
      minutes: body.minutes,
      rawTranscript: body.rawTranscript,
      folderId: body.driveFolderId,
    });

    // 2. Google Sheets 파트너 정보 업데이트 (병렬)
    await ensureSheetHeaders(session.accessToken, body.spreadsheetId);
    await upsertPartnerToSheets(session.accessToken, body.spreadsheetId, {
      companyName: body.partnerName,
      country: body.partnerCountry,
      contactName: body.partnerContact,
      contactEmail: body.partnerEmail,
      category: body.category,
      grade: body.grade,
      lastMeetingDate: body.date,
      meetingSummary: body.minutes.summary,
      driveUrl,
      assignee: body.assignee,
    });

    return NextResponse.json({ driveUrl });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: '저장 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
