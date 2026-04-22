import OpenAI from 'openai';

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function embedText(text: string): Promise<number[]> {
  const res = await getOpenAI().embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return res.data[0].embedding;
}

export interface SearchResult {
  meetingId: string;
  partnerName: string;
  meetingDate: string;
  meetingTitle: string;
  summary: string;
  similarity: number;
}

// Supabase pgvector를 이용한 시맨틱 검색
// 실제 Supabase 클라이언트 연동 후 활성화
export async function searchMeetings(query: string): Promise<SearchResult[]> {
  const queryEmbedding = await embedText(query);

  // TODO: Supabase 클라이언트로 아래 SQL 실행
  // SELECT
  //   m.id, m.title, m.meeting_date, m.summary,
  //   p.company_name,
  //   1 - (m.embedding <=> $1::vector) AS similarity
  // FROM meetings m
  // JOIN partners p ON m.partner_id = p.id
  // WHERE 1 - (m.embedding <=> $1::vector) > 0.7
  // ORDER BY similarity DESC
  // LIMIT 5;

  // 더미 결과 (Supabase 연동 전)
  void queryEmbedding;
  return [];
}
