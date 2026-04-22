import { getServiceAccountToken } from './google-auth';
import { MeetingMinutes, PartnerInsight, PartnerContext } from '@/types/meeting';

const PROJECT_ID = 'western-will-493410-j8';
const LOCATION = 'global';
const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;

async function callGemini(parts: object[], maxOutputTokens = 4096): Promise<string> {
  const token = await getServiceAccountToken();

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.2, maxOutputTokens },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API 오류: ${res.status} — ${err}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

function parseJson<T>(text: string): T {
  const match = text.match(/[\[{][\s\S]*[\]}]/);
  if (!match) throw new Error('JSON 파싱 실패');
  return JSON.parse(match[0]) as T;
}

const MINUTES_SCHEMA = `{
  "summary": "회의 전체 내용 3~5문장 요약",
  "keyPoints": ["핵심 논의 사항 최대 5개"],
  "collaborationTopics": ["협업/파트너십 관련 논의 내용"],
  "followUps": [{ "content": "할 일", "assignee": "담당자명 또는 null", "dueDate": "YYYY-MM-DD 또는 null" }],
  "partnerInfo": { "companyName": "회사명", "contactName": "담당자명", "country": "국가" }
}`;

// ── 오디오 파일 → 트랜스크립션 + 회의록 (한 번에) ──────────────────────

const SUPPORTED_AUDIO_TYPES: Record<string, string> = {
  'audio/mp4': 'audio/mp4',
  'audio/mpeg': 'audio/mpeg',
  'audio/mp3': 'audio/mpeg',
  'audio/wav': 'audio/wav',
  'audio/webm': 'audio/webm',
  'audio/m4a': 'audio/mp4',
  'video/mp4': 'video/mp4',
};

export { SUPPORTED_AUDIO_TYPES };

export async function processAudioToMinutes(
  audioBuffer: Buffer,
  mimeType: string
): Promise<{ transcript: string; minutes: MeetingMinutes }> {
  const base64Audio = audioBuffer.toString('base64');

  const text = await callGemini([
    { inline_data: { mime_type: mimeType, data: base64Audio } },
    {
      text: `이 오디오를 한국어로 완전히 트랜스크립션한 뒤, 아래 형식으로 응답하세요.

[TRANSCRIPT]
(전체 트랜스크립션)
[MINUTES]
(아래 JSON 스키마를 따르는 회의록만 반환)
${MINUTES_SCHEMA}`,
    },
  ], 8192);

  const transcriptMatch = text.match(/\[TRANSCRIPT\]([\s\S]*?)\[MINUTES\]/);
  const transcript = transcriptMatch?.[1]?.trim() ?? '';

  const minutesMatch = text.match(/\[MINUTES\]([\s\S]*)/);
  const minutes = parseJson<MeetingMinutes>(minutesMatch?.[1] ?? text);

  return { transcript, minutes };
}

// ── 텍스트 트랜스크립트 → 회의록 ─────────────────────────────────────────

export async function generateMinutesFromText(transcript: string): Promise<MeetingMinutes> {
  const text = await callGemini([{
    text: `다음 회의 트랜스크립트를 분석하여 아래 JSON 스키마로 회의록을 작성하세요.\n\n${transcript}\n\n${MINUTES_SCHEMA}`,
  }]);
  return parseJson<MeetingMinutes>(text);
}

// ── 회의 전 브리핑 ────────────────────────────────────────────────────────

const INSIGHT_SCHEMA = `[
  {
    "connectionPoint": "두 파트너사의 공통점 또는 연결 접점 1~2문장",
    "suggestion": "구체적인 협업 제안 또는 팔로업 아이디어 2~3문장",
    "relatedPartners": ["파트너사명1", "파트너사명2"],
    "confidence": "high|medium|low"
  }
]`;

export async function generatePreMeetingBriefing(
  upcomingPartner: PartnerContext,
  pastPartners: PartnerContext[]
): Promise<PartnerInsight[]> {
  if (pastPartners.length === 0) return [];

  const text = await callGemini([{
    text: `당신은 글로벌 파트너십 전략 전문가입니다.

오늘 미팅 예정 파트너사:
${JSON.stringify(upcomingPartner, null, 2)}

과거 미팅한 파트너사들:
${JSON.stringify(pastPartners, null, 2)}

오늘 미팅 파트너사와 기존 파트너사들 사이의 연결 접점과 협업 아이디어를 찾아주세요.
아래 JSON 배열 형식으로만 응답하세요:
${INSIGHT_SCHEMA}`,
  }]);

  try { return parseJson<PartnerInsight[]>(text); }
  catch { return []; }
}

// ── 회의 후 인사이트 ──────────────────────────────────────────────────────

export async function generatePostMeetingInsights(
  newMeetingPartner: PartnerContext,
  allPartners: PartnerContext[]
): Promise<PartnerInsight[]> {
  const others = allPartners.filter((p) => p.companyName !== newMeetingPartner.companyName);
  if (others.length === 0) return [];

  const text = await callGemini([{
    text: `당신은 글로벌 파트너십 전략 전문가입니다.

방금 미팅을 마친 파트너사:
${JSON.stringify(newMeetingPartner, null, 2)}

기존 파트너사 네트워크:
${JSON.stringify(others, null, 2)}

새 회의 내용을 바탕으로 기존 파트너 네트워크와의 시너지 가능성을 찾아주세요.
아래 JSON 배열 형식으로만 응답하세요:
${INSIGHT_SCHEMA}`,
  }]);

  try { return parseJson<PartnerInsight[]>(text); }
  catch { return []; }
}
