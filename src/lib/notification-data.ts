// 서버 전용 알림 데이터 접근 계층.
// 알림은 "저장"하지 않고 "조회 시 계산"한다 (followups / kpi_definitions 실시간 집계).
// 페이지(서버 컴포넌트)와 Navbar 가 공유한다.
import 'server-only';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';

export class NotificationDataError extends Error {}

export type NotificationLevel = 'overdue' | 'due_soon' | 'kpi_undefined';

export interface NotificationItem {
  id: string; // 안정적인 키 (followup id 또는 partner id 기반)
  level: NotificationLevel;
  title: string;
  body: string;
  partnerId: string;
  partnerName: string;
  // 클릭 시 이동 경로
  href: string;
  // 정렬/표시용 (없을 수 있음)
  dueDate?: string | null;
}

export interface NotificationResult {
  items: NotificationItem[];
  counts: {
    overdue: number;
    dueSoon: number;
    kpiUndefined: number;
    // Navbar 배지 = 기한초과 + 임박 (KPI 미정의는 안내 성격이라 배지에서 제외)
    badge: number;
  };
}

// 로컬(KST 기준) 오늘 날짜 YYYY-MM-DD
function todayStr(): string {
  const now = new Date();
  // 서버가 UTC 라도 KST(+9) 기준 날짜로 맞춘다.
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function addDaysStr(base: string, days: number): string {
  const d = new Date(base + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 알림 계산 (조회 시 집계). Navbar / /notifications 공용.
export async function getNotifications(): Promise<NotificationResult> {
  const supabase = getSupabaseAdmin();
  const today = todayStr();
  const soonLimit = addDaysStr(today, 3); // 오늘 포함 3일 이내

  // 1) 미완료 팔로업 + 회의/파트너 정보 (기한 있는 것만)
  const fuRes = await supabase
    .from('followups')
    .select('id, content, due_date, status, meeting_id, meetings(id, title, partner_id, partners(id, name))')
    .neq('status', 'completed')
    .not('due_date', 'is', null)
    .order('due_date', { ascending: true });
  if (fuRes.error) throw new NotificationDataError(describeSupabaseError(fuRes.error));

  // 2) KPI 미정의 + 협약서 미제출 파트너
  const [partnersRes, defsRes] = await Promise.all([
    supabase.from('partners').select('id, name, country, agreement_submitted').order('no', { ascending: true }),
    supabase.from('kpi_definitions').select('partner_id'),
  ]);
  if (partnersRes.error) throw new NotificationDataError(describeSupabaseError(partnersRes.error));
  if (defsRes.error) throw new NotificationDataError(describeSupabaseError(defsRes.error));

  type FollowupJoined = {
    id: string;
    content: string;
    due_date: string | null;
    status: string;
    meeting_id: string;
    meetings:
      | { id: string; title: string; partner_id: string; partners: { id: string; name: string } | null }
      | null;
  };

  const followups = (fuRes.data ?? []) as unknown as FollowupJoined[];

  const overdue: NotificationItem[] = [];
  const dueSoon: NotificationItem[] = [];

  for (const f of followups) {
    const due = f.due_date;
    if (!due) continue;
    const meeting = f.meetings;
    const partner = meeting?.partners ?? null;
    const partnerId = partner?.id ?? meeting?.partner_id ?? '';
    const partnerName = partner?.name ?? '알 수 없는 파트너';
    const meetingTitle = meeting?.title ?? '제목 없는 회의';
    const href = partnerId ? `/kpi/${partnerId}?tab=meetings` : '/kpi';

    if (due < today) {
      overdue.push({
        id: `fu-${f.id}`,
        level: 'overdue',
        title: '팔로업 기한 초과',
        body: `${partnerName} — "${meetingTitle}"의 후속 작업 "${f.content}"의 기한(${due})이 지났습니다.`,
        partnerId,
        partnerName,
        href,
        dueDate: due,
      });
    } else if (due <= soonLimit) {
      dueSoon.push({
        id: `fu-${f.id}`,
        level: 'due_soon',
        title: '팔로업 기한 임박',
        body: `${partnerName} — "${meetingTitle}"의 후속 작업 "${f.content}"의 기한이 ${due}로 임박했습니다.`,
        partnerId,
        partnerName,
        href,
        dueDate: due,
      });
    }
  }

  // KPI 미정의 파트너 (정의 0건 AND 협약서 미제출)
  const definedPartnerIds = new Set<string>();
  for (const d of (defsRes.data ?? []) as { partner_id: string }[]) {
    definedPartnerIds.add(d.partner_id);
  }
  const partners = (partnersRes.data ?? []) as {
    id: string;
    name: string;
    country: string;
    agreement_submitted: boolean;
  }[];

  const kpiUndefined: NotificationItem[] = [];
  for (const p of partners) {
    if (definedPartnerIds.has(p.id)) continue;
    if (p.agreement_submitted) continue; // 협약서 제출됐으면 안내 제외
    kpiUndefined.push({
      id: `kpi-${p.id}`,
      level: 'kpi_undefined',
      title: 'KPI 미정의 파트너',
      body: `${p.name} (${p.country}) — 아직 KPI 가 정의되지 않았습니다. 설정 탭에서 KPI 를 등록해주세요.`,
      partnerId: p.id,
      partnerName: p.name,
      href: `/kpi/${p.id}?tab=settings`,
    });
  }

  // 표시 순서: 기한초과 → 임박 → KPI 미정의
  const items = [...overdue, ...dueSoon, ...kpiUndefined];

  return {
    items,
    counts: {
      overdue: overdue.length,
      dueSoon: dueSoon.length,
      kpiUndefined: kpiUndefined.length,
      badge: overdue.length + dueSoon.length,
    },
  };
}

// Navbar 배지용 경량 카운트 (실패해도 0 으로 폴백 — 네비게이션이 깨지지 않도록).
export async function getNotificationBadgeCount(): Promise<number> {
  try {
    const { counts } = await getNotifications();
    return counts.badge;
  } catch {
    return 0;
  }
}
