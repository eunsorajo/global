import { NextResponse } from 'next/server';

// 이 라우트는 Vercel Cron (매일 오전 9시 KST) 또는 수동으로 호출합니다.
// vercel.json에 cron 설정 추가 필요.

export async function GET() {
  // TODO: Supabase 연동 후 실제 쿼리로 교체
  // 아래는 로직 설계:
  //
  // 1. followups 테이블에서 status IN ('pending', 'in_progress')이고
  //    due_date < today인 항목 조회
  // 2. 해당 항목의 assignee_id로 notifications 테이블에 INSERT
  //    type: 'followup_overdue', title: '팔로업 기한이 초과되었습니다'
  // 3. followups.status를 'overdue'로 UPDATE

  return NextResponse.json({ message: 'overdue check scheduled — Supabase 연동 후 활성화' });
}
