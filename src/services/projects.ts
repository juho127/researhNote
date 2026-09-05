import type { AuthContext, Env, Stage } from "../env";
import { STAGES, STAGE_LABELS, PROJECT_STATUSES, STAGE_STATUSES, isStage } from "../env";
import { bad, forbidden, isDateStr, oneOf, str, strLimited, bool, clampInt } from "../lib/http";
import { newId } from "../lib/id";
import { nowIso } from "../lib/time";
import { categoryRole, requireCategoryMember } from "../lib/auth";
import { ensureStageRows, getProjectForRead, getProjectForWrite, logActivity, touchProject, type ProjectRow } from "../lib/db";

export interface ProjectCard extends ProjectRow {
  owner_name: string;
  category_name: string;
  entry_count: number;
  last_entry_date: string | null;
  last_entry_at: string | null;
  open_tasks: number;
  review_requested: number;
  stage_done: number; // 완료된 단계 수 (0~6)
}

export interface ListOpts {
  category_id?: string;
  owner_id?: string;
  status?: string; // active | paused | done | archived | all
  q?: string;
  limit?: number;
}

const CARD_SELECT = `
  SELECT p.*, u.name AS owner_name, c.name AS category_name,
    (SELECT COUNT(*) FROM entries e WHERE e.project_id = p.id) AS entry_count,
    (SELECT MAX(e.date) FROM entries e WHERE e.project_id = p.id) AS last_entry_date,
    (SELECT MAX(e.created_at) FROM entries e WHERE e.project_id = p.id) AS last_entry_at,
    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status != 'done') AS open_tasks,
    (SELECT COUNT(*) FROM entries e WHERE e.project_id = p.id AND e.review_status = 'requested') AS review_requested,
    (SELECT COUNT(*) FROM project_stages s WHERE s.project_id = p.id AND s.status = 'done') AS stage_done
  FROM projects p
  JOIN users u ON u.id = p.owner_id
  JOIN categories c ON c.id = p.category_id`;

/** 열람 가능한 프로젝트 목록 (관리자: 전체, 그 외: 소속 카테고리) */
export async function listProjects(env: Env, ctx: AuthContext, opts: ListOpts = {}): Promise<ProjectCard[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.category_id) {
    requireCategoryMember(ctx, opts.category_id);
    where.push("p.category_id = ?");
    params.push(opts.category_id);
  } else if (!ctx.isAdmin) {
    const ids = ctx.memberships.map((m) => m.category_id);
    if (!ids.length) return [];
    where.push(`p.category_id IN (${ids.map(() => "?").join(",")})`);
    params.push(...ids);
  }
  if (opts.owner_id) {
    where.push("p.owner_id = ?");
    params.push(opts.owner_id);
  }
  const status = opts.status || "active";
  if (status !== "all") {
    if (!(PROJECT_STATUSES as readonly string[]).includes(status)) bad("status 값이 올바르지 않습니다");
    where.push("p.status = ?");
    params.push(status);
  }
  if (opts.q) {
    const needle = str(opts.q, 200).toLowerCase();
    where.push("(instr(lower(p.title), ?) > 0 OR instr(lower(p.summary), ?) > 0 OR instr(lower(p.tags), ?) > 0)");
    params.push(needle, needle, needle);
  }
  const limit = clampInt(opts.limit, 200, 1, 500);
  const sql = `${CARD_SELECT}
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY p.updated_at DESC
    LIMIT ?`;
  params.push(limit);
  const rs = await env.DB.prepare(sql).bind(...params).all<ProjectCard>();
  return rs.results ?? [];
}

export interface StageRow {
  stage: Stage;
  status: string;
  summary: string;
  updated_at: string;
  updated_by: string | null;
  entry_count?: number;
}

export interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  status: string;
  assignee_id: string | null;
  assignee_name?: string | null;
  due: string | null;
  stage: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  done_at: string | null;
}

