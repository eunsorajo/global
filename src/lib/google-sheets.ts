import { getServiceAccountToken } from './google-auth';

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID!;

async function sheetsRequest(path: string, options?: RequestInit) {
  const token = await getServiceAccountToken();
  return fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });
}

export async function upsertPartnerToSheets(params: {
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
}): Promise<void> {
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

  const res = await sheetsRequest(
    `/values/파트너목록!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: [row] }) }
  );

  if (!res.ok) throw new Error(`Sheets 업데이트 실패: ${res.status}`);
}

export async function ensureSheetHeaders(): Promise<void> {
  const headers = [
    '파트너사명', '국가', '담당 연락처', '이메일', '카테고리', '등급',
    '최근 미팅일', '회의 요약', 'Drive 링크', '우리 측 담당자', '업데이트 시각',
  ];

  const checkRes = await sheetsRequest(`/values/파트너목록!A1`);
  const checkData = await checkRes.json();

  if (!checkData.values) {
    await sheetsRequest(
      `/values/파트너목록!A1?valueInputOption=USER_ENTERED`,
      { method: 'PUT', body: JSON.stringify({ values: [headers] }) }
    );
  }
}
