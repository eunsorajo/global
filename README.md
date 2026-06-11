# Partner Network

해외 액셀러레이팅(AC) 파트너의 **KPI 관리**와 **회의록 운영**을 위한 내부용 웹 애플리케이션.
파트너 13곳 / 참여기업 71곳 / KPI 46개를 한 곳에서 관리하고, 회의록·팔로업을 정리하며, 현황을 엑셀로 내보낸다.

- 스택: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4
- 인증: NextAuth v5 (Google OAuth, 허용된 계정만)
- 데이터: Supabase (Postgres, RLS 활성 · 서버에서 service_role 키로만 접근)
- 빌드: **webpack 모드 고정** (`next build --webpack`) — Turbopack 은 한글 경로에서 패닉(Next 16 버그)

> AI(Gemini/Whisper) 기능은 비용·보안 이유로 전면 제거됨. 회의록은 외부 무료 AI 로 정형화한 텍스트를 **붙여넣기/엑셀 업로드**로 가져온다.

## 메뉴 구성

| 경로 | 설명 |
|------|------|
| `/` | 파트너 목록 (국가·참여기업·최근 회의일·KPI 상태) |
| `/kpi` | KPI 대시보드 (파트너별 달성률 종합 + **엑셀 내보내기**) |
| `/kpi/[partnerId]` | 파트너 상세 — KPI 매트릭스 · 정의/기업 관리 · 회의록 탭 |
| `/meetings/new` | 회의록 가져오기 (붙여넣기 + 엑셀 업로드 → 미리보기 → 저장) |
| `/calendar` | 회의 일정 (Google Calendar 연동) |
| `/notifications` | 알림 — 팔로업 기한 초과/임박, KPI 미정의 파트너 (조회 시 실시간 계산) |

주요 API: `/api/meetings/parse`(파싱) · `/api/meetings`(저장/조회) · `/api/followups/[id]`(상태 변경) ·
`/api/kpi/export`(현황 .xlsx) · `/api/followups/check-overdue`(Cron: Supabase keep-alive + 기한초과 집계).

## 데이터 모델

Supabase 6개 테이블 (모두 RLS 활성, public 정책 없음 → 서버 service_role 경유):
`partners` · `companies` · `kpi_definitions` · `kpi_progress` · `meetings` · `followups`

마이그레이션 SQL: `supabase/migrations/` (`001_kpi_schema.sql`, `002_meetings.sql`).

## 로컬 실행

1. 의존성 설치
   ```bash
   npm install
   ```
2. 환경변수 설정 — `env.example` 을 복사해 `.env.local` 작성
   ```bash
   cp env.example .env.local
   # GOOGLE_CLIENT_ID/SECRET, AUTH_SECRET, NEXT_PUBLIC_SUPABASE_URL,
   # NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY 채우기
   ```
3. 개발 서버 실행 (webpack 모드)
   ```bash
   npm run dev
   ```
   http://localhost:3000 접속 → Google 로그인.

빌드 확인:
```bash
npm run build   # next build --webpack (Turbopack 사용 금지)
```

## 시드 (초기 데이터 적재)

마이그레이션 적용 후, 파트너/기업/KPI 초기 데이터를 넣는다:
```bash
node scripts/seed.mjs
```
> `.env.local` 의 Supabase 값을 사용한다. 운영 DB 에는 이미 시드 완료 상태.

## 배포 (Vercel)

- **`main` 브랜치에 푸시 → Vercel 자동 배포** (main = 프로덕션).
- 배포 전 Vercel 대시보드에 환경변수(위 6종)를 먼저 등록할 것. 누락 시 빌드/런타임 실패.
- 절차:
  1. 로컬 `npm run build` 통과 확인
  2. `git push origin main`
  3. Vercel 자동 빌드·배포
  4. 프로덕션 URL 에서 로그인 / 파트너목록 / KPI / 회의록 가져오기 동작 확인
- `vercel.json` 의 Cron 이 매일 `/api/followups/check-overdue` 를 호출 (Supabase 무료 티어 keep-alive).
  `CRON_SECRET` 을 설정하면 해당 라우트가 `Authorization: Bearer` 헤더를 검증한다 (선택).

## 운영 메모

- Supabase 무료 티어는 7일 무활동 시 일시정지 → Cron keep-alive 로 방지.
- 백업: 자동 백업 7일. 월 1회 `/kpi` 의 [엑셀 내보내기] 로 수동 백업 권장.
