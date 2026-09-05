#!/usr/bin/env node
/**
 * 엔드투엔드 스모크 테스트 — 실제 서버(로컬 wrangler dev 또는 배포본)에 대해 전체 흐름을 검증한다.
 *
 *   BASE_URL=http://127.0.0.1:8787 ADMIN_TOKEN=rn_... node tests/smoke.mjs
 *
 * 생성물: 카테고리 "smoke-<ts>", 사용자 2명, 프로젝트 1개, 기록/코멘트/할 일. 마지막에 프로젝트를 보관 처리하고
 * 카테고리를 아카이브한다 (완전 삭제는 하지 않음 — 활동 로그 보존).
 */
const BASE = (process.env.BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const ADMIN = process.env.ADMIN_TOKEN;
if (!ADMIN) {
  console.error("ADMIN_TOKEN 환경변수가 필요합니다");
  process.exit(2);
}

let pass = 0, fail = 0;
const results = [];
function ok(name, cond, extra = "") {
  if (cond) { pass++; results.push(`  ✓ ${name}`); }
  else { fail++; results.push(`  ✗ ${name} ${extra}`); }
}

async function api(token, method, path, body, client = "api") {
  const r = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Client": client },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const ct = r.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await r.json() : await r.text();
  return { status: r.status, data, headers: r.headers };
}

let rpcId = 1;
async function mcp(token, method, params) {
  const r = await fetch(BASE + "/mcp", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
  });
  if (r.status === 202) return { status: 202 };
  return { status: r.status, data: await r.json() };
}

