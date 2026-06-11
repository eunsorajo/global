// 서버 전용 파트너 디렉토리(2계층) 데이터 접근 계층.
// 페이지(서버 컴포넌트)와 API 라우트가 공유한다. service_role 키 사용 → RLS 우회.
//
// 디렉토리(partner_directory): 사업+협력+잠재 전체 파트너사.
// 사업 파트너 상세(partners): directory_id 로 1:1 연결, 참여기업·KPI 보유.
import 'server-only';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';
import type {
  PartnerDirectoryRow,
  DirectoryListItem,
  DirectoryInput,
  DirectoryStatus,
} from '@/types/accelerating';
import type { DirectoryFollowupRow, FollowupStatus } from '@/types/meeting';

export class DirectoryDataError extends Error {}

// 수정 가능한 디렉토리 컬럼 화이트리스트 (status 는 별도 전용 경로로만 변경)
const EDITABLE_FIELDS = [
  'name',
  'country',
  'sector',
  'contact_name',
  'contact_email',
  'contact_phone',
  'website',
  'last_contact_date',
  'discovery_note',
  'note',
] as const;

// 입력에서 화이트리스트 컬럼만 추출. 빈 문자열은 null 로 정규화.
function pickFields(input: DirectoryInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in input) {
      const v = (input as Record<string, unknown>)[key];
      out[key] = typeof v === 'string' && v.trim() === '' ? null : v;
    }
  }
  return out;
}

// 디렉토리 전체 목록 + (사업 파트너의 경우) 연결된 partners.id 동봉.
export async function getDirectoryList(): Promise<DirectoryListItem[]> {
  const supabase = getSupabaseAdmin();

  const [dirRes, partnersRes] = await Promise.all([
    supabase.from('partner_directory').select('*').order('created_at', { ascending: true }),
    supabase.from('partners').select('id, directory_id'),
  ]);

  for (const r of [dirRes, partnersRes]) {
    if (r.error) throw new DirectoryDataError(describeSupabaseError(r.error));
  }

  const dirs = (dirRes.data ?? []) as PartnerDirectoryRow[];
  const partners = (partnersRes.data ?? []) as { id: string; directory_id: string | null }[];

  // directory_id → partners.id 매핑
  const partnerIdByDir = new Map<string, string>();
  for (const p of partners) {
    if (p.directory_id) partnerIdByDir.set(p.directory_id, p.id);
  }

  // 정렬: 사업 → 협력 → 잠재, 동일 상태 내 국가/이름순
  const statusRank: Record<DirectoryStatus, number> = { 사업: 0, 협력: 1, 잠재: 2 };
  const items = dirs.map<DirectoryListItem>((d) => ({
    ...d,
    businessPartnerId: partnerIdByDir.get(d.id) ?? null,
  }));
  items.sort((a, b) => {
    const s = statusRank[a.status] - statusRank[b.status];
    if (s !== 0) return s;
    const c = (a.country ?? '').localeCompare(b.country ?? '', 'ko');
    if (c !== 0) return c;
    return a.name.localeCompare(b.name, 'ko');
  });
  return items;
}

// 디렉토리 단건 + 연결된 partners.id.
export async function getDirectoryItem(id: string): Promise<DirectoryListItem | null> {
  const supabase = getSupabaseAdmin();

  const dirRes = await supabase.from('partner_directory').select('*').eq('id', id).maybeSingle();
  if (dirRes.error) throw new DirectoryDataError(describeSupabaseError(dirRes.error));
  if (!dirRes.data) return null;
  const dir = dirRes.data as PartnerDirectoryRow;

  const partnerRes = await supabase
    .from('partners')
    .select('id')
    .eq('directory_id', id)
    .maybeSingle();
  if (partnerRes.error) throw new DirectoryDataError(describeSupabaseError(partnerRes.error));

  return {
    ...dir,
    businessPartnerId: (partnerRes.data as { id: string } | null)?.id ?? null,
  };
}

// 신규 파트너사 생성 (기본 status='잠재').
export async function createDirectoryEntry(input: DirectoryInput): Promise<PartnerDirectoryRow> {
  if (!input.name || !input.name.trim()) {
    throw new DirectoryDataError('파트너사명(name)은 필수입니다.');
  }
  const supabase = getSupabaseAdmin();
  const payload = pickFields(input);
  payload.name = input.name.trim();
  payload.status = '잠재';

  const { data, error } = await supabase
    .from('partner_directory')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw new DirectoryDataError(describeSupabaseError(error));
  return data as PartnerDirectoryRow;
}

