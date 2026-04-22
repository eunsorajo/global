import OpenAI from 'openai';

export async function transcribeAudio(audioFile: File): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-1',
    language: 'ko',
    response_format: 'text',
  });

  return transcription;
}
