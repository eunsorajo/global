// 회의록 정형 텍스트 파서.
// 사용자가 외부 무료 AI(ChatGPT/Gemini 웹)에 우리 프롬프트를 넣어 만든
// 정형 텍스트를 관대하게(lenient) 파싱한다. AI 호출은 우리 서버에서 하지 않는다.
//
// 입력 양식 (대괄호 섹션 헤더 기준):
//   [파트너] 파트너명
//   [회의일] YYYY-MM-DD
//   [제목] ...
//   [참석자] ...
//   [요약] (여러 줄 가능)
//   [핵심사항]
//   - ...
//   [결정사항]
//   - ...
//   [팔로업]
//   - 내용 | 담당자 | YYYY-MM-DD

import type { ParsedMeeting, ParsedFollowup } from '@/types/meeting';

export const MAX_TEXT_BYTES = 100 * 1024; // 100KB

// 섹션 헤더의 한국어 표기 변형을 흡수 (공백/대소문자 무시는 아래에서 처리)
const SECTION_ALIASES: Record<string, string> = {
  파트너: 'partner',
  파트너명: 'partner',
  회의일: 'date',
  회의일자: 'date',
  날짜: 'date',
  제목: 'title',
  참석자: 'attendees',
  요약: 'summary',
  핵심사항: 'keyPoints',
  핵심: 'keyPoints',
  주요사항: 'keyPoints',
  결정사항: 'decisions',
  결정: 'decisions',
  팔로업: 'followups',
  후속조치: 'followups',
  액션아이템: 'followups',
};

type SectionKey =
  | 'partner'
  | 'date'
  | 'title'
  | 'attendees'
  | 'summary'
  | 'keyPoints'
  | 'decisions'
  | 'followups';

// 입력 라인 앞의 글머리표/번호 제거
function stripBullet(line: string): string {
  return line.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, '').trim();
}

// 다양한 날짜 표기를 YYYY-MM-DD 로 정규화. 실패 시 null.
export function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  // YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD / YYYY년 MM월 DD일
  const m = s.match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    const mm = mo.padStart(2, '0');
    const dd = d.padStart(2, '0');
    const monthN = Number(mm);
    const dayN = Number(dd);
    if (monthN >= 1 && monthN <= 12 && dayN >= 1 && dayN <= 31) {
      return `${y}-${mm}-${dd}`;
    }
  }
  return null;
}

// 헤더 라인이면 섹션 키와 같은 줄 잔여 텍스트를 반환
function matchHeader(line: string): { key: SectionKey; rest: string } | null {
  const m = line.match(/^\s*\[\s*([^\]]+?)\s*\]\s*(.*)$/);
  if (!m) return null;
  const label = m[1].replace(/\s+/g, ''); // 공백 무시
  const rest = m[2].trim();
  const key = SECTION_ALIASES[label];
  if (!key) return null;
  return { key: key as SectionKey, rest };
}

// "내용 | 담당자 | YYYY-MM-DD" 형식의 팔로업 한 줄 파싱
function parseFollowupLine(line: string): ParsedFollowup | null {
  const content0 = stripBullet(line);
  if (!content0) return null;
  const parts = content0.split('|').map((p) => p.trim());
  const content = parts[0] ?? '';
  if (!content) return null;
  const assignee = parts[1] ? parts[1] : null;
  const dueDate = parts[2] ? normalizeDate(parts[2]) : null;
  return { content, assignee, dueDate };
}

export interface ParseOptions {
  // partners DB 목록 (자동 매칭용). 없으면 매칭 시도 안 함.
  partners?: { id: string; name: string }[];
  // 원문 보존 여부 (rawNotes 로 저장)
  keepRaw?: boolean;
}