// 디렉토리 정보 수정 (status 제외).
export async function updateDirectoryEntry(
  id: string,
  input: DirectoryInput,
): Promise<PartnerDirectoryRow> {
  const supabase = getSupabaseAdmin();
  const payload = pickFields(input);
  if ('name' in payload) {
    if (typeof payload.name !== 'string' || !payload.name.trim()) {
      throw new DirectoryDataError('파트너사명(name)은 비울 수 없습니다.');
    }
    payload.name = payload.name.trim();
  }
  if (Object.keys(payload).length === 0) {
    throw new DirectoryDataError('수정할 내용이 없습니다.');
  }
  payload.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('partner_directory')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new DirectoryDataError(describeSupabaseError(error));
  return data as PartnerDirectoryRow;
}

// 상태 변경(승격/강등). '사업'으로 승격 시 partners 상세 레코드가 없으면 생성.
//   - 잠재 ↔ 협력: status 만 변경
//   - → 사업: status 변경 + partners 상세 보장(없으면 생성: directory_id 연결, name/country 복사,
//             agreement_submitted=false, no 는 마지막+1)
export async function changeDirectoryStatus(
  id: string,
  status: DirectoryStatus,
): Promise<{ directory: PartnerDirectoryRow; businessPartnerId: string | null }> {
  const supabase = getSupabaseAdmin();

  const dirRes = await supabase.from('partner_directory').select('*').eq('id', id).maybeSingle();
  if (dirRes.error) throw new DirectoryDataError(describeSupabaseError(dirRes.error));
  if (!dirRes.data) throw new DirectoryDataError('해당 파트너사를 찾을 수 없습니다.');
  const before = dirRes.data as PartnerDirectoryRow;

  let businessPartnerId: string | null = null;
  let createdPartnerId: string | null = null; // 이번 호출에서 새로 만든 partners 행 (보상 삭제용)

  if (status === '사업') {
    // partners 상세를 status 변경 *전에* 먼저 보장한다.
    // (insert 가 실패했을 때 status 만 '사업'으로 남는 모순 상태 —
    //  사업 목록에 안 보이고 KPI 진입 불가 — 를 만들지 않기 위함)
    const existRes = await supabase
      .from('partners')
      .select('id')
      .eq('directory_id', id)
      .maybeSingle();
    if (existRes.error) throw new DirectoryDataError(describeSupabaseError(existRes.error));

    if (existRes.data) {
      businessPartnerId = (existRes.data as { id: string }).id;
    } else {
      // partners 상세 생성. no 는 전체 마지막+1.
      const maxRes = await supabase
        .from('partners')
        .select('no')
        .order('no', { ascending: false })
        .limit(1);
      if (maxRes.error) throw new DirectoryDataError(describeSupabaseError(maxRes.error));
      const nextNo = ((maxRes.data?.[0] as { no: number } | undefined)?.no ?? 0) + 1;

      const insRes = await supabase
        .from('partners')
        .insert({
          directory_id: id,
          no: nextNo,
          name: before.name,
          country: before.country ?? '',
          agreement_submitted: false,
        })
        .select('id')
        .single();
      if (insRes.error) throw new DirectoryDataError(describeSupabaseError(insRes.error));
      businessPartnerId = (insRes.data as { id: string }).id;
      createdPartnerId = businessPartnerId;
    }
  } else {
    // 사업이 아니어도 연결 partners 가 있을 수 있으므로(강등) 조회만.
    const existRes = await supabase
      .from('partners')
      .select('id')
      .eq('directory_id', id)
      .maybeSingle();
    if (!existRes.error && existRes.data) {
      businessPartnerId = (existRes.data as { id: string }).id;
    }
  }

  // status 갱신 (사업 승격의 경우 partners 보장 이후에 수행)
  const { data: updated, error: updErr } = await supabase
    .from('partner_directory')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (updErr) {
    // 보상: 이번에 만든 partners 행이 있으면 제거해 비-사업 디렉토리에
    // partners 상세가 매달린 상태(사업 목록 오표시)를 남기지 않는다.
    if (createdPartnerId) {
      const delRes = await supabase.from('partners').delete().eq('id', createdPartnerId);
      if (delRes.error) {
        console.error(
          '[directory-data] status 갱신 실패 후 partners 보상 삭제도 실패:',
          describeSupabaseError(delRes.error),
        );
      }
    }
    throw new DirectoryDataError(describeSupabaseError(updErr));
  }
  const directory = updated as PartnerDirectoryRow;

  return { directory, businessPartnerId };
}

