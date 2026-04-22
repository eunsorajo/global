import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface MeetingMinutes {
  summary: string;
  keyPoints: string[];
  collaborationTopics: string[];
  followUps: { content: string; assignee?: string; dueDate?: string }[];
  partnerInfo: { companyName?: string; contactName?: string; country?: string };
}

const SYSTEM_PROMPT = `당신은 글로벌 파트너십 전담 회의록 작성 AI입니다.
회의 트랜스크립트를 분석하여 아래 JSON 형식으로 정확하게 회의록을 작성하세요.

규칙:
- summary: 회의 전체 내용을 3~5문장으로 요약
- keyPoints: 핵심 논의 사항 목록 (최대 5개)
- collaborationTopics: 협업/파트너십 관련 논의 내용 목록 (팔로업 기준)
- followUps: 다음 행동 항목. content는 구체적인 할 일, assignee는 담당자명(불명확하면 null), dueDate는 YYYY-MM-DD 형식(언급 없으면 null)
- partnerInfo: 트랜스크립트에서 추출 가능한 파트너사 정보

응답은 반드시 유효한 JSON만 반환하세요.`;

export async function generateMeetingMinutes(transcript: string): Promise<MeetingMinutes> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `다음 회의 트랜스크립트를 분석하여 회의록을 작성해주세요:\n\n${transcript}`,
      },
    ],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('회의록 생성 실패: JSON 파싱 오류');

  return JSON.parse(jsonMatch[0]) as MeetingMinutes;
}
