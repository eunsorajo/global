import { getServiceAccountToken } from './google-auth';
import { MeetingMinutes } from './claude';

const PROJECT_ID = 'western-will-493410-j8';
const LOCATION = 'asia-northeast3'; // 서울 리전
const MODEL = 'gemini-2.0-flash-001';

const ENDPOINT = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;

const MINUTES_PROMPT = `
당신은 글로벌 파트너십 전담 회의록 작성 AI입니다.
위 내용을 분석하여 아래 JSON 형식으로 정확하게 회의록을 작성하세요.

{
  "summary": "회의 전체 내용 3~5문장 요약",
  "keyPoints": ["핵심 논의 사항 최대 5개"],
  "collaborationTopics": ["협업/파트너십 관련 논의 내용"],
  "followUps": [
    { "content": "할 일", "assignee": "담당자명 또는 null", "dueDate": "YYYY-MM-DD 또는 null" }
  ],
  "partnerInfo": { "companyName": "회사명", "contactName": "담당자명", "country": "국가" }
}

응답은 반드시 유효한 JSON만 반환하세요.`;

async function callGemini(parts: object[]): Promise<string> {
  const token = await getServiceAccountToken([
    'https://www.googleapis.com/auth/cloud-platform',
  ]);

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API 오류: ${res.status} — ${err}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

function parseMinutes(text: string): MeetingMinutes {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('회의록 JSON 파싱 실패');
  return JSON.parse(match[0]) as MeetingMinutes;
}

// 오디오 파일 → 트랜스크립션 + 회의록 (한 번에)
export async function processAudioToMinutes(
  audioBuffer: Buffer,
  mimeType: string
): Promise<{ transcript: string; minutes: MeetingMinutes }> {
  const base64Audio = audioBuffer.toString('base64');

  const text = await callGemini([
    {
      inline_data: { mime_type: mimeType, data: base64Audio },
    },
    {
      text: `먼저 이 오디오를 한국어로 완전히 트랜스크립션하세요.
그런 다음 트랜스크립션 내용을 바탕으로 회의록 JSON을 작성하세요.

응답 형식:
[TRANSCRIPT]
(전체 트랜스크립션 내용)
[MINUTES]
(회의록 JSON)
${MINUTES_PROMPT}`,
    },
  ]);

  const transcriptMatch = text.match(/\[TRANSCRIPT\]([\s\S]*?)\[MINUTES\]/);
  const transcript = transcriptMatch?.[1]?.trim() ?? text;

  const minutesMatch = text.match(/\[MINUTES\]([\s\S]*)/);
  const minutesText = minutesMatch?.[1]?.trim() ?? text;

  return { transcript, minutes: parseMinutes(minutesText) };
}

// 트랜스크립트 텍스트 → 회의록 (텍스트 입력 모드)
export async function generateMinutesFromText(transcript: string): Promise<MeetingMinutes> {
  const text = await callGemini([
    { text: `다음 회의 트랜스크립트를 분석하여 회의록을 작성해주세요:\n\n${transcript}\n\n${MINUTES_PROMPT}` },
  ]);
  return parseMinutes(text);
}
