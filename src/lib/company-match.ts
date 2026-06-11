// 회사명 매칭 유틸 (순수 함수 — 서버/클라이언트 공용 가능).
//
// 해결하는 문제: 회의록의 회사명 표기가 DB와 조금 달라서
// ("주식회사 누락", "(주) 유무", 띄어쓰기, 영문 법인격 Co., Ltd., 오타 등)
// 같은 회사가 다른 회사로 취급되는 것.
//
// 정책:
//   1) 법인격·장식어를 제거한 정규화 키가 동일 → "확정 매칭" (자동 연결)
//   2) 정규화 후에도 다르면 편집거리/포함관계 기반 유사도로 "후보 제안"만 한다
//      (자동 연결하지 않음 — 비슷한 다른 회사를 잘못 잇는 사고 방지, 사용자가 클릭으로 확정)

// 한국 법인격/단체 표기
const KO_LEGAL_FORMS = [
  '주식회사',
  '유한회사',
  '유한책임회사',
  '합자회사',
  '합명회사',
  '사단법인',
  '재단법인',
  '농업회사법인',
  '협동조합',
];

// 영문 법인격/장식 토큰 (토큰 단위로만 제거 — 이름 본체를 훼손하지 않음)
const EN_LEGAL_TOKENS = new Set([
  'inc',
  'co',
  'ltd',
  'llc',
  'llp',
  'corp',
  'corporation',
  'company',
  'limited',
  'gmbh',
  'sa',
  'srl',
  'sarl',
  'pte',
  'plc',
  'kk',
  'kabushiki',
  'kaisha',
  'the',
]);

// 회사명 정규화: 법인격 제거 + 괄호 표기 제거 + 공백/구두점 제거 + 소문자.
export function normalizeCompanyName(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = raw.toLowerCase().trim();

  // (주) ㈜ (유) (사) (재) 등 괄호 법인격
  s = s.replace(/[(（]\s*(주|유|사|재|합)\s*[)）]/g, ' ');
  s = s.replace(/[㈜㈔㈲]/g, ' ');

  // 한국 법인격 단어 (앞/뒤 어디 붙어도 제거)
  for (const form of KO_LEGAL_FORMS) {
    s = s.split(form).join(' ');
  }

  // 영문 토큰 분해 → 법인격 토큰 제거 (co., ltd. 의 점/쉼표는 토큰화로 흡수)
  const tokens = s.split(/[^0-9a-z가-힣぀-ヿ一-鿿]+/).filter(Boolean);
  const kept = tokens.filter((t) => !EN_LEGAL_TOKENS.has(t));
  // 전부 법인격 토큰이면(예: "주식회사") 빈 결과 대신 원 토큰 유지
  const finalTokens = kept.length > 0 ? kept : tokens;

  return finalTokens.join('');
}

// 편집거리 (Levenshtein) — 짧은 회사명 기준이라 O(n*m) 으로 충분.
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

// 0~1 유사도. 포함관계(한쪽이 다른쪽을 통째로 포함)는 별도 가산.
export function nameSimilarity(rawA: string, rawB: string): number {
  const a = normalizeCompanyName(rawA);
  const b = normalizeCompanyName(rawB);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  const ratio = 1 - editDistance(a, b) / maxLen;
  // 포함관계: "anchorkobe" ⊂ "anchorkobeinnovation" 같은 부분 표기.
  // 짧은 쪽이 4자 이상일 때만 (1~3자는 우연 포함이 많음).
  const shorter = a.length <= b.length ? a : b;
  if (shorter.length >= 4 && (a.includes(b) || b.includes(a))) {
    return Math.max(ratio, 0.85);
  }
  return ratio;
}

export interface MatchCandidate {
  id: string;
  name: string;
  kind: 'business' | 'directory'; // business=사업 파트너(partners), directory=협력/잠재(partner_directory)
  status?: string | null; // directory 인 경우 협력/잠재
  country?: string | null;
}

export interface MatchSuggestion extends MatchCandidate {
  score: number; // 0~1
}

export interface CompanyMatchResult {
  // 정규화 키 동일 → 확정 매칭 (business 우선)
  exact: MatchCandidate | null;
  // 유사 후보 (확정 아님 — UI 에서 사용자가 클릭으로 확정)
  suggestions: MatchSuggestion[];
}

// 유사 후보 채택 기준:
//   - 편집거리 1 이하 (짧은 한국어 이름의 한 글자 오타)
//   - 또는 길이 6 이상에서 편집거리 2 이하
//   - 또는 유사도 0.78 이상 (포함관계 0.85 가산 포함)
function isSuggestable(a: string, b: string, score: number): boolean {
  if (score >= 0.78) return true;
  const d = editDistance(a, b);
  if (d <= 1) return true;
  if (d <= 2 && Math.min(a.length, b.length) >= 6) return true;
  return false;
}

export function matchCompanyName(
  rawName: string | null | undefined,
  candidates: MatchCandidate[],
): CompanyMatchResult {
  const key = normalizeCompanyName(rawName);
  if (!key) return { exact: null, suggestions: [] };

  let exact: MatchCandidate | null = null;
  const suggestions: MatchSuggestion[] = [];

  for (const c of candidates) {
    const cKey = normalizeCompanyName(c.name);
    if (!cKey) continue;
    if (cKey === key) {
      // business(사업)를 directory 보다 우선 (회의록의 기본 저장처)
      if (!exact || (exact.kind === 'directory' && c.kind === 'business')) {
        exact = c;
      }
      continue;
    }
    const score = nameSimilarity(rawName ?? '', c.name);
    if (isSuggestable(key, cKey, score)) {
      suggestions.push({ ...c, score: Math.round(score * 100) / 100 });
    }
  }

  suggestions.sort((x, y) => y.score - x.score || (x.kind === 'business' ? -1 : 1));
  return { exact, suggestions: suggestions.slice(0, 5) };
}
