import { MeetingMinutes } from './claude';

// Sheets에 파트너사 정보 행을 추가하거나 업데이트합니다.
export async function upsertPartnerToSheets(
  accessToken: string,
  spreadsheetId: string,
  params: {
    companyName: string;
    country: string;
    contactName: string;
    contactEmail: string;
    category: string;
    grade: string;
    lastMeetingDate: string;
    meetingSummary: string;
    driveUrl: string;
    assignee: string;
  }
): Promise<void> {
  const row = [
    params.companyName,
    params.country,
    params.contactName,
    params.contactEmail,
    params.category,
    params.grade,
    params.lastMeetingDate,
    params.meetingSummary,
    params.driveUrl,
    params.assignee,
    new Date().toISOString(),
  ];

  // 시트 마지막 행에 추가
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/파트너목록!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [row] }),
    }
  );

  if (!res.ok) throw new Error(`Sheets 업데이트 실패: ${res.status}`);
}

export async function ensureSheetHeaders(accessToken: string, spreadsheetId: string): Promise<void> {
  const headers = [
    '파트너사명', '국가', '담당 연락처', '이메일', '카테고리', '등급',
    '최근 미팅일', '회의 요약', 'Drive 링크', '우리 측 담당자', '업데이트 시각',
  ];

  // A1 셀 확인 후 헤더가 없으면 삽입
  const checkRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/파트너목록!A1`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const checkData = await checkRes.json();

  if (!checkData.values) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/파트너목록!A1?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: [headers] }),
      }
    );
  }
}
