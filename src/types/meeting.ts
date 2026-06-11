// 액셀러레이팅 회의록 도메인 타입
// (DB: meetings / followups 테이블과 1:1 대응 + 화면용 구조화 타입)

export type FollowupStatus = 'pending' | 'in_progress' | 'completed';

// ---------- DB row 타입 (snake_case, Supabase 응답과 1:1) ----------

export interface MeetingRow {
  id: string;
  partner_id: string;
  meeting_date: string | null;
  title: string;
  attendees: string | null;
  summary: string | null;
  key_points: string | null;
  decisions: string | null;
  raw_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FollowupRow {
  id: string;
  meeting_id: string;
  content: string;
  assignee: string | null;
  due_date: string | null;
  status: FollowupStatus;
  created_at: string;
  updated_at: string;
}

// 디렉토리(협력/잠재 파트너) 팔로업 row (마이그레이션 009: directory_id 기반).
// 회의(meeting_id)가 아닌 partner_directory.id 에 직접 연결된다.
export interface DirectoryFollowupRow {
  id: string;
  meeting_id: string | null;
  directory_id: string | null;
  content: string;
  assignee: string | null;
  due_date: string | null;
  status: FollowupStatus;
  created_at: string;
  updated_at: string;
}

// ---------- 파싱 결과(미리보기 / 저장 요청) 타입 ----------

export interface ParsedFollowup {
  content: string;
  assignee?: string | null;
  dueDate?: string | null;
}

// 파트너명 유사 후보 (확정 매칭이 아닌 제안 — UI 에서 클릭으로 확정)
export interface PartnerMatchSuggestion {
  id: string;
  name: string;
  kind: 'business' | 'directory'; // business=사업 파트너, directory=협력/잠재
  status?: string | null;
  country?: string | null;
  score: number; // 0~1
}

export interface ParsedMeeting {
  // 원문에서 추출한 파트너명(매칭 전). 비어있을 수 있음.
  partnerName: string | null;
  // DB partners(사업 파트너)와 확정 매칭된 결과 (법인격·공백 정규화 동일)
  matchedPartnerId: string | null;
  // partner_directory(협력/잠재)와 확정 매칭된 결과 — 사업 매칭이 없을 때만 채워짐
  matchedDirectoryId?: string | null;
  matchedDirectoryName?: string | null;
  matchedDirectoryStatus?: string | null;
  // 확정 매칭이 없을 때의 유사 후보 목록
  matchSuggestions?: PartnerMatchSuggestion[];
  meetingDate: string | null; // YYYY-MM-DD
  title: string;
  attendees: string | null;
  summary: string | null;
  keyPoints: string[];
  decisions: string[];
  followups: ParsedFollowup[];
  rawNotes: string | null;
  // 파싱 경고(필수값 누락 등) — 미리보기에서 표시
  warnings: string[];
}

// ---------- 조회용(파트너 상세 회의록 탭) ----------

export interface MeetingWithFollowups extends MeetingRow {
  followups: FollowupRow[];
}
