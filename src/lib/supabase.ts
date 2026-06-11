// 서버 전용 Supabase 클라이언트.
//
// 'server-only' import 로 이 모듈이 클라이언트 번들에 포함되면 빌드가 실패한다.
// → SUPABASE_SERVICE_ROLE_KEY 가 브라우저로 노출되는 일을 원천 차단.
//
// service_role 키를 사용하므로 RLS 를 우회한다.
// (마이그레이션에서 4개 테이블 모두 RLS 활성화 + public 정책 미생성이므로,
//  anon 키로는 접근 불가. 데이터 접근은 반드시 이 서버 클라이언트 경유.)
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL 환경변수가 설정되지 않았습니다. (.env.local 확인)');
}
if (!serviceRoleKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다. (.env.local 확인)');
}

// 모듈 싱글톤
let _client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(url!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _client;
}

// 테이블 미존재 등 흔한 에러를 한국어 메시지로 변환.
// (DDL 은 별도로 적용되므로, 테이블이 아직 없을 때 명확히 안내한다.)
//
// 보안: 내부 DB 에러 원문(컬럼/제약/스키마 정보 등)은 클라이언트로 노출하지 않는다.
//   - 원문은 서버 콘솔에만 로깅하고,
//   - 응답에는 매핑된 안전한 일반 메시지만 반환한다.
export function describeSupabaseError(error: { message?: string; code?: string } | null): string {
  if (!error) return '알 수 없는 오류가 발생했습니다.';
  // 원문은 서버 로그로만 남긴다 (응답에는 포함하지 않음).
  console.error('[supabase]', error.code ?? '', error.message ?? '');

  const msg = error.message ?? '';
  const code = error.code ?? '';
  // PostgREST: 관계(테이블)가 없을 때 PGRST205, Postgres undefined_table 42P01
  if (code === 'PGRST205' || code === '42P01' || /does not exist|could not find the table/i.test(msg)) {
    return 'DB 테이블이 아직 생성되지 않았습니다. supabase/migrations 의 SQL 을 먼저 적용해주세요.';
  }
  // 고유 제약 위반 등 흔한 케이스 → 일반화된 안내
  if (code === '23505') {
    return '이미 존재하는 항목입니다.';
  }
  if (code === '23503') {
    return '참조 무결성 오류가 발생했습니다. (연결된 데이터를 확인해주세요)';
  }
  // 그 외에는 내부 메시지를 노출하지 않고 일반 메시지 반환
  return '데이터베이스 처리 중 오류가 발생했습니다.';
}
