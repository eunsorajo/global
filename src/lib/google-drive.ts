import { MeetingMinutes } from '@/types/meeting';
import { getServiceAccountToken } from './google-auth';

function formatMinutesAsText(
  title: string,
  date: string,
  minutes: MeetingMinutes,
  rawTranscript: string
): string {
  const lines = [
    `# 회의록 — ${title}`,
    `날짜: ${date}`,
    `파트너사: ${minutes.partnerInfo.companyName ?? '-'}`,
    `담당자: ${minutes.partnerInfo.contactName ?? '-'}`,
    '',
    '## 회의 요약',
    minutes.summary,
    '',
    '## 핵심 논의 사항',
    ...minutes.keyPoints.map((p) => `- ${p}`),
    '',
    '## 협업 논의 내용',
    ...minutes.collaborationTopics.map((t) => `- ${t}`),
    '',
    '## 팔로업 항목',
    ...minutes.followUps.map(
      (f) => `- [ ] ${f.content}${f.assignee ? ` (담당: ${f.assignee})` : ''}${f.dueDate ? ` — ${f.dueDate}` : ''}`
    ),
    '',
    '---',
    '## 원본 트랜스크립트',
    rawTranscript,
  ];

  return lines.join('\n');
}

export async function saveToDrive(params: {
  title: string;
  date: string;
  minutes: MeetingMinutes;
  rawTranscript: string;
  folderId?: string;
}): Promise<string> {
  const accessToken = await getServiceAccountToken();
  const content = formatMinutesAsText(params.title, params.date, params.minutes, params.rawTranscript);
  const folderId = params.folderId ?? process.env.GOOGLE_DRIVE_FOLDER_ID;
  const fileName = `[회의록] ${params.title} (${params.date}).md`;

  const metadata = {
    name: fileName,
    mimeType: 'text/plain',
    ...(folderId ? { parents: [folderId] } : {}),
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([content], { type: 'text/plain' }));

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  if (!res.ok) throw new Error(`Drive 저장 실패: ${res.status}`);

  const file = await res.json();
  return `https://drive.google.com/file/d/${file.id}/view`;
}