// 디렉토리 삭제. 사업 파트너(연결 partners 존재)는 데이터 보호를 위해 삭제 거부.
export async function deleteDirectoryEntry(id: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  const partnerRes = await supabase
    .from('partners')
    .select('id')
    .eq('directory_id', id)
    .maybeSingle();
  if (partnerRes.error) throw new DirectoryDataError(describeSupabaseError(partnerRes.error));
  if (partnerRes.data) {
    throw new DirectoryDataError(
      '사업 파트너로 연결된 항목은 삭제할 수 없습니다. 먼저 상태를 협력/잠재로 변경하세요.',
    );
  }

  const { error } = await supabase.from('partner_directory').delete().eq('id', id);
  if (error) throw new DirectoryDataError(describeSupabaseError(error));
}

// ---------- 디렉토리(협력/잠재 파트너) 팔로업 ----------
// followups 테이블을 회의 팔로업과 공유하되 directory_id 로 구분(마이그레이션 009).

const VALID_FOLLOWUP_STATUS: FollowupStatus[] = ['pending', 'in_progress', 'completed'];

export interface DirectoryFollowupInput {
  content: string;
  assignee?: string | null;
  due_date?: string | null;
}

// 특정 디렉토리 파트너의 팔로업 목록 (미완료 우선 → 기한 오름차순 → 생성순).
export async function getDirectoryFollowups(
  directoryId: string,
): Promise<DirectoryFollowupRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('followups')
    .select('*')
    .eq('directory_id', directoryId)
    .order('created_at', { ascending: true });
  if (error) throw new DirectoryDataError(describeSupabaseError(error));

  const rows = (data ?? []) as DirectoryFollowupRow[];
  const rank: Record<FollowupStatus, number> = { pending: 0, in_progress: 1, completed: 2 };
  rows.sort((a, b) => {
    const s = rank[a.status] - rank[b.status];
    if (s !== 0) return s;
    // 미완료 항목은 기한이 빠른 것 먼저(기한 없는 건 뒤로)
    const ad = a.due_date ?? '9999-12-31';
    const bd = b.due_date ?? '9999-12-31';
    if (ad !== bd) return ad < bd ? -1 : 1;
    return a.created_at.localeCompare(b.created_at);
  });
  return rows;
}

// 디렉토리 파트너 팔로업 생성. content 필수, status 기본 pending.
export async function createDirectoryFollowup(
  directoryId: string,
  input: DirectoryFollowupInput,
): Promise<DirectoryFollowupRow> {
  if (!input.content || !input.content.trim()) {
    throw new DirectoryDataError('내용(content)은 필수입니다.');
  }
  const supabase = getSupabaseAdmin();

  // 존재하는 디렉토리인지 확인(잘못된 FK 방지 + 명확한 에러)
  const dirRes = await supabase
    .from('partner_directory')
    .select('id')
    .eq('id', directoryId)
    .maybeSingle();
  if (dirRes.error) throw new DirectoryDataError(describeSupabaseError(dirRes.error));
  if (!dirRes.data) throw new DirectoryDataError('해당 파트너사를 찾을 수 없습니다.');

  const assignee =
    typeof input.assignee === 'string' && input.assignee.trim() === ''
      ? null
      : input.assignee ?? null;
  const dueDate =
    typeof input.due_date === 'string' && input.due_date.trim() === ''
      ? null
      : input.due_date ?? null;

  const { data, error } = await supabase
    .from('followups')
    .insert({
      directory_id: directoryId,
      meeting_id: null,
      content: input.content.trim(),
      assignee,
      due_date: dueDate,
      status: 'pending',
    })
    .select('*')
    .single();
  if (error) throw new DirectoryDataError(describeSupabaseError(error));
  return data as DirectoryFollowupRow;
}

