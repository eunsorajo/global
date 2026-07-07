// 서버 전용 비밀번호 해시/검증 (파트너 로그인용).
// bcryptjs — 순수 JS 구현이라 네이티브 빌드가 없어 Vercel 등 어디서나 동작.
import 'server-only';
import bcrypt from 'bcryptjs';

export const MIN_PASSWORD_LENGTH = 8;

export function isValidPassword(plain: string): boolean {
  return typeof plain === 'string' && plain.length >= MIN_PASSWORD_LENGTH;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash || !plain) return false;
  return bcrypt.compare(plain, hash);
}
