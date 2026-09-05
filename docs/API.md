# REST API

- Base: `https://<배포URL>`
- 인증: 모든 `/api/*` 요청에 `Authorization: Bearer rn_...` (또는 `X-API-Key`). 실패 시 `401 {error:"unauthorized"}`
- 요청/응답 JSON (UTF-8). 날짜는 `YYYY-MM-DD`, 시각은 ISO 8601 UTC.
- 오류 형식: `{ "error": "<code>", "message": "<한국어 설명>" }` — `bad_request` 400, `unauthorized` 401, `forbidden` 403, `not_found` 404, `too_large` 413, `internal` 500
- 선택 헤더 `X-Client: web|mcp|api` — 활동 로그의 `source` 에 기록 (기본 `api`)
- CORS: `*` 허용 (Bearer 인증이므로 쿠키 없음)

## 공통

| Method | Path | 설명 |
|---|---|---|
| GET | `/health` | 상태 확인 (인증 불필요) |
| GET | `/api/me` | 내 정보·소속·내 프로젝트·단계 정의·앱 설정 |
| GET | `/api/categories` | 내 소속 카테고리 (관리자: 전체) |
| GET | `/api/categories/:id` | 카테고리 상세: `category, members[], projects[], activity[], review_queue[], my_role` |
| GET | `/api/categories/:id/board` | 칸반: `columns[{stage, projects[]}], paused[], done[]` |
| GET | `/api/categories/:id/report?format=html|md|json&from=&to=&download=1` | 팀 보고서 |
| GET | `/api/feed?category_id=&project_id=&limit=&before=` | 활동 피드 (내 소속 전체 또는 지정) |
| GET | `/api/search?q=&category_id=&limit=` | `{projects[], entries[]}` |

## 프로젝트

| Method | Path | Body / Query |
|---|---|---|
| GET | `/api/projects` | `?category_id= &mine=1 &owner_id= &status=active|paused|done|archived|all &q= &limit=` |
| POST | `/api/projects` | `{category_id*, title*, summary, stage, target_venue, deadline, tags(문자열|배열), owner_id}` → 201 상세 |
| GET | `/api/projects/:id` | 상세: 카드 필드 + `stages[6], tasks[], members[], recent_entries[], can_edit, can_review` |
| PATCH | `/api/projects/:id` | 위 필드 중 일부. `stage` 변경 시 해당 단계가 todo 면 doing 으로. `owner_id`(리드+), `category_id`(관리자) |
| DELETE | `/api/projects/:id` | 보관(status=archived). 데이터 유지 |
| PUT | `/api/projects/:id/stages/:stage` | `{status: todo|doing|done, summary(마크다운, 덮어쓰기), set_current: bool}` → 상세 |
| GET | `/api/projects/:id/report?format=html|md|json&from=&to=&comments=0&download=1` | 프로젝트 보고서 |

프로젝트 카드 필드: `id, category_id, category_name, owner_id, owner_name, title, summary, stage, status, target_venue, deadline, tags, created_at, updated_at, entry_count, last_entry_date, last_entry_at, open_tasks, review_requested, stage_done`

## 기록 (entries)

| Method | Path | Body / Query |
|---|---|---|
| GET | `/api/entries` | `?project_id= &category_id= &mine=1 &author_id= &stage= &since= &until= &review_status= &q= &limit= &offset= &brief=1` |
| GET | `/api/projects/:id/entries` | 위와 동일 (project 고정) |
| POST | `/api/projects/:id/entries` | `{title*, content(md), stage(기본: 프로젝트 현재 단계), date(기본: 오늘 KST), review_status: none|requested}` → 201 |
| GET | `/api/entries/:id` | 상세 + `comments[]` |
| PATCH | `/api/entries/:id` | `{title, content, stage, date, review_status}` (작성자·관리자) |
| DELETE | `/api/entries/:id` | 삭제 (코멘트 함께) |
| POST | `/api/entries/:id/review` | `{status: none|requested|changes_requested|approved, note}` — 승인/수정요청은 리드·관리자. note 는 코멘트로 저장 |
| GET | `/api/entries/:id/comments` | 코멘트 목록 |
| POST | `/api/entries/:id/comments` | `{content*, kind: comment|approve|request_changes}` → 201 (approve/request_changes 는 검토 상태도 변경) |
| DELETE | `/api/comments/:id` | 작성자·관리자 |

