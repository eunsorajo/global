import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';

// 매트릭스 셀(기업 × KPI) 진척도 저장 (upsert).
// 낙관적 업데이트의 서버 반영 엔드포인트.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  let body: {
    companyId?: string;
    kpiDefinitionId?: string;
    value?: string | null;
    achieved?: boolean | null;
    note?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  // 필수 필드 검증
  if (!body.companyId || !body.kpiDefinitionId) {
    return NextResponse.json({ error: 'companyId, kpiDefinitionId 는 필수입니다.' }, { status: 400 });
  }
  if (body.achieved !== undefined && body.achieved !== null && typeof body.achieved !== 'boolean') {
    return NextResponse.json({ error: 'achieved 는 boolean 또는 null 이어야 합니다.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('kpi_progress')
    .upsert(
      {
        company_id: body.companyId,
        kpi_definition_id: body.kpiDefinitionId,
        value: body.value ?? null,
        achieved: body.achieved ?? null,
        note: body.note ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id,kpi_definition_id' }
    )
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: describeSupabaseError(error) }, { status: 500 });
  }
  return NextResponse.json({ progress: data });
}
