import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';

// 참여기업 추가
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  let body: {
    partnerId?: string;
    name?: string;
    sector?: string | null;
    description?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  if (!body.partnerId || !body.name || !body.name.trim()) {
    return NextResponse.json({ error: 'partnerId 와 기업명(name)은 필수입니다.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // 파트너 내 마지막 순번 + 1
  const { data: maxRows, error: maxErr } = await supabase
    .from('companies')
    .select('no')
    .eq('partner_id', body.partnerId)
    .order('no', { ascending: false })
    .limit(1);
  if (maxErr) return NextResponse.json({ error: describeSupabaseError(maxErr) }, { status: 500 });
  const nextNo = (maxRows?.[0]?.no ?? 0) + 1;

  const { data, error } = await supabase
    .from('companies')
    .insert({
      partner_id: body.partnerId,
      no: nextNo,
      name: body.name.trim(),
      sector: body.sector ?? null,
      description: body.description ?? null,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: describeSupabaseError(error) }, { status: 500 });
  return NextResponse.json({ company: data });
}
