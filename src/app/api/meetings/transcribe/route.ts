import { NextRequest, NextResponse } from 'next/server';
import { processAudioToMinutes, generateMinutesFromText } from '@/lib/gemini';

export const runtime = 'nodejs';
export const maxDuration = 120; // 음성 처리는 최대 2분

const SUPPORTED_AUDIO_TYPES: Record<string, string> = {
  'audio/mp4': 'audio/mp4',
  'audio/mpeg': 'audio/mpeg',
  'audio/mp3': 'audio/mpeg',
  'audio/wav': 'audio/wav',
  'audio/webm': 'audio/webm',
  'audio/m4a': 'audio/mp4',
  'video/mp4': 'video/mp4', // Zoom 녹화 파일
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const transcript = formData.get('transcript');

    // A/B: 트랜스크립트 텍스트 직접 입력
    if (typeof transcript === 'string' && transcript.trim()) {
      const minutes = await generateMinutesFromText(transcript);
      return NextResponse.json({ transcript, minutes });
    }

    // C: 오디오/비디오 파일 → Gemini로 트랜스크립션 + 회의록 생성
    if (file instanceof File) {
      const mimeType = SUPPORTED_AUDIO_TYPES[file.type];
      if (!mimeType) {
        return NextResponse.json(
          { error: `지원하지 않는 파일 형식입니다. (${file.type}) MP4, MP3, WAV, M4A, WebM을 지원합니다.` },
          { status: 400 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const { transcript: rawTranscript, minutes } = await processAudioToMinutes(buffer, mimeType);
      return NextResponse.json({ transcript: rawTranscript, minutes });
    }

    return NextResponse.json(
      { error: '파일 또는 트랜스크립트를 제공해주세요.' },
      { status: 400 }
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '회의록 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
