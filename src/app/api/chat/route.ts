import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getServiceAccountToken } from '@/lib/google-auth';

const ENDPOINT = 'https://asia-northeast3-aiplatform.googleapis.com/v1/projects/western-will-493410-j8/locations/asia-northeast3/publishers/google/models/gemini-2.0-flash-001:generateContent';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { messages } = await req.json() as { messages: { role: string; text: string }[] };

  const token = await getServiceAccountToken();

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })),
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    }),
  });

  const data = await res.json();
  if (data.error) return NextResponse.json({ error: data.error.message }, { status: 500 });

  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return NextResponse.json({ reply });
}