const ts = Date.now().toString(36);
(async () => {
  // health
  const h = await fetch(BASE + "/health");
  ok("GET /health", h.status === 200);

  // 인증
  const noauth = await fetch(BASE + "/api/me");
  ok("401 without token", noauth.status === 401);
  const bad = await api("rn_invalid", "GET", "/api/me");
  ok("401 invalid token", bad.status === 401);
  const me = await api(ADMIN, "GET", "/api/me");
  ok("GET /api/me (admin)", me.status === 200 && me.data.is_admin === true, JSON.stringify(me.data).slice(0, 200));

  // 카테고리
  const cat = await api(ADMIN, "POST", "/api/admin/categories", { name: `smoke-${ts}`, description: "스모크 테스트 팀" });
  ok("POST /api/admin/categories", cat.status === 201 && cat.data.id, JSON.stringify(cat.data));
  const catId = cat.data.id;

  // 사용자 2명 (리드 + 멤버), 토큰 발급
  const lead = await api(ADMIN, "POST", "/api/admin/users", { name: `리드${ts}`, categories: [{ category_id: catId, role: "lead" }], issue_token: true });
  ok("POST /api/admin/users (lead + token)", lead.status === 201 && lead.data.token?.startsWith("rn_"), JSON.stringify(lead.data).slice(0, 200));
  const member = await api(ADMIN, "POST", "/api/admin/users", { name: `연구원${ts}`, categories: [catId], issue_token: true });
  ok("POST /api/admin/users (member + token)", member.status === 201 && member.data.token?.startsWith("rn_"));
  const LEAD = lead.data.token, MEM = member.data.token, memId = member.data.user.id, leadId = lead.data.user.id;

  const memMe = await api(MEM, "GET", "/api/me");
  ok("member /api/me sees membership", memMe.status === 200 && memMe.data.memberships.some((m) => m.category_id === catId));
  const memAdmin = await api(MEM, "GET", "/api/admin/overview");
  ok("member forbidden on admin", memAdmin.status === 403);

  // 프로젝트
  const prj = await api(MEM, "POST", "/api/projects", { category_id: catId, title: `스모크 논문 ${ts}`, summary: "테스트 연구 질문", target_venue: "NeurIPS", deadline: "2027-01-31", tags: ["test", "smoke"] }, "web");
  ok("POST /api/projects (member)", prj.status === 201 && prj.data.stages?.length === 6, JSON.stringify(prj.data).slice(0, 300));
  const prjId = prj.data.id;
  ok("project initial stage planning=doing", prj.data.stages?.find((s) => s.stage === "planning")?.status === "doing");

  const other = await api(ADMIN, "POST", "/api/admin/users", { name: `외부인${ts}`, issue_token: true });
  const OUT = other.data.token;
  const outsider = await api(OUT, "GET", `/api/projects/${prjId}`);
  ok("outsider forbidden on project", outsider.status === 403);

  // 기록 (web)
  const e1 = await api(MEM, "POST", `/api/projects/${prjId}/entries`, { title: "첫 실험", content: "## 한 일\n- baseline\n\n## 결과\n| 모델 | acc |\n|---|---|\n| A | 0.91 |", stage: "experiment", date: "2026-09-01" }, "web");
  ok("POST entry (web)", e1.status === 201 && e1.data.source === "web" && e1.data.stage === "experiment", JSON.stringify(e1.data).slice(0, 200));
  const e1Id = e1.data.id;
  const badDate = await api(MEM, "POST", `/api/projects/${prjId}/entries`, { title: "x", content: "y", date: "2026-13-40" });
  ok("entry invalid date rejected", badDate.status === 400);
  const leadEntryOnMemberProject = await api(LEAD, "POST", `/api/projects/${prjId}/entries`, { title: "리드 메모", content: "리드가 남김" });
  ok("lead can write entry on member project", leadEntryOnMemberProject.status === 201);

  // 검토 흐름
  const req = await api(MEM, "POST", `/api/entries/${e1Id}/review`, { status: "requested" });
  ok("member requests review", req.status === 200 && req.data.review_status === "requested");
  const memApprove = await api(MEM, "POST", `/api/entries/${e1Id}/review`, { status: "approved" });
  ok("member cannot approve", memApprove.status === 403);
  const cmt = await api(LEAD, "POST", `/api/entries/${e1Id}/comments`, { content: "baseline 시드 5개로 반복하세요" });
  ok("lead comments", cmt.status === 201);
  const chg = await api(LEAD, "POST", `/api/entries/${e1Id}/review`, { status: "changes_requested", note: "반복 실험 필요" });
  ok("lead requests changes", chg.status === 200 && chg.data.review_status === "changes_requested" && chg.data.comments?.length === 2);
  const appr = await api(LEAD, "POST", `/api/entries/${e1Id}/comments`, { content: "확인", kind: "approve" });
  ok("lead approve via comment", appr.status === 201);
  const e1Full = await api(MEM, "GET", `/api/entries/${e1Id}`);
  ok("entry approved + 3 comments", e1Full.data.review_status === "approved" && e1Full.data.comments.length === 3);

  // 단계 정리
  const st = await api(MEM, "PUT", `/api/projects/${prjId}/stages/experiment`, { status: "doing", summary: "## 실험\n- baseline 0.91", set_current: true });
  ok("PUT stage summary + set_current", st.status === 200 && st.data.stage === "experiment");
  const stDone = await api(MEM, "PUT", `/api/projects/${prjId}/stages/planning`, { status: "done" });
  ok("planning done → stage_done=1", stDone.status === 200 && stDone.data.stage_done === 1);

  // 할 일
  const t1 = await api(LEAD, "POST", `/api/projects/${prjId}/tasks`, { title: "시드 5개 반복", due: "2026-09-10", assignee_id: memId });
  ok("lead adds task for member", t1.status === 201 && t1.data.assignee_name);
  const t1u = await api(MEM, "PATCH", `/api/tasks/${t1.data.id}`, { status: "done" });
  ok("member completes task", t1u.status === 200 && t1u.data.status === "done" && t1u.data.done_at);

  // 보드 / 피드 / 검색
  const board = await api(LEAD, "GET", `/api/categories/${catId}/board`);
  ok("category board has project in experiment column", board.status === 200 && board.data.columns.find((c) => c.stage === "experiment")?.projects.some((p) => p.id === prjId));
  const feed = await api(MEM, "GET", `/api/feed?category_id=${catId}&limit=10`);
  ok("feed lists activity", feed.status === 200 && feed.data.length >= 5);
  const search = await api(MEM, "GET", `/api/search?q=${encodeURIComponent("baseline")}`);
  ok("search finds entry", search.status === 200 && search.data.entries.some((e) => e.id === e1Id));
  const catDetail = await api(MEM, "GET", `/api/categories/${catId}`);
  ok("category detail members=2", catDetail.status === 200 && catDetail.data.members.length === 2);

  // 보고서
  const rmd = await api(MEM, "GET", `/api/projects/${prjId}/report?format=md`);
  ok("project report md", rmd.status === 200 && typeof rmd.data === "string" && rmd.data.includes("첫 실험") && rmd.data.includes("반복 실험 필요"));
  const rhtml = await api(MEM, "GET", `/api/projects/${prjId}/report`);
  ok("project report html", rhtml.status === 200 && typeof rhtml.data === "string" && rhtml.data.includes("<table>") && rhtml.data.includes("window.print()"));
  const crep = await api(LEAD, "GET", `/api/categories/${catId}/report?format=md&from=2026-09-01`);
  ok("category report md", crep.status === 200 && crep.data.includes("스모크 논문"));
  const xss = await api(MEM, "POST", `/api/projects/${prjId}/entries`, { title: "<script>alert(1)</script>", content: "<img src=x onerror=alert(1)> **bold**" });
  const rx = await api(MEM, "GET", `/api/projects/${prjId}/report`);
  ok("report escapes html", rx.data.includes("&lt;script&gt;") && !rx.data.includes("<img src=x"));

  // MCP
  const init = await mcp(MEM, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "1" } });
  ok("mcp initialize", init.status === 200 && init.data.result?.protocolVersion === "2025-06-18" && init.data.result.instructions?.includes("whoami"), JSON.stringify(init.data).slice(0, 200));
  const notif = await fetch(BASE + "/mcp", { method: "POST", headers: { Authorization: `Bearer ${MEM}`, "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
  ok("mcp notification → 202", notif.status === 202);
  const tl = await mcp(MEM, "tools/list", {});
  ok("mcp tools/list ≥ 15 tools", tl.status === 200 && tl.data.result?.tools?.length >= 15);
  const who = await mcp(MEM, "tools/call", { name: "whoami", arguments: {} });
  ok("mcp whoami", who.data.result?.content?.[0]?.text?.includes(prjId));
  const logged = await mcp(MEM, "tools/call", { name: "log_progress", arguments: { project_id: prjId, title: "MCP 기록", content: "## 한 일\n- AI 로 기록", stage: "writing", request_review: true } });
  ok("mcp log_progress", logged.data.result?.structuredContent?.source === "mcp" && logged.data.result.structuredContent.review_status === "requested", JSON.stringify(logged.data).slice(0, 300));
  const gp = await mcp(MEM, "tools/call", { name: "get_project", arguments: { project_id: prjId } });
  ok("mcp get_project mentions MCP 기록", gp.data.result?.content?.[0]?.text?.includes("MCP 기록"));
  const badTool = await mcp(MEM, "tools/call", { name: "nope", arguments: {} });
  ok("mcp unknown tool → error", badTool.data.error?.code === -32602);
  const forb = await mcp(OUT, "tools/call", { name: "get_project", arguments: { project_id: prjId } });
  ok("mcp forbidden → isError", forb.data.result?.isError === true);
  const pr = await mcp(MEM, "prompts/get", { name: "log_today", arguments: { project_id: prjId } });
  ok("mcp prompts/get", pr.data.result?.messages?.[0]?.content?.text?.includes(prjId));
  const rs = await mcp(MEM, "resources/read", { uri: "research-note://guide" });
  ok("mcp resources/read guide", rs.data.result?.contents?.[0]?.text?.includes("연구노트"));
  const unauth = await fetch(BASE + "/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  ok("mcp 401 without token", unauth.status === 401 && unauth.headers.get("www-authenticate")?.includes("Bearer"));
  const skill = await fetch(BASE + "/SKILL.md");
  ok("GET /SKILL.md", skill.status === 200 && (await skill.text()).includes("log_progress"));

  // 관리자 개요 / 토큰 회수
  const ov = await api(ADMIN, "GET", "/api/admin/overview");
  ok("admin overview counts", ov.status === 200 && ov.data.counts.entries >= 3 && ov.data.review_queue.length >= 1);
  const toks = await api(ADMIN, "GET", `/api/admin/tokens?user_id=${memId}`);
  ok("admin lists tokens", toks.status === 200 && toks.data.length === 1);
  const rv = await api(ADMIN, "POST", `/api/admin/tokens/${toks.data[0].id}/revoke`);
  ok("admin revokes token", rv.status === 200);
  const afterRevoke = await api(MEM, "GET", "/api/me");
  ok("revoked token → 401", afterRevoke.status === 401);
  const reissue = await api(ADMIN, "POST", "/api/admin/tokens", { user_id: memId, label: "재발급" });
  ok("admin reissues token", reissue.status === 201 && reissue.data.token);
  const dis = await api(ADMIN, "PATCH", `/api/admin/users/${other.data.user.id}`, { disabled: true });
  ok("admin disables user", dis.status === 200 && dis.data.disabled_at);
  const disMe = await api(OUT, "GET", "/api/me");
  ok("disabled user → 401", disMe.status === 401);

  // 리뷰에서 나온 회귀 검사
  const MEM2 = reissue.data.token;
  const approvedEdit = await api(MEM2, "PATCH", `/api/entries/${e1Id}`, { content: "## 결과\n- 수정된 본문" });
  ok("editing approved entry resets review to none", approvedEdit.status === 200 && approvedEdit.data.review_status === "none", JSON.stringify(approvedEdit.data).slice(0, 200));
  const longQ = await api(MEM2, "GET", `/api/search?q=${encodeURIComponent("가나다라마바사아자차카타파하가나다라마바")}`);
  ok("long korean search query → 200", longQ.status === 200, JSON.stringify(longQ.data).slice(0, 120));
  const badCat = await api(ADMIN, "POST", "/api/admin/users", { name: `없는카테고리${ts}`, categories: ["no-such-category"] });
  ok("user create with unknown category → 400", badCat.status === 400, JSON.stringify(badCat.data).slice(0, 120));
  const longTitle = await api(MEM2, "POST", `/api/projects/${prjId}/entries`, { title: "x".repeat(201), content: "y" });
  ok("title over 200 chars → 400", longTitle.status === 400);
  const feb31 = await api(MEM2, "POST", `/api/projects/${prjId}/entries`, { title: "d", content: "y", date: "2026-02-31" });
  ok("2026-02-31 rejected", feb31.status === 400);
  const objTitle = await api(MEM2, "POST", `/api/projects/${prjId}/entries`, { title: { a: 1 }, content: "y" });
  ok("object title → 400", objTitle.status === 400);
  const spoof = await api(MEM2, "POST", `/api/projects/${prjId}/entries`, { title: "spoof", content: "y" }, "mcp");
  ok("REST cannot spoof source=mcp", spoof.status === 201 && spoof.data.source === "api");
  const mcpNotif = await fetch(BASE + "/mcp", { method: "POST", headers: { Authorization: `Bearer ${MEM2}`, "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "tools/call", params: { name: "log_progress", arguments: { project_id: prjId, title: "notif", content: "x" } } }) });
  ok("mcp id-less tools/call → 202 (not executed)", mcpNotif.status === 202);
  const notifCheck = await api(MEM2, "GET", `/api/projects/${prjId}/entries?limit=50`);
  ok("id-less tools/call created nothing", notifCheck.status === 200 && !notifCheck.data.some((e) => e.title === "notif"));
  const badArgs = await mcp(MEM2, "tools/call", { name: "log_progress", arguments: { project_id: prjId, title: "no content" } });
  ok("mcp missing required arg → isError", badArgs.data.result?.isError === true && badArgs.data.result.content[0].text.includes("content"));
  const badType = await mcp(MEM2, "tools/call", { name: "update_stage", arguments: { project_id: prjId, stage: "experiment", set_current: "true" } });
  ok("mcp wrong arg type → isError", badType.data.result?.isError === true);
  const stageOnly = await api(MEM2, "PUT", `/api/projects/${prjId}/stages/writing`, { status: "doing" });
  ok("stage doing without set_current keeps current stage", stageOnly.status === 200 && stageOnly.data.stage === "experiment");
  const missingPrompt = await mcp(MEM2, "prompts/get", { name: "weekly_review", arguments: {} });
  ok("prompt missing required arg → -32602", missingPrompt.data.error?.code === -32602);
  const badEnc = await fetch(BASE + "/api/projects/%E0%A4%A", { headers: { Authorization: `Bearer ${MEM2}` } });
  ok("bad percent-encoding → 400", badEnc.status === 400);
  // 탈퇴자 차단
  const rmMem = await api(ADMIN, "DELETE", `/api/admin/users/${memId}/memberships/${catId}`);
  ok("admin removes membership", rmMem.status === 200);
  const exEdit = await api(MEM2, "PATCH", `/api/entries/${e1Id}`, { title: "탈퇴 후 수정" });
  ok("ex-member cannot edit own entry", exEdit.status === 403);
  const exProj = await api(MEM2, "PATCH", `/api/projects/${prjId}`, { title: "탈퇴 후 수정" });
  ok("ex-member cannot edit own project", exProj.status === 403);
  const stillTitle = await api(ADMIN, "GET", `/api/entries/${e1Id}`);
  ok("entry unchanged after ex-member attempt", stillTitle.data.title === "첫 실험");
  await api(ADMIN, "PUT", `/api/admin/users/${memId}/memberships/${catId}`, { role: "member" });

  // 정리
  const arch = await api(ADMIN, "DELETE", `/api/projects/${prjId}`);
  ok("archive project", arch.status === 200);
  const archivedWrite = await api(MEM2, "POST", `/api/projects/${prjId}/entries`, { title: "after archive", content: "x" });
  ok("archived project rejects entries", archivedWrite.status === 403);
  const carch = await api(ADMIN, "PATCH", `/api/admin/categories/${catId}`, { archived: true });
  ok("archive category", carch.status === 200);
  void leadId;

  console.log(results.join("\n"));
  console.log(`\n${fail === 0 ? "PASS" : "FAIL"}: ${pass} passed, ${fail} failed (${BASE})`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error(results.join("\n"));
  console.error("\n예외:", e);
  process.exit(1);
});
