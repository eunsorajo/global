'use client';

import { useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { dummyPartners } from '@/data/dummy';

type InputMode = 'transcript' | 'audio' | 'manual';
type Step = 'input' | 'preview' | 'saving';

interface Minutes {
  summary: string;
  keyPoints: string[];
  collaborationTopics: string[];
  followUps: { content: string; assignee?: string; dueDate?: string }[];
  partnerInfo: { companyName?: string; contactName?: string; country?: string };
}

function NewMeetingForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<InputMode>('transcript');
  const [step, setStep] = useState<Step>('input');
  const [transcript, setTranscript] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [minutes, setMinutes] = useState<Minutes | null>(null);
  const [rawTranscript, setRawTranscript] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // URL 파라미터로 파트너 사전 선택 지원
  const [selectedPartnerId, setSelectedPartnerId] = useState(params.get('partnerId') ?? '');

  const title = params.get('title') ?? '';

  async function handleGenerate() {
    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      if (mode === 'transcript' || mode === 'manual') {
        formData.append('transcript', transcript);
      } else if (audioFile) {
        formData.append('file', audioFile);
      }

      const res = await fetch('/api/meetings/transcribe', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      setMinutes(data.minutes);
      setRawTranscript(data.transcript);
      setStep('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">회의록 작성</h1>
        {title && <p className="text-gray-500 text-sm mt-1">{title}</p>}
      </div>

      {step === 'input' && (
        <div className="space-y-6">
          {/* 파트너사 선택 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-medium text-gray-700 mb-3">파트너사 선택</p>
            <select
              value={selectedPartnerId}
              onChange={(e) => setSelectedPartnerId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">파트너사를 선택하세요...</option>
              {dummyPartners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.companyName} ({p.country})
                </option>
              ))}
            </select>
          </div>

          {/* 입력 방식 선택 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-medium text-gray-700 mb-3">입력 방식</p>
            <div className="flex gap-2">
              {([
                { key: 'transcript', label: '트랜스크립트 파일' },
                { key: 'audio', label: '음성 파일' },
                { key: 'manual', label: '직접 입력' },
              ] as { key: InputMode; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setMode(key)}
                  className={`text-sm px-4 py-2 rounded-lg border transition-colors ${
                    mode === key
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 입력 영역 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            {(mode === 'transcript' || mode === 'manual') && (
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder={
                  mode === 'transcript'
                    ? 'Zoom/Meet 트랜스크립트 내용을 붙여넣으세요...'
                    : '회의 내용을 직접 입력하세요...'
                }
                className="w-full h-64 text-sm text-gray-800 border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}

            {mode === 'audio' && (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-lg p-12 text-center cursor-pointer hover:border-blue-300 transition-colors"
              >
                <p className="text-gray-500 text-sm mb-1">
                  {audioFile ? audioFile.name : '음성 파일을 클릭하여 업로드'}
                </p>
                <p className="text-xs text-gray-400">MP4, MP3, M4A, WAV 지원 · 최대 25MB</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,video/mp4"
                  className="hidden"
                  onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
                />
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={handleGenerate}
            disabled={loading || (mode === 'audio' ? !audioFile : !transcript.trim())}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium py-3 rounded-xl transition-colors"
          >
            {loading ? 'AI 회의록 생성 중...' : 'AI 회의록 생성'}
          </button>
        </div>
      )}

      {step === 'preview' && minutes && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">회의 요약</h2>
            <p className="text-sm text-gray-700 leading-relaxed">{minutes.summary}</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">핵심 논의 사항</h2>
            <ul className="space-y-1.5">
              {minutes.keyPoints.map((p, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-2">
                  <span className="text-blue-500 shrink-0">•</span>{p}
                </li>
              ))}
            </ul>
          </div>

          {minutes.collaborationTopics.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-3">협업 논의 내용</h2>
              <ul className="space-y-1.5">
                {minutes.collaborationTopics.map((t, i) => (
                  <li key={i} className="text-sm text-gray-700 flex gap-2">
                    <span className="text-purple-500 shrink-0">•</span>{t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">팔로업 항목</h2>
            <div className="space-y-2">
              {minutes.followUps.map((f, i) => (
                <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" readOnly />
                    <span className="text-sm text-gray-700">{f.content}</span>
                  </div>
                  <div className="flex gap-2 text-xs text-gray-400 shrink-0">
                    {f.assignee && <span>{f.assignee}</span>}
                    {f.dueDate && <span>· {f.dueDate}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('input')}
              className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl hover:bg-gray-50 transition-colors"
            >
              다시 생성
            </button>
            <button
              onClick={() => router.push('/')}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-colors"
            >
              저장하기
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export default function NewMeetingPage() {
  return (
    <Suspense>
      <NewMeetingForm />
    </Suspense>
  );
}
