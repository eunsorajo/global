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

  // status 갱신
  const { data: updated, error: updErr } = await supabase
    .from('partner_directory')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (updErr) throw new DirectoryDataError(describeSupabaseError(updErr));
  const directory = updated as PartnerDirectoryRow;

  let businessPartnerId: string | null = null;

  if (status === '사업') {
    // 이미 연결된 partners 상세가 있는지 확인
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
          name: directory.name,
          country: directory.country ?? '',
          agreement_submitted: false,
        })
        .select('id')
        .single();
      if (insRes.error) throw new DirectoryDataError(describeSupabaseError(insRes.error));
      businessPartnerId = (insRes.data as { id: string }).id;
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

  // before 미사용 경고 회피용(현재 추가 로직 없음). 추후 상태전이 검증 시 활용.
  void before;
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
