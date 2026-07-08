import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';
import { requireActiveUser, assertPartnerAccess, HttpError, errorResponse } from '@/lib/rbac';
import { getPartnerAgreement } from '@/lib/kpi-data';

// 공통 KPI 3종 템플릿 1클릭 채우기.
// 협약서 미제출(KPI 미정의) 파트너 온보딩용.
// (참가기업 수는 성과지표가 아니라 제외 — 참여기업 수는 파트너 상세/대시보드에 별도 표시)
const COMMON_KPI_TEMPLATE = [
  { name: '사전 컨설팅', target: '기업별 2회 이상' },
  { name: '비즈니스 매칭', target: '기업별 3건 이상' },
  { name: '사후 관리', target: '종료 후 3개월 이상 1:1' },
] as const;

export async function POST(req: NextRequest, ctx: { params: Promise<{ partnerId: string }> }) {
  let session;
  try {
    session = await requireActiveUser();
  } catch (e) {
    return errorResponse(e);
  }

  const { partnerId } = await ctx.params;
  if (!partnerId) return NextResponse.json({ error: 'partnerId 가 필요합니다.' }, { status: 400 });

  // 권한: 대상 파트너 접근 + (partner 면) 협약 미제출 상태일 때만.
  try {
    assertPartnerAccess(session, partnerId);
    if (session.role !== 'admin') {
      const { exists, submitted } = await getPartnerAgreement(partnerId);
      if (!exists) return NextResponse.json({ error: '해당 파트너를 찾을 수 없습니다.' }, { status: 404 });
      if (submitted) {
        throw new HttpError(403, '협약이 제출되어 KPI 항목을 추가할 수 없습니다. 관리자에게 문의해주세요.');
      }
    }
  } catch (e) {
    return errorResponse(e);
  }

  const supabase = getSupabaseAdmin();

  // 이미 정의된 최대 순번 이후로 채운다 (멱등 보장은 안 되지만 중복 항목명은 건너뜀)
  const { data: existing, error: exErr } = await supabase
    .from('kpi_definitions')
    .select('kpi_order, name')
    .eq('partner_id', partnerId);
  if (exErr) return NextResponse.json({ error: describeSupabaseError(exErr) }, { status: 500 });

  const existingNames = new Set((existing ?? []).map((d) => d.name));
  let nextOrder = (existing ?? []).reduce((m, d) => Math.max(m, d.kpi_order), 0);

  const rows = COMMON_KPI_TEMPLATE.filter((t) => !existingNames.has(t.name)).map((t) => ({
    partner_id: partnerId,
    kpi_order: ++nextOrder,
    category: '공통' as const,
    name: t.name,
    target: t.target,
  }));

  if (rows.length === 0) {
    return NextResponse.json({ inserted: 0, message: '이미 공통 KPI 3종이 모두 존재합니다.' });
  }

  const { data, error } = await supabase.from('kpi_definitions').insert(rows).select('*');
  if (error) return NextResponse.json({ error: describeSupabaseError(error) }, { status: 500 });
  return NextResponse.json({ inserted: data?.length ?? 0, definitions: data });
}
