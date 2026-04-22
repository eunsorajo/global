import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio } from '@/lib/whisper';
import { generateMeetingMinutes } from '@/lib/claude';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const transcript = formData.get('transcript');

    let rawTranscript: string;

    if (typeof transcript === 'string' && transcript.trim()) {
      // B: 트랜스크립트 텍스트 직접 전달
      rawTranscript = transcript;
    } else if (file instanceof File) {
      // C: 음성 파일 → Whisper STT
      rawTranscript = await transcribeAudio(file);
    } else {
      return NextResponse.json({ error: '파일 또는 트랜스크립트를 제공해주세요.' }, { status: 400 });
    }

    const minutes = await generateMeetingMinutes(rawTranscript);

    return NextResponse.json({ transcript: rawTranscript, minutes });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: '회의록 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
