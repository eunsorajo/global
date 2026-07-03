// 서버 전용 매직링크 토큰 발급/검증 계층.
// 토큰 원문은 저장하지 않고 SHA-256 해시만 DB(login_tokens)에 둔다. 1회용·단기 만료.
import 'server-only';
import crypto from 'node:crypto';
import { getSupabaseAdmin, describeSupabaseError } from '@/lib/supabase';

const TTL_MINUTES = 15; // 링크 유효시간
export const MAX_REQUESTS_PER_WINDOW = 5; // 이메일당 재발송 제한
export const RATE_WINDOW_MINUTES = 10;

export class MagicLinkError extends Error {}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// 최근 발급 건수 (rate limit 용).
export async function recentTokenCount(email: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - RATE_WINDOW_MINUTES * 60_000).toISOString();
  const { count, error } = await supabase
    .from('login_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('email', normalizeEmail(email))
    .gt('created_at', since);
  if (error) throw new MagicLinkError(describeSupabaseError(error));
  return count ?? 0;
}

// 새 토큰 발급 → 원문 반환(메일 링크에 실림). 해시만 저장.
export async function createLoginToken(email: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const normalized = normalizeEmail(email);

  // 이 이메일의 만료된 토큰은 정리(테이블 비대 방지).
  await supabase.from('login_tokens').delete().eq('email', normalized).lt('expires_at', new Date().toISOString());

  const raw = crypto.randomBytes(32).toString('base64url');
  const { error } = await supabase.from('login_tokens').insert({
    email: normalized,
    token_hash: hashToken(raw),
    expires_at: new Date(Date.now() + TTL_MINUTES * 60_000).toISOString(),
  });
  if (error) throw new MagicLinkError(describeSupabaseError(error));
  return raw;
}

// 토큰 검증 + 1회 소비(원자적). 유효하면 true.
// used_at 이 null 이고 만료 전인 행만 used_at 을 세팅하며, 갱신된 행이 있어야 성공.
// (동시 요청/재사용 경합에서도 한 번만 통과)
export async function consumeLoginToken(email: string, raw: string): Promise<boolean> {
  if (!email || !raw) return false;
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('login_tokens')
    .update({ used_at: nowIso })
    .eq('email', normalizeEmail(email))
    .eq('token_hash', hashToken(raw))
    .is('used_at', null)
    .gt('expires_at', nowIso)
    .select('id')
    .maybeSingle();
  if (error) throw new MagicLinkError(describeSupabaseError(error));
  return Boolean(data);
}