export interface EntryBrief {
  id: string;
  date: string;
  stage: Stage;
  title: string;
  author_id: string;
  author_name: string;
  source: string;
  review_status: string;
  comment_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectDetail extends ProjectCard {
  stages: StageRow[];
  tasks: TaskRow[];
  members: { id: string; name: string; role: string }[];
  recent_entries: EntryBrief[];
  can_edit: boolean;
  can_review: boolean;
}

export async function getProjectDetail(env: Env, ctx: AuthContext, id: string): Promise<ProjectDetail> {
  const p = await getProjectForRead(env, ctx, id);
  await ensureStageRows(env, id);
  const [cardRs, stagesRs, tasksRs, membersRs, entriesRs] = await env.DB.batch([
    env.DB.prepare(`${CARD_SELECT} WHERE p.id = ?`).bind(id),
    env.DB.prepare(`
      SELECT s.stage, s.status, s.summary, s.updated_at, s.updated_by,
        (SELECT COUNT(*) FROM entries e WHERE e.project_id = s.project_id AND e.stage = s.stage) AS entry_count
      FROM project_stages s WHERE s.project_id = ?`).bind(id),
    env.DB.prepare(`
      SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
      WHERE t.project_id = ?
      ORDER BY CASE t.status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 ELSE 2 END, t.due IS NULL, t.due, t.created_at`).bind(id),
    env.DB.prepare(`
      SELECT u.id, u.name, m.role FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.category_id = ? AND u.disabled_at IS NULL ORDER BY m.role = 'lead' DESC, u.name`).bind(p.category_id),
    env.DB.prepare(`
      SELECT e.id, e.date, e.stage, e.title, e.author_id, u.name AS author_name, e.source, e.review_status, e.created_at, e.updated_at,
        (SELECT COUNT(*) FROM comments c WHERE c.entry_id = e.id) AS comment_count
      FROM entries e JOIN users u ON u.id = e.author_id
      WHERE e.project_id = ? ORDER BY e.date DESC, e.created_at DESC LIMIT 10`).bind(id),
  ]);
  const card = (cardRs.results as ProjectCard[])[0];
  const stageMap = new Map((stagesRs.results as StageRow[]).map((s) => [s.stage, s]));
  const stages = STAGES.map(
    (s) => stageMap.get(s) ?? { stage: s, status: "todo", summary: "", updated_at: p.created_at, updated_by: null, entry_count: 0 }
  );
  const role = categoryRole(ctx, p.category_id);
  return {
    ...card,
    stages,
    tasks: tasksRs.results as TaskRow[],
    members: membersRs.results as ProjectDetail["members"],
    recent_entries: entriesRs.results as EntryBrief[],
    can_edit: role === "admin" || role === "lead" || p.owner_id === ctx.user.id,
    can_review: role === "admin" || role === "lead",
  };
}

export interface ProjectInput {
  category_id?: unknown;
  title?: unknown;
  summary?: unknown;
  stage?: unknown;
  status?: unknown;
  target_venue?: unknown;
  deadline?: unknown;
  tags?: unknown;
  owner_id?: unknown;
}

function normTags(v: unknown): string {
  if (Array.isArray(v)) return v.map((t) => String(t).trim()).filter(Boolean).slice(0, 20).join(",");
  return str(v, 300)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20)
    .join(",");
}

function normDeadline(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (!isDateStr(v)) bad("deadline 은 YYYY-MM-DD 형식이어야 합니다");
  return v;
}

export async function createProject(env: Env, ctx: AuthContext, input: ProjectInput): Promise<ProjectDetail> {
  const categoryId = str(input.category_id, 100);
  if (!categoryId) bad("category_id 가 필요합니다");
  const cat = await env.DB.prepare(`SELECT id FROM categories WHERE id = ? AND archived_at IS NULL`).bind(categoryId).first();
  if (!cat) bad("category_id 가 올바르지 않습니다");
  const role = requireCategoryMember(ctx, categoryId);
  const title = strLimited(input.title, 200, "title");
  if (!title) bad("title 이 필요합니다");
  let stage: Stage = "planning";
  if (input.stage !== undefined) {
    if (!isStage(input.stage)) bad("stage 값이 올바르지 않습니다");
    stage = input.stage;
  }
  const deadline = normDeadline(input.deadline);
  let ownerId = ctx.user.id;
  if (input.owner_id && str(input.owner_id) !== ctx.user.id) {
    if (role !== "admin" && role !== "lead") bad("다른 사람 소유의 프로젝트는 리드·관리자만 만들 수 있습니다");
    const ok = await env.DB.prepare(`SELECT 1 AS x FROM memberships WHERE user_id = ? AND category_id = ?`).bind(str(input.owner_id), categoryId).first();
    if (!ok) bad("owner_id 사용자가 이 카테고리의 구성원이 아닙니다");
    ownerId = str(input.owner_id);
  }
  const id = newId("prj");
  const at = nowIso();
  await env.DB
    .prepare(
      `INSERT INTO projects (id, category_id, owner_id, title, summary, stage, status, target_venue, deadline, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`
    )
    .bind(id, categoryId, ownerId, title, strLimited(input.summary, 2000, "summary"), stage, str(input.target_venue, 200), deadline, normTags(input.tags), at, at)
    .run();
  // 시작 단계(기본 기획)까지의 상태를 흐름 규칙으로 설정: 앞은 완료, 현재는 진행 중, 뒤는 예정
  await moveCurrentStage(env, ctx, { id, category_id: categoryId, owner_id: ownerId, title, summary: "", stage, status: "active", target_venue: "", deadline, tags: "", created_at: at, updated_at: at }, stage, at);
  await logActivity(env, { actor_id: ctx.user.id, category_id: categoryId, project_id: id, action: "project.create", target_id: id, summary: title, source: ctx.source });
  return getProjectDetail(env, ctx, id);
}