// 팔로업 상태 변경 (회의/디렉토리 공용 — followups.id 만으로 갱신).
export async function updateFollowupStatus(
  id: string,
  status: FollowupStatus,
): Promise<DirectoryFollowupRow> {
  if (!VALID_FOLLOWUP_STATUS.includes(status)) {
    throw new DirectoryDataError('잘못된 상태값입니다.');
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('followups')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw new DirectoryDataError(describeSupabaseError(error));
  if (!data) throw new DirectoryDataError('해당 팔로업을 찾을 수 없습니다.');
  return data as DirectoryFollowupRow;
}

// 팔로업 삭제 (회의/디렉토리 공용).
export async function deleteFollowup(id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('followups').delete().eq('id', id);
  if (error) throw new DirectoryDataError(describeSupabaseError(error));
}

// ---------- 회의록 → 디렉토리(협력/잠재) 기록 ----------

// 회사명 매칭 후보용 협력/잠재 목록 (사업은 partners 목록이 담당).
export async function getDirectoryMatchCandidates(): Promise<
  { id: string; name: string; status: string; country: string | null }[]
> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('partner_directory')
    .select('id, name, status, country')
    .in('status', ['잠재', '협력']);
  if (error) throw new DirectoryDataError(describeSupabaseError(error));
  return (data ?? []) as { id: string; name: string; status: string; country: string | null }[];
}

export interface DirectoryMeetingNoteInput {
  meetingDate: string | null; // YYYY-MM-DD
  title: string;
  attendees: string | null;
  summary: string | null;
  keyPoints: string[];
  decisions: string[];
  followups: { content: string; assignee?: string | null; dueDate?: string | null }[];
}

// 회의록 내용을 디렉토리(협력/잠재) 파트너 기록에 반영한다.
// meetings 테이블은 사업 파트너 전용이므로, 협력/잠재는 CRM 필드로 보존:
//   - note: 회의 기록 블록을 맨 위에 추가 (기존 메모 보존)
//   - future_plan(향후 협업계획): 결정사항을 날짜 표기와 함께 맨 위에 추가
//   - last_contact_date: 회의일이 더 최신이면 갱신
//   - followups: directory_id 팔로업으로 일괄 등록
export async function saveMeetingNoteToDirectory(
  directoryId: string,
  input: DirectoryMeetingNoteInput,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const dirRes = await supabase
    .from('partner_directory')
    .select('id, note, future_plan, last_contact_date')
    .eq('id', directoryId)
    .maybeSingle();
  if (dirRes.error) throw new DirectoryDataError(describeSupabaseError(dirRes.error));
  if (!dirRes.data) throw new DirectoryDataError('해당 파트너사를 찾을 수 없습니다.');
  const cur = dirRes.data as {
    note: string | null;
    future_plan: string | null;
    last_contact_date: string | null;
  };

  const dateLabel = input.meetingDate ?? '날짜 미상';

  // 회의 기록 블록 (note 맨 위에 누적)
  const lines: string[] = [`── 회의록 (${dateLabel} · ${input.title}) ──`];
  if (input.attendees) lines.push(`참석자: ${input.attendees}`);
  if (input.summary) lines.push(input.summary);
  if (input.keyPoints.length > 0) {
    lines.push('핵심사항:');
    for (const k of input.keyPoints) lines.push(`- ${k}`);
  }
  if (input.decisions.length > 0) {
    lines.push('결정사항:');
    for (const d of input.decisions) lines.push(`- ${d}`);
  }
  const noteBlock = lines.join('\n');

  const payload: Record<string, unknown> = {
    note: cur.note ? `${noteBlock}\n\n${cur.note}` : noteBlock,
    updated_at: new Date().toISOString(),
  };

  // 예정(향후 협업계획) 업데이트: 결정사항이 있으면 날짜와 함께 맨 위에 추가
  if (input.decisions.length > 0) {
    const planBlock = `[${dateLabel}] ${input.decisions.join(' / ')}`;
    payload.future_plan = cur.future_plan ? `${planBlock}\n${cur.future_plan}` : planBlock;
  }

  // 최근 접촉일: 회의일이 더 최신일 때만 갱신
  if (input.meetingDate && (!cur.last_contact_date || input.meetingDate > cur.last_contact_date)) {
    payload.last_contact_date = input.meetingDate;
  }

  const upRes = await supabase.from('partner_directory').update(payload).eq('id', directoryId);
  if (upRes.error) throw new DirectoryDataError(describeSupabaseError(upRes.error));

  // 팔로업 일괄 등록
  const fuRows = input.followups
    .filter((f) => f.content && f.content.trim())
    .map((f) => ({
      directory_id: directoryId,
      meeting_id: null,
      content: f.content.trim(),
      assignee: f.assignee?.trim() || null,
      due_date: f.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(f.dueDate) ? f.dueDate : null,
      status: 'pending' as const,
    }));
  if (fuRows.length > 0) {
    const fuRes = await supabase.from('followups').insert(fuRows);
    if (fuRes.error) throw new DirectoryDataError(describeSupabaseError(fuRes.error));
  }
}
