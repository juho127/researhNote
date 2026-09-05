# 연구노트 (Research Note)

연구실 논문 프로젝트의 **진행 상황을 날짜별로 기록**하고, **같은 카테고리(팀) 연구원끼리 공유·검토**하며, 각자 쓰는 **AI 도구(Claude Code 등)가 MCP 로 직접 기록**하는 연구 기록 시스템입니다. Cloudflare Workers + D1 위에서 서버 관리 없이 동작하며, 연구책임자가 이 리포를 그대로 가져다 자기 연구실용으로 배포할 수 있습니다.

```
연구원 브라우저 ──┐
Claude Code(MCP) ─┼──▶  Cloudflare Worker  ──▶  D1 (SQLite)
Cursor / Codex ───┘     ├─ /            SPA (정적)
                        ├─ /api/*       REST API (Bearer 토큰)
                        ├─ /mcp         원격 MCP 서버 (Streamable HTTP)
                        └─ /SKILL.md    AI 도구용 사용 지침
```

## 무엇을 할 수 있나

| 역할 | 기능 |
|---|---|
| **연구원** | 프로젝트(논문) 생성 → 날짜별 진행 기록(마크다운) → 단계별 누적 정리 → 할 일 관리 → 검토 요청 → 보고서(HTML/PDF/Markdown) |
| **같은 카테고리 팀원** | 칸반 보드로 서로의 진행 파악, 기록에 코멘트, 팀 활동 피드, 팀 보고서 |
| **리드(카테고리 책임자)** | 팀원 기록 승인/수정요청, 팀원 프로젝트에 기록·할 일 추가, 담당자 변경 |
| **관리자(연구책임자)** | 카테고리·연구원·토큰 관리, 전체 대시보드(단계 분포·활동 추이·정체 연구원·검토 대기·마감) |
| **AI 도구** | MCP 도구 19종으로 whoami → get_project → log_progress → update_stage 자동 기록, 팀 피드 조회, 보고서 초안 |

### 논문 흐름대로 기록한다

프로젝트마다 6개 단계가 있고, 기록은 단계에 붙습니다. 단계별 **누적 정리**는 논문 해당 절의 뼈대가 되고, 보고서는 이 순서로 생성됩니다.

| 단계 | id | 무엇을 정리하나 |
|---|---|---|
| 기획 | `planning` | 연구 질문·가설·기여점·범위 |
| 리서치 | `literature` | 선행연구·문헌 정리·차별점 |
| 관련기법 | `method` | 적용 기법·모델·실험 설계 |
| 실험결과 | `experiment` | 데이터·실험 결과·분석 |
| 논문작성 | `writing` | 초고·그림·표·구성 |
| 검토·투고 | `review` | 내부 검토·수정·투고·리뷰 대응 |

## 빠른 시작 (연구책임자, 약 10분)