// 공백/대소문자 무시 정규화 키
function normName(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

export function parseMeetingText(input: string, opts: ParseOptions = {}): ParsedMeeting {
  const warnings: string[] = [];
  const lines = input.replace(/\r\n/g, '\n').split('\n');

  const buckets: Record<SectionKey, string[]> = {
    partner: [],
    date: [],
    title: [],
    attendees: [],
    summary: [],
    keyPoints: [],
    decisions: [],
    followups: [],
  };

  let current: SectionKey | null = null;
  for (const rawLine of lines) {
    const header = matchHeader(rawLine);
    if (header) {
      current = header.key;
      if (header.rest) buckets[current].push(header.rest);
      continue;
    }
    if (current) buckets[current].push(rawLine);
  }

  const firstLine = (arr: string[]): string | null => {
    const v = arr.map((l) => l.trim()).filter(Boolean)[0];
    return v ?? null;
  };
  const joinLines = (arr: string[]): string | null => {
    const v = arr.map((l) => l.replace(/\s+$/, '')).join('\n').trim();
    return v ? v : null;
  };
  const bulletList = (arr: string[]): string[] =>
    arr.map((l) => stripBullet(l)).filter(Boolean);

  const partnerName = firstLine(buckets.partner);
  const meetingDate = normalizeDate(firstLine(buckets.date));
  const title = firstLine(buckets.title) ?? '';
  const attendees = firstLine(buckets.attendees);
  const summary = joinLines(buckets.summary);
  const keyPoints = bulletList(buckets.keyPoints);
  const decisions = bulletList(buckets.decisions);
  const followups: ParsedFollowup[] = buckets.followups
    .map(parseFollowupLine)
    .filter((f): f is ParsedFollowup => f !== null);

  // 자동 매칭
  let matchedPartnerId: string | null = null;
  if (partnerName && opts.partners && opts.partners.length > 0) {
    const target = normName(partnerName);
    const hit = opts.partners.find((p) => normName(p.name) === target);
    matchedPartnerId = hit?.id ?? null;
  }

  // 경고 수집
  if (!partnerName) warnings.push('파트너명을 찾지 못했습니다. 직접 선택해주세요.');
  else if (opts.partners && opts.partners.length > 0 && !matchedPartnerId) {
    warnings.push(`"${partnerName}" 파트너를 DB에서 찾지 못했습니다. 직접 선택해주세요.`);
  }
  if (!title) warnings.push('제목이 비어 있습니다. (저장 시 필수)');
  if (!meetingDate && firstLine(buckets.date)) {
    warnings.push('회의일 형식을 인식하지 못했습니다. (YYYY-MM-DD 권장)');
  }

  return {
    partnerName,
    matchedPartnerId,
    meetingDate,
    title,
    attendees,
    summary,
    keyPoints,
    decisions,
    followups,
    rawNotes: opts.keepRaw ? input.trim() : null,
    warnings,
  };
}

// "AI용 프롬프트" — 클립보드 복사용. 출력 양식이 파서와 1:1 대응.
export const AI_PROMPT = `아래 회의록을 읽고, 정확히 다음 양식으로만 출력하세요. 양식 외의 설명·머리말·코드블록은 절대 추가하지 마세요.

규칙:
- 각 섹션 헤더([파트너], [회의일] 등)는 그대로 유지합니다.
- [회의일]은 YYYY-MM-DD 형식으로 적습니다.
- [핵심사항] [결정사항] [팔로업]의 각 항목은 "- "로 시작하는 한 줄로 적습니다.
- [팔로업] 항목은 "내용 | 담당자 | YYYY-MM-DD" 형식으로 적습니다. (담당자·기한이 없으면 해당 칸은 비웁니다. 예: "- 시장조사 자료 공유 |  | ")
- 민감정보(개인 연락처, 주민번호, 계약 금액 등)는 제외하고 작성합니다.
- 내용이 없는 섹션은 헤더만 두고 비워둡니다.

출력 양식:
[파트너] 파트너명
[회의일] YYYY-MM-DD
[제목] 회의 제목
[참석자] 홍길동, 김철수
[요약]
(회의 요약을 여러 줄로 작성)
[핵심사항]
- 핵심사항 1
- 핵심사항 2
[결정사항]
- 결정사항 1
[팔로업]
- 후속 작업 내용 | 담당자 | YYYY-MM-DD

--- 아래에 회의록 원문을 붙여넣으세요 ---
`;
