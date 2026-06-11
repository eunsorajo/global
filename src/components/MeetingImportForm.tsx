'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AI_PROMPT } from '@/lib/meeting-parser';
import type { ParsedMeeting, ParsedFollowup } from '@/types/meeting';

type Tab = 'paste' | 'excel';

interface PartnerOption {
  id: string;
  name: string;
  country: string;
}

const SAMPLE = `[파트너] 파트너명
[회의일] 2026-05-20
[제목] 1차 파트너십 협의
[참석자] 홍길동, 김철수
[요약]
회의 요약을 여러 줄로 작성합니다.
[핵심사항]
- 핵심사항 1
- 핵심사항 2
[결정사항]
- 결정사항 1
[팔로업]
- 후속 작업 내용 | 담당자 | 2026-06-01`;

export default function MeetingImportForm({ partners }: { partners: PartnerOption[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('paste');

  const [text, setText] = useState('');
  const [excelFile, setExcelFile] = useState<File | null>(null);

  const [parsed, setParsed] = useState<ParsedMeeting | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(AI_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('클립보드 복사에 실패했습니다. 직접 선택해 복사해주세요.');
    }
  }

  function applyParsed(p: ParsedMeeting) {
    setParsed(p);
    setSelectedPartnerId(p.matchedPartnerId ?? '');
  }

  async function handlePreviewPaste() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/meetings/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '미리보기에 실패했습니다.');
      applyParsed(data.parsed as ParsedMeeting);
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  async function handlePreviewExcel() {
    if (!excelFile) return;
    setLoading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', excelFile);
      const res = await fetch('/api/meetings/parse', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '미리보기에 실패했습니다.');
      applyParsed(data.parsed as ParsedMeeting);
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!parsed) return;
    if (!selectedPartnerId) {
      setError('파트너를 선택해주세요.');
      return;
    }
    if (!parsed.title.trim()) {
      setError('제목이 비어 있어 저장할 수 없습니다. 미리보기 원문을 확인해주세요.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnerId: selectedPartnerId,
          meetingDate: parsed.meetingDate,
          title: parsed.title,
          attendees: parsed.attendees,
          summary: parsed.summary,
          keyPoints: parsed.keyPoints,
          decisions: parsed.decisions,
          followups: parsed.followups,
          rawNotes: parsed.rawNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '저장에 실패했습니다.');
      router.push(`/kpi/${selectedPartnerId}?tab=meetings`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.');
      setSaving(false);
    }
  }

  function reset() {
    setParsed(null);
    setSelectedPartnerId('');
    setError('');
  }

  // -------- 미리보기 화면 --------
  if (parsed) {
    return (
      <PreviewPanel
        parsed={parsed}
        partners={partners}
        selectedPartnerId={selectedPartnerId}
        onSelectPartner={setSelectedPartnerId}
        onBack={reset}
        onSave={handleSave}
        saving={saving}
        error={error}
      />
    );
  }

  // -------- 입력 화면 --------
  const tabBtn = (active: boolean) =>
    `text-sm px-4 py-2 border-b-2 transition-colors ${
      active ? 'border-blue-600 text-blue-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'
    }`;

  return (
    <div>
      <div className="flex gap-2 border-b border-gray-200 mb-6">
        <button className={tabBtn(tab === 'paste')} onClick={() => setTab('paste')}>
          붙여넣기
        </button>
        <button className={tabBtn(tab === 'excel')} onClick={() => setTab('excel')}>
          엑셀
        </button>
      </div>

      {tab === 'paste' && (
        <div className="space-y-5">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
            <p className="text-sm font-semibold text-blue-900 mb-1">사용 방법</p>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>아래 &quot;AI용 프롬프트 복사&quot; 버튼을 누릅니다.</li>
              <li>ChatGPT 또는 Gemini 웹에 붙여넣고, 그 아래에 회의록 원문을 붙여 실행합니다.</li>
              <li>AI가 정형 양식으로 출력한 결과를 복사해 아래 입력칸에 붙여넣습니다.</li>
              <li>&quot;미리보기&quot;로 확인 후 파트너를 매칭하고 저장합니다.</li>
            </ol>
            <button
              onClick={copyPrompt}
              className="mt-3 text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              {copied ? '복사됨!' : 'AI용 프롬프트 복사'}
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700">AI 출력 붙여넣기</p>
              <button
                onClick={() => setText(SAMPLE)}
                className="text-xs text-gray-400 hover:text-blue-600"
                type="button"
              >
                양식 예시 채우기
              </button>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={SAMPLE}
              className="w-full h-72 text-sm text-gray-800 border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">최대 100KB</p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={handlePreviewPaste}
            disabled={loading || !text.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium py-3 rounded-xl transition-colors"
          >
            {loading ? '분석 중...' : '미리보기'}
          </button>
        </div>
      )}

      {tab === 'excel' && (
        <div className="space-y-5">
          <div className="bg-green-50 border border-green-200 rounded-xl p-5">
            <p className="text-sm font-semibold text-green-900 mb-1">엑셀로 가져오기</p>
            <p className="text-sm text-green-800 mb-3">
              양식을 내려받아 &quot;회의록&quot; 시트와 &quot;팔로업&quot; 시트를 채운 뒤 업로드하세요.
            </p>
            <a
              href="/api/meetings/template"
              className="inline-block text-sm bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              양식 다운로드 (.xlsx)
            </a>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-medium text-gray-700 mb-3">채워진 엑셀 업로드</p>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setExcelFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {excelFile && <p className="text-xs text-gray-500 mt-2">{excelFile.name}</p>}
            <p className="text-xs text-gray-400 mt-1">.xlsx 형식 · 최대 5MB</p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={handlePreviewExcel}
            disabled={loading || !excelFile}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium py-3 rounded-xl transition-colors"
          >
            {loading ? '분석 중...' : '미리보기'}
          </button>
        </div>
      )}
    </div>
  );
}

// -------- 미리보기 패널 --------
function PreviewPanel({
  parsed,
  partners,
  selectedPartnerId,
  onSelectPartner,
  onBack,
  onSave,
  saving,
  error,
}: {
  parsed: ParsedMeeting;
  partners: PartnerOption[];
  selectedPartnerId: string;
  onSelectPartner: (id: string) => void;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
  error: string;
}) {
  return (
    <div className="space-y-5">
      {parsed.warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-800 mb-1">확인이 필요합니다</p>
          <ul className="text-sm text-amber-700 space-y-0.5 list-disc list-inside">
            {parsed.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-sm font-medium text-gray-700 mb-2">파트너 매칭</p>
        <select
          value={selectedPartnerId}
          onChange={(e) => onSelectPartner(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">파트너를 선택하세요...</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.country})
            </option>
          ))}
        </select>
        {parsed.partnerName && (
          <p className="text-xs text-gray-400 mt-1.5">
            원문 파트너명: {parsed.partnerName}
            {parsed.matchedPartnerId ? ' · 자동 매칭됨' : ' · 자동 매칭 실패, 직접 선택하세요'}
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <Field label="회의일" value={parsed.meetingDate ?? '—'} />
        <Field label="제목" value={parsed.title || '(없음)'} warn={!parsed.title} />
        <Field label="참석자" value={parsed.attendees ?? '—'} />
        <div>
          <p className="text-xs text-gray-400 mb-1">요약</p>
          <p className="text-sm text-gray-700 whitespace-pre-line">{parsed.summary ?? '—'}</p>
        </div>
      </div>

      <ListCard title="핵심사항" items={parsed.keyPoints} color="text-blue-500" />
      <ListCard title="결정사항" items={parsed.decisions} color="text-green-600" />

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="font-semibold text-gray-900 mb-3">팔로업 ({parsed.followups.length})</p>
        {parsed.followups.length === 0 ? (
          <p className="text-sm text-gray-400">없음</p>
        ) : (
          <div className="space-y-2">
            {parsed.followups.map((f: ParsedFollowup, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-sm text-gray-700">{f.content}</span>
                <div className="flex gap-2 text-xs text-gray-400 shrink-0">
                  {f.assignee && <span>{f.assignee}</span>}
                  {f.dueDate && <span>· {f.dueDate}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={saving}
          className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          다시 입력
        </button>
        <button
          onClick={onSave}
          disabled={saving || !selectedPartnerId || !parsed.title.trim()}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium py-3 rounded-xl transition-colors"
        >
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex gap-3">
      <span className="text-xs text-gray-400 w-14 shrink-0 pt-0.5">{label}</span>
      <span className={`text-sm ${warn ? 'text-red-600' : 'text-gray-800'}`}>{value}</span>
    </div>
  );
}

function ListCard({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="font-semibold text-gray-900 mb-3">
        {title} ({items.length})
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">없음</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it, i) => (
            <li key={i} className="text-sm text-gray-700 flex gap-2">
              <span className={`${color} shrink-0`}>•</span>
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