export async function updateProject(env: Env, ctx: AuthContext, id: string, input: ProjectInput): Promise<ProjectDetail> {
  const p = await getProjectForWrite(env, ctx, id);
  // 보관된 프로젝트는 상태 복구(status) 외의 수정을 막는다
  if (p.status === "archived" && !ctx.isAdmin && Object.keys(input).some((k) => k !== "status")) forbidden("보관된 프로젝트는 상태를 되돌린 뒤 수정할 수 있습니다");
  const sets: string[] = [];
  const params: unknown[] = [];
  const changes: string[] = [];
  if (input.title !== undefined) {
    const t = strLimited(input.title, 200, "title");
    if (!t) bad("title 은 비울 수 없습니다");
    sets.push("title = ?");
    params.push(t);
    changes.push("제목");
  }
  if (input.summary !== undefined) {
    sets.push("summary = ?");
    params.push(strLimited(input.summary, 2000, "summary"));
    changes.push("요약");
  }
  let moveTo: Stage | null = null;
  if (input.stage !== undefined) {
    if (!isStage(input.stage)) bad("stage 값이 올바르지 않습니다");
    if (input.stage !== p.stage) moveTo = input.stage;
  }
  if (input.status !== undefined) {
    const s = oneOf(input.status, PROJECT_STATUSES, "status");
    sets.push("status = ?");
    params.push(s);
    changes.push(`상태→${s}`);
  }
  if (input.target_venue !== undefined) {
    sets.push("target_venue = ?");
    params.push(str(input.target_venue, 200));
    changes.push("목표 학회/저널");
  }
  if (input.deadline !== undefined) {
    sets.push("deadline = ?");
    params.push(normDeadline(input.deadline));
    changes.push("마감");
  }
  if (input.tags !== undefined) {
    sets.push("tags = ?");
    params.push(normTags(input.tags));
    changes.push("태그");
  }
  if (input.owner_id !== undefined) {
    const role = categoryRole(ctx, p.category_id);
    if (role !== "admin" && role !== "lead") bad("소유자 변경은 리드·관리자만 가능합니다");
    const uid = str(input.owner_id, 100);
    const ok = await env.DB.prepare(`SELECT 1 AS x FROM memberships WHERE user_id = ? AND category_id = ?`).bind(uid, p.category_id).first();
    if (!ok) bad("owner_id 사용자가 이 카테고리의 구성원이 아닙니다");
    sets.push("owner_id = ?");
    params.push(uid);
    changes.push("소유자");
  }
  let movedTo: string | null = null;
  if (input.category_id !== undefined && str(input.category_id) !== p.category_id) {
    if (!ctx.isAdmin) bad("카테고리 이동은 관리자만 가능합니다");
    const cid = str(input.category_id, 100);
    const ok = await env.DB.prepare(`SELECT 1 AS x FROM categories WHERE id = ? AND archived_at IS NULL`).bind(cid).first();
    if (!ok) bad("category_id 가 올바르지 않습니다");
    // 소유자(변경 후 소유자 포함)가 새 카테고리 구성원이어야 접근 가능
    const newOwner = input.owner_id !== undefined ? str(input.owner_id, 100) : p.owner_id;
    const ownerOk = await env.DB.prepare(`SELECT 1 AS x FROM memberships WHERE user_id = ? AND category_id = ?`).bind(newOwner, cid).first();
    if (!ownerOk) bad("프로젝트 소유자가 이동할 카테고리의 구성원이 아닙니다. 먼저 소속을 추가하거나 owner_id 를 함께 변경하세요");
    sets.push("category_id = ?");
    params.push(cid);
    changes.push("카테고리");
    movedTo = cid;
  }
  if (!sets.length && !moveTo) bad("변경할 필드가 없습니다");
  const at = nowIso();
  if (sets.length) {
    sets.push("updated_at = ?");
    params.push(at, id);
    await env.DB.prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`).bind(...params).run();
  }
  if (moveTo) {
    await moveCurrentStage(env, ctx, p, moveTo, at);
    changes.push(`단계→${STAGE_LABELS[moveTo]}`);
  }
  if (movedTo) {
    // 활동 이력도 새 카테고리로, 새 카테고리 비구성원 담당자는 해제
    await env.DB.batch([
      env.DB.prepare(`UPDATE activity SET category_id = ? WHERE project_id = ?`).bind(movedTo, id),
      env.DB.prepare(`UPDATE tasks SET assignee_id = NULL WHERE project_id = ? AND assignee_id IS NOT NULL AND assignee_id NOT IN (SELECT user_id FROM memberships WHERE category_id = ?)`).bind(id, movedTo),
    ]);
  }
  await logActivity(env, { actor_id: ctx.user.id, category_id: p.category_id, project_id: id, action: "project.update", target_id: id, summary: changes.join(", "), source: ctx.source });
  return getProjectDetail(env, ctx, id);
}

/**
 * 논문 흐름은 한 줄이다: 현재 단계 앞은 완료, 현재 단계는 진행 중, 뒤는 예정.
 * 현재 단계를 옮기면 모든 단계 상태를 이 규칙으로 다시 계산한다 (정리 내용은 유지).
 */
async function moveCurrentStage(env: Env, ctx: AuthContext, p: ProjectRow, target: Stage, at: string): Promise<void> {
  const ti = STAGES.indexOf(target);
  await ensureStageRows(env, p.id);
  await env.DB.batch([
    ...STAGES.map((s, i) =>
      env.DB.prepare(`UPDATE project_stages SET status = ?, updated_at = ?, updated_by = ? WHERE project_id = ? AND stage = ?`).bind(i < ti ? "done" : i === ti ? "doing" : "todo", at, ctx.user.id, p.id, s)
    ),
    env.DB.prepare(`UPDATE projects SET stage = ?, status = CASE WHEN status = 'done' THEN 'active' ELSE status END, updated_at = ? WHERE id = ?`).bind(target, at, p.id),
  ]);
}

/**
 * 다음 단계로 진행 (to 를 주면 그 단계로 이동: 뒤로 건너뛰거나 앞으로 되돌리기).
 * 마지막 단계(검토·투고)에서 to 없이 호출하면 논문 완료(모든 단계 done, 프로젝트 status=done).
 */
export async function advanceStage(env: Env, ctx: AuthContext, id: string, to?: unknown): Promise<ProjectDetail> {
  const p = await getProjectForWrite(env, ctx, id);
  if (p.status === "archived" && !ctx.isAdmin) forbidden("보관된 프로젝트는 진행할 수 없습니다. 먼저 상태를 되돌리세요");
  const at = nowIso();
  const cur = STAGES.indexOf(p.stage);
  let summary: string;
  if (to !== undefined && to !== null && to !== "") {
    if (!isStage(to)) bad("to 값이 올바르지 않습니다");
    if (to === p.stage && p.status !== "done") bad("이미 현재 단계입니다");
    await moveCurrentStage(env, ctx, p, to, at);
    const ti = STAGES.indexOf(to);
    summary = `${STAGE_LABELS[p.stage]} → ${STAGE_LABELS[to]}${ti < cur ? " (되돌리기)" : ""}`;
  } else if (cur >= STAGES.length - 1) {
    if (p.status === "done") bad("이미 완료된 논문입니다");
    await ensureStageRows(env, id);
    await env.DB.batch([
      env.DB.prepare(`UPDATE project_stages SET status = 'done', updated_at = ?, updated_by = ? WHERE project_id = ?`).bind(at, ctx.user.id, id),
      env.DB.prepare(`UPDATE projects SET status = 'done', updated_at = ? WHERE id = ?`).bind(at, id),
    ]);
    summary = `${STAGE_LABELS[p.stage]} 완료 → 논문 완료`;
  } else {
    const next = STAGES[cur + 1];
    await moveCurrentStage(env, ctx, p, next, at);
    summary = `${STAGE_LABELS[p.stage]} 완료 → ${STAGE_LABELS[next]}`;
  }
  await logActivity(env, { actor_id: ctx.user.id, category_id: p.category_id, project_id: id, action: "stage.advance", target_id: p.stage, summary, source: ctx.source });
  return getProjectDetail(env, ctx, id);
}

/**
 * 단계별 정리(누적 결론) 갱신. 상태는 흐름에서 도출되므로 직접 편집하지 않는다.
 * 호환용 별칭: set_current=true → 그 단계로 이동, status=done(현재 단계) → 다음 단계로, status=doing → 그 단계로 이동.
 */
export async function updateStage(
  env: Env,
  ctx: AuthContext,
  id: string,
  stage: string,
  input: { status?: unknown; summary?: unknown; set_current?: unknown }
): Promise<ProjectDetail> {
  const p = await getProjectForWrite(env, ctx, id);
  if (p.status === "archived" && !ctx.isAdmin) forbidden("보관된 프로젝트는 수정할 수 없습니다. 먼저 상태를 되돌리세요");
  if (!isStage(stage)) bad("stage 값이 올바르지 않습니다");
  await ensureStageRows(env, id);
  const at = nowIso();
  let changed = false;
  if (input.summary !== undefined && input.summary !== null) {
    await env.DB
      .prepare(`UPDATE project_stages SET summary = ?, updated_at = ?, updated_by = ? WHERE project_id = ? AND stage = ?`)
      .bind(strLimited(input.summary, 100_000, "summary"), at, ctx.user.id, id, stage)
      .run();
    await touchProject(env, id);
    await logActivity(env, { actor_id: ctx.user.id, category_id: p.category_id, project_id: id, action: "stage.update", target_id: stage, summary: `${STAGE_LABELS[stage]}: 정리 갱신`, source: ctx.source });
    changed = true;
  }
  const status = input.status === undefined || input.status === null ? null : oneOf(input.status, STAGE_STATUSES, "status");
  const wantCurrent = bool(input.set_current) || status === "doing";
  if (wantCurrent && stage !== p.stage) {
    await advanceStage(env, ctx, id, stage);
    changed = true;
  } else if (status === "done" && stage === p.stage) {
    await advanceStage(env, ctx, id);
    changed = true;
  } else if (status === "done" && STAGES.indexOf(stage) > STAGES.indexOf(p.stage)) {
    // 뒤 단계를 완료로 → 그 다음 단계로 건너뛰기
    const ni = STAGES.indexOf(stage) + 1;
    if (ni < STAGES.length) await advanceStage(env, ctx, id, STAGES[ni]);
    else { await advanceStage(env, ctx, id, stage); await advanceStage(env, ctx, id); }
    changed = true;
  }
  if (!changed) bad("변경할 필드가 없습니다");
  return getProjectDetail(env, ctx, id);
}

export async function archiveProject(env: Env, ctx: AuthContext, id: string): Promise<void> {
  const p = await getProjectForWrite(env, ctx, id);
  await env.DB.prepare(`UPDATE projects SET status = 'archived', updated_at = ? WHERE id = ?`).bind(nowIso(), id).run();
  await logActivity(env, { actor_id: ctx.user.id, category_id: p.category_id, project_id: id, action: "project.archive", target_id: id, summary: p.title, source: ctx.source });
}

/** 카테고리 보드: 단계별 프로젝트 묶음 (칸반) */
export async function categoryBoard(env: Env, ctx: AuthContext, categoryId: string) {
  requireCategoryMember(ctx, categoryId);
  const [active, paused, done] = await Promise.all([
    listProjects(env, ctx, { category_id: categoryId, status: "active" }),
    listProjects(env, ctx, { category_id: categoryId, status: "paused" }),
    listProjects(env, ctx, { category_id: categoryId, status: "done", limit: 50 }),
  ]);
  const columns = STAGES.map((s) => ({ stage: s, projects: active.filter((p) => p.stage === s) }));
  return { columns, paused, done };
}