기록 필드: `id, project_id, project_title, category_id, author_id, author_name, date, stage, title, content, source(web|mcp|api), review_status, comment_count, created_at, updated_at, can_edit`

## 할 일 (tasks)

| Method | Path | Body |
|---|---|---|
| GET | `/api/projects/:id/tasks?status=` | |
| POST | `/api/projects/:id/tasks` | `{title*, status, assignee_id, due, stage}` |
| PATCH | `/api/tasks/:id` | 위 필드 (done → `done_at` 기록) |
| DELETE | `/api/tasks/:id` | 생성자·담당자·리드·관리자 |

## 관리자 (`role=admin` 필요)

| Method | Path | Body / 설명 |
|---|---|---|
| GET | `/api/admin/overview` | `counts, by_stage, by_category[], per_user[], daily_activity[], review_queue[], deadlines[]` |
| GET | `/api/admin/activity?category_id=&actor_id=&limit=&before=` | 활동 로그 |
| GET | `/api/admin/categories?all=1` | 보관 포함 |
| POST | `/api/admin/categories` | `{name*, description, color, id}` |
| PATCH | `/api/admin/categories/:id` | `{name, description, color, archived: bool}` |
| GET | `/api/admin/users` | 사용자 + `memberships[], token_count, active_tokens, project_count, entry_count, last_entry_at` |
| POST | `/api/admin/users` | `{name*, id, email, role: admin|member, note, categories: ["cat"] | [{category_id, role: lead|member}], issue_token: bool}` → `{user, token?, token_hint?}` |
| PATCH | `/api/admin/users/:id` | `{name, email, role, note, disabled: bool, categories(전체 교체)}` |
| PUT | `/api/admin/users/:id/memberships/:cat` | `{role: lead|member}` |
| DELETE | `/api/admin/users/:id/memberships/:cat` | |
| GET | `/api/admin/tokens?user_id=` | `id, user_id, user_name, hint, label, created_at, last_used_at, revoked_at` |
| POST | `/api/admin/tokens` | `{user_id*, label}` → `{id, token(1회 표시), hint}` |
| POST | `/api/admin/tokens/:id/revoke` | 회수 |

## 예시

```bash
# 기록 추가
curl -X POST https://<URL>/api/projects/prj_abc/entries \
  -H "Authorization: Bearer rn_xxx" -H "Content-Type: application/json" \
  -d '{"title":"baseline 완료, acc 0.91","content":"## 결과\n| 모델 | acc |\n|---|---|\n| A | 0.91 |","stage":"experiment"}'

# 단계 정리 갱신 + 현재 단계로
curl -X PUT https://<URL>/api/projects/prj_abc/stages/experiment \
  -H "Authorization: Bearer rn_xxx" -H "Content-Type: application/json" \
  -d '{"status":"doing","summary":"## 실험\n- baseline 0.91","set_current":true}'

# 마크다운 보고서
curl -H "Authorization: Bearer rn_xxx" "https://<URL>/api/projects/prj_abc/report?format=md&from=2026-09-01"
```

Python:

```python
import requests
S = requests.Session(); S.headers["Authorization"] = "Bearer rn_xxx"
BASE = "https://<URL>"
me = S.get(f"{BASE}/api/me").json()
pid = me["my_projects"][0]["id"]
S.post(f"{BASE}/api/projects/{pid}/entries", json={"title": "실험 3 완료", "content": "## 결과\n- F1 0.83", "stage": "experiment"})
```
