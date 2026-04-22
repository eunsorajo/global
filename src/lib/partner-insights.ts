import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface PartnerInsight {
  connectionPoint: string;
  suggestion: string;
  relatedPartners: string[];
  confidence: 'high' | 'medium' | 'low';
}

const INSIGHT_SYSTEM_PROMPT = `당신은 글로벌 파트너십 전략 전문가입니다.
여러 파트너사의 회의 이력과 프로필을 분석하여 파트너사 간 연결 가능성과 협업 아이디어를 제시합니다.

응답은 반드시 JSON 배열 형식으로 반환하세요:
[
  {
    "connectionPoint": "두 파트너사의 공통점 또는 연결 가능한 접점 (1~2문장)",
    "suggestion": "구체적인 협업 제안 또는 팔로업 아이디어 (2~3문장)",
    "relatedPartners": ["파트너사명1", "파트너사명2"],
    "confidence": "high|medium|low"
  }
]`;

interface PartnerContext {
  companyName: string;
  country: string;
  category: string;
  grade: string;
  recentMeetingSummaries: string[];
  collaborationTopics: string[];
}

export async function generatePreMeetingBriefing(
  upcomingPartner: PartnerContext,
  pastPartners: PartnerContext[]
): Promise<PartnerInsight[]> {
  if (pastPartners.length === 0) return [];

  const prompt = `
오늘 미팅 예정 파트너사:
${JSON.stringify(upcomingPartner, null, 2)}

과거 미팅한 다른 파트너사들:
${JSON.stringify(pastPartners, null, 2)}

위 정보를 바탕으로, 오늘 미팅 예정 파트너사와 기존 파트너사들 사이에서
연결될 수 있는 접점과 협업 아이디어를 제시해주세요.`;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: INSIGHT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  return JSON.parse(jsonMatch[0]) as PartnerInsight[];
}

export async function generatePostMeetingInsights(
  newMeetingPartner: PartnerContext,
  allPartners: PartnerContext[]
): Promise<PartnerInsight[]> {
  const others = allPartners.filter((p) => p.companyName !== newMeetingPartner.companyName);
  if (others.length === 0) return [];

  const prompt = `
방금 미팅을 마친 파트너사:
${JSON.stringify(newMeetingPartner, null, 2)}

기존 파트너사 네트워크:
${JSON.stringify(others, null, 2)}

새로운 회의 내용을 기반으로, 기존 파트너사 네트워크와의 시너지 가능성이나
연계 협업 아이디어를 제시해주세요.`;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: INSIGHT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  return JSON.parse(jsonMatch[0]) as PartnerInsight[];
}
