import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

// Vercel Cron (vercel.json: 매일 00:00 UTC) 으로 호출됩니다.
//
// 역할:
//   1) Supabase keep-alive — partners 테이블 count 1회 조회.
//      (무료 티어는 7일간 활동이 없으면 프로젝트가 일시정지되므로 주기적 핑이 필요)
//   2) (모니터링용) 기한 초과 팔로업 수를 응답에 포함.
//
// 알림은 "조회 시 계산"하므로(notification-data.ts) 여기서 적재하지 않는다.
//
// 인증:
//   CRON_SECRET 환경변수가 설정된 경우 Authorization: Bearer <secret> 검증.
//   미설정 시 통과(Vercel Cron 기본 호출과 호환).

export const dynamic = 'force-dynamic';

function todayStr(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const supabase = getSupabaseAdmin();

  // 1) keep-alive: partners count (head 조회로 데이터 전송 최소화)
  const partnersRes = await supabase
    .from('partners')
    .select('id', { count: 'exact', head: true });
  if (partnersRes.error) {
    console.error('[cron/check-overdue] keep-alive 실패', partnersRes.error);
    return NextResponse.json({ ok: false, error: 'keep-alive query failed' }, { status: 500 });
  }

  // 2) 모니터링: 기한 초과 미완료 팔로업 수
  let overdueCount: number | null = null;
  const overdueRes = await supabase
    .from('followups')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'completed')
    .not('due_date', 'is', null)
    .lt('due_date', todayStr());
  if (overdueRes.error) {
    console.error('[cron/check-overdue] overdue 집계 실패', overdueRes.error);
  } else {
    overdueCount = overdueRes.count ?? 0;
  }

  return NextResponse.json({
    ok: true,
    keepAlive: true,
    partnerCount: partnersRes.count ?? 0,
    overdueFollowups: overdueCount,
    checkedAt: new Date().toISOString(),
  });
}