사전 준비: Node.js 20+, [Cloudflare 계정](https://dash.cloudflare.com/sign-up) (무료 플랜으로 충분), `git`.

```bash
git clone https://github.com/juho127/researhNote.git research-note
cd research-note
npm install
npx wrangler login          # 브라우저에서 Cloudflare 로그인 (또는 CLOUDFLARE_API_TOKEN 환경변수)
npm run setup               # D1 생성 → 마이그레이션 → 배포 → 관리자 토큰 발급
```

`setup` 이 끝나면 **배포 URL** 과 **관리자 토큰**이 출력됩니다. 토큰은 해시로만 저장되므로 이때 복사해 두세요.

1. 배포 URL 에 접속해 관리자 토큰으로 로그인
2. **[관리자] → 카테고리** 에서 연구 그룹 생성 (예: "LLM 응용")
3. **[관리자] → 연구원** 에서 연구원 등록: 이름 · 소속 카테고리(리드 여부) · "등록과 동시에 토큰 발급"
4. 표시된 토큰과 접속 URL 을 연구원에게 전달 ("안내문 복사" 버튼)
5. 연구원은 로그인 후 **[설정]** 에서 자기 AI 도구 연동 명령을 복사해 실행

워커 이름을 바꾸려면 `npm run setup -- --name my-lab-notes --db my-lab-notes-db`. 기관명·단계 라벨 커스터마이즈는 [커스터마이즈](#커스터마이즈) 참고.

> `wrangler.jsonc` 의 `database_id` 는 setup 이 자동으로 채웁니다. 이후 코드 변경 배포는 `npm run deploy` 만 하면 됩니다.

## 연구원 사용 흐름

1. **홈**: "오늘의 기록" 폼에 지금 한 일을 바로 기록. 내 프로젝트 카드(단계 진행 바·마지막 기록·할 일 수)와 팀 활동 피드.
2. **팀 페이지**: 단계별 칸반 보드 / 목록 / 구성원 / 검토 대기 / 활동. 팀원 프로젝트를 열어 기록을 읽고 코멘트.
3. **프로젝트 페이지**
   - 상단 단계 스테퍼(클릭 → 단계별 정리)
   - **타임라인**: 날짜별 기록. 단계·검토 상태 필터. 수정/삭제/검토 요청, 코멘트 스레드
   - **단계별 정리**: 6개 단계의 누적 결론(마크다운). 상태(예정/진행 중/완료), "현재 단계로"
   - **할 일**: 체크리스트, 담당·기한·진행 중 표시
   - **보고서**: 기간 지정 → HTML(새 탭, 인쇄/PDF 저장 버튼) 또는 Markdown 다운로드
4. **설정**: 내 정보, AI 도구 연동 명령(토큰 자동 삽입, 기본 가림), 로그아웃

기록 본문은 마크다운이며 표·코드·체크박스·링크를 지원합니다. 권장 구조: `## 한 일 / ## 결과 / ## 다음 할 일 / ## 메모`.

## AI 도구 연동 (웹 MCP)

이 서버는 **원격 MCP 서버**를 내장합니다. 연구원 컴퓨터에 아무것도 설치하지 않고, AI 도구에 URL 과 토큰만 등록하면 됩니다.

### Claude Code (권장)

```bash
claude mcp add --transport http research-note https://<배포URL>/mcp --header "Authorization: Bearer rn_xxx"
```

이후 `claude` 안에서:

- "오늘 한 실험 결과를 연구노트에 기록해" → `whoami` → `get_project` → `log_progress`
- "실험 단계 정리를 지금 결과로 갱신해" → `update_stage`
- "팀원들 이번 주 뭐 했는지 보여줘" → `team_feed`
- "이 프로젝트 주간 보고서 초안 만들어" → `get_report`

서버가 `initialize` 응답의 `instructions` 로 사용 원칙을 전달하므로 스킬 없이도 동작합니다. 더 정교한 절차와 `/research-note:log` 같은 슬래시 커맨드가 필요하면 **플러그인**을 설치하세요 (`integrations/claude-code/research-note`):

```bash
# 환경변수 (PowerShell: $env:RESEARCH_NOTE_URL="..." )
export RESEARCH_NOTE_URL=https://<배포URL>
export RESEARCH_NOTE_TOKEN=rn_xxx
# claude 안에서
/plugin marketplace add juho127/researhNote
/plugin install research-note@research-note
```

플러그인은 MCP 서버 등록 + 스킬(`skills/research-note/SKILL.md`) + 커맨드 4종(`/research-note:log`, `:status`, `:review`, `:report`)을 제공합니다. 스킬 파일만 쓰고 싶으면 `https://<배포URL>/SKILL.md` 를 `~/.claude/skills/research-note/SKILL.md` 로 저장하면 됩니다.

### 다른 도구

Cursor · Claude Desktop(mcp-remote) · Codex CLI · Gemini CLI 설정 예시는 웹 **[설정]** 페이지가 토큰을 채워 보여줍니다. 명세는 [docs/MCP.md](docs/MCP.md).

### MCP 도구 목록

`whoami` `list_projects` `get_project` `create_project` `update_project` `log_progress` `list_entries` `get_entry` `update_entry` `update_stage` `list_tasks` `add_task` `update_task` `add_comment` `set_review` `team_feed` `team_overview` `search` `get_report` + 프롬프트 `log_today` `weekly_review` `research_note_guide` + 리소스 `research-note://guide`, `research-note://me`, `research-note://project/{id}`

## 보고서

- 프로젝트 보고서: 메타 → 연구 요약 → **단계별 정리(논문 순서)** → 할 일 → **날짜별 기록 + 검토 코멘트**
- 팀 보고서: 카테고리의 프로젝트별 진행 바 + 기간 내 기록 요약
- 형식: `?format=html`(기본, 인쇄 CSS 포함 → 브라우저 "PDF로 저장") · `md` · `json`. `from`/`to` 로 기간 지정.
- MCP `get_report` 는 마크다운을 반환하므로 AI 가 주간 보고 초안을 바로 씁니다.

## 권한 모델

| 동작 | 관리자 | 카테고리 리드 | 프로젝트 담당자 | 같은 카테고리 구성원 | 외부 |
|---|---|---|---|---|---|
| 프로젝트 보기·기록 읽기 | ✓ | ✓ | ✓ | ✓ | ✗ |
| 코멘트 | ✓ | ✓ | ✓ | ✓ | ✗ |
| 기록 작성 | ✓ | ✓ | ✓ | ✗ | ✗ |
| 기록 수정·삭제 | ✓ | 본인 것 | 본인 것 | 본인 것 | ✗ |
| 프로젝트 메타·단계 정리 수정 | ✓ | ✓ | ✓ | ✗ | ✗ |
| 검토 요청 | ✓ | ✓ | 작성자 | ✗ | ✗ |
| 승인 / 수정 요청 | ✓ | ✓ | ✗ | ✗ | ✗ |
| 할 일 추가·갱신 | ✓ | ✓ | ✓ | ✓ | ✗ |
| 카테고리·연구원·토큰 관리 | ✓ | ✗ | ✗ | ✗ | ✗ |

토큰은 `rn_` 접두 40자, 서버에는 SHA-256 해시만 저장. 회수 즉시 웹·MCP 접근 차단. 관리자 페이지에서 "마지막 사용" 을 볼 수 있습니다.

## 로컬 개발

```bash
npm install
npm run migrate:local                       # 로컬 D1 스키마
node scripts/bootstrap-admin.mjs --local    # 로컬 관리자 토큰
npm run dev                                 # http://127.0.0.1:8787
BASE_URL=http://127.0.0.1:8787 ADMIN_TOKEN=rn_... npm test        # 54개 E2E 스모크
BASE_URL=http://127.0.0.1:8787 ADMIN_TOKEN=rn_... npm run seed:demo   # 데모 데이터
```

`.dev.vars` 의 `ADMIN_TOKEN` 은 로컬 부트스트랩용 시크릿입니다 (배포본에도 `npx wrangler secret put ADMIN_TOKEN` 으로 넣으면 그 값으로 관리자 로그인 가능 — DB 관리자를 만든 뒤에는 지우는 것을 권장).

## 커스터마이즈

- **기관명·마크·앱 이름·타임존**: `wrangler.jsonc` 의 `vars` (`APP_NAME`, `ORG_NAME`, `ORG_SUB`, `ORG_MARK`, `APP_TZ`)
- **단계 이름/설명**: `src/env.ts` 의 `STAGE_LABELS`, `STAGE_HINTS` (id 는 유지 권장)
- **디자인**: `public/styles.css` 상단 CSS 변수 (HUFS 팔레트: navy/teal/gold)
- **자동 배포**: `.github/workflows/deploy.yml` — 리포 Secrets 에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, Variables 에 `CF_AUTO_DEPLOY=true`

## 리포 구성

```
src/
  index.ts          라우팅 엔트리 (/api, /mcp, /SKILL.md, 정적)
  routes.ts         REST 라우터
  mcp.ts            MCP 서버 (JSON-RPC, tools/prompts/resources)
  skill.ts          AI 지침 (SKILL.md 임포트)
  env.ts            타입·단계 정의
  lib/              auth(토큰), db, http, markdown, id, time
  services/         projects, entries(코멘트·검토), tasks, admin, feed, report
public/             SPA (빌드 없음, ES 모듈)
  js/core.js        API 클라이언트·DOM·마크다운·모달
  js/pages/         login, home, team, project, admin, settings
migrations/         D1 스키마
scripts/            setup, bootstrap-admin, seed-demo
tests/smoke.mjs     E2E 스모크 테스트
integrations/claude-code/research-note/   Claude Code 플러그인 (스킬·커맨드·.mcp.json)
docs/               API · MCP · 데이터 모델 · 관리자/연구원 가이드
```

문서: [API](docs/API.md) · [MCP](docs/MCP.md) · [데이터 모델](docs/DATA_MODEL.md) · [관리자 가이드](docs/ADMIN_GUIDE.md) · [연구원 가이드](docs/USER_GUIDE.md)

## FAQ

- **비용?** Cloudflare 무료 플랜: Workers 10만 요청/일, D1 5GB·500만 행 읽기/일. 연구실 규모에서는 무료.
- **PDF 는?** HTML 보고서의 [인쇄 / PDF 저장] → 브라우저 인쇄 대화상자에서 PDF 로 저장. 서버 측 PDF 렌더링(Browser Rendering)은 유료라 채택하지 않았습니다.
- **첨부파일?** 링크(마크다운)로 붙입니다. R2 업로드는 로드맵.
- **토큰을 잃어버리면?** 관리자가 [토큰] 탭에서 회수 후 재발급.
- **여러 연구실이 하나의 배포를 공유?** 카테고리로 분리됩니다. 관리자만 전체를 봅니다.

## 라이선스

MIT — 한국외국어대학교 Global Business & Technology, 배주호 (juho@hufs.ac.kr)
