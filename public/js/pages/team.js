import { state, get, h, mount, pill, avatar, stages, stageLabel, fmtRel, daysSince, openReport, downloadFile, input, field, modal, daysAgo, today, STATUS_LABEL } from "../core.js";
import { projectCard, feedList, newProjectDialog } from "./home.js";

export async function render(container, categoryId, query) {
  mount(container, h("div.loading", h("span.spinner"), " 불러오는 중…"));
  const [detail, board] = await Promise.all([get(`/api/categories/${categoryId}`), get(`/api/categories/${categoryId}/board`)]);
  const cat = detail.category;
  const view = query.view || "board";
  const me = state.me;

  const viewSeg = h("div.seg");
  for (const [k, l] of [["board", "보드"], ["list", "목록"], ["members", "구성원"], ["review", `검토 대기${detail.review_queue.length ? " " + detail.review_queue.length : ""}`], ["feed", "활동"]]) {
    viewSeg.append(h("button", { class: view === k ? "active" : "", onclick: () => (location.hash = `#/team/${categoryId}?view=${k}`) }, l));
  }

  const header = h("header.hero", { style: { padding: "22px 0 18px" } },
    h("div.eyebrow", `팀 · ${detail.my_role === "admin" ? "관리자" : detail.my_role === "lead" ? "리드" : "구성원"}`),
    h("div.row.between.top",
      h("div", h("h1", cat.name), cat.description ? h("p.sub", cat.description) : null),
      h("div.row",
        h("button.btn", { onclick: () => reportDialog(categoryId, cat.name) }, "팀 보고서"),
        h("button.btn.primary", { onclick: () => newProjectDialog(me, categoryId) }, "+ 새 프로젝트"),
      ),
    ),
    h("div.row", { style: { marginTop: "14px" } }, viewSeg, h("span.spacer"),
      h("span.small.muted", `구성원 ${detail.members.length} · 진행 중 ${detail.projects.filter((p) => p.status === "active").length} · 전체 ${detail.projects.length}`)),
  );

  let body;
  if (view === "board") body = renderBoard(board);
  else if (view === "list") body = renderList(detail.projects);
  else if (view === "members") body = renderMembers(detail);
  else if (view === "review") body = renderReview(detail.review_queue);
  else body = h("div.card", feedList(detail.activity));

  mount(container, header, body);
}

function renderBoard(board) {
  const cols = h("div.board");
  for (const col of board.columns) {
    const s = stages().find((x) => x.id === col.stage);
    cols.append(h("div.col",
      h("div.col-h", s?.label || col.stage, h("span.n", String(col.projects.length)), h("span.spacer"), h("span.tiny.muted", { title: s?.hint }, "")),
      col.projects.length ? col.projects.map((p) => projectCard(p, { compact: true })) : h("div.tiny.muted", { style: { padding: "6px 4px" } }, s?.hint || ""),
    ));
  }
  const extra = [];
  if (board.paused.length) extra.push(h("div.section", h("div.section-h", h("h2", "일시 중지"), h("p.sub", `${board.paused.length}건`)), h("div.grid.c3", board.paused.map((p) => projectCard(p, { compact: true })))));
  if (board.done.length) extra.push(h("div.section", h("div.section-h", h("h2", "완료"), h("p.sub", `${board.done.length}건`)), h("div.grid.c3", board.done.map((p) => projectCard(p, { compact: true })))));
  return h("div", cols, extra);
}

function renderList(projects) {
  const rows = projects.filter((p) => p.status !== "archived").sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
  if (!rows.length) return h("div.empty", "프로젝트가 없습니다");
  const tbl = h("table.table",
    h("thead", h("tr", h("th", "프로젝트"), h("th", "담당"), h("th", "단계"), h("th", "상태"), h("th", "진행"), h("th", "기록"), h("th", "마지막 기록"), h("th", "검토"), h("th", "마감"))),
    h("tbody", rows.map((p) => {
      const stale = daysSince(p.last_entry_at);
      return h("tr", { class: p.status !== "active" ? "dim" : "" },
        h("td", h("a", { href: `#/project/${p.id}`, style: { fontWeight: 700 } }, p.title), p.target_venue ? h("div.tiny.muted", p.target_venue) : null),
        h("td", h("span.row", { style: { gap: "5px" } }, avatar(p.owner_name), p.owner_name)),
        h("td", pill(stageLabel(p.stage))),
        h("td", STATUS_LABEL[p.status]),
        h("td", `${p.stage_done}/${stages().length}`),
        h("td", String(p.entry_count)),
        h("td", { class: stale > 14 && p.status === "active" ? "stale" : "" }, p.last_entry_at ? fmtRel(p.last_entry_at) : "없음"),
        h("td", p.review_requested ? pill(String(p.review_requested), "bad sm") : ""),
        h("td", p.deadline || ""),
      );
    })),
  );
  return h("div.table-wrap", tbl);
}

function renderMembers(detail) {
  const grid = h("div.grid.c3");
  for (const m of detail.members) {
    const mine = detail.projects.filter((p) => p.owner_id === m.id && p.status !== "archived");
    grid.append(h("div.card",
      h("div.row", avatar(m.name, true), h("div", h("div", { style: { fontWeight: 700 } }, m.name, " ", m.role === "lead" ? pill("리드", "gold sm") : null), h("div.tiny.muted", m.email || "")), h("span.spacer"),
        h("div.right.tiny.muted", `이번 주 ${m.entries_7d}건`, h("br"), m.last_entry_at ? `마지막 ${fmtRel(m.last_entry_at)}` : "기록 없음")),
      mine.length ? h("div.stack", { style: { marginTop: "10px", gap: "4px" } }, mine.map((p) => h("a.small", { href: `#/project/${p.id}` }, "· ", p.title, " ", pill(stageLabel(p.stage), "sm")))) : h("div.tiny.muted", { style: { marginTop: "8px" } }, "프로젝트 없음"),
    ));
  }
  return grid;
}

function renderReview(queue) {
  if (!queue.length) return h("div.empty", "검토 대기 중인 기록이 없습니다");
  return h("div.stack", queue.map((e) => h("a.card.hover", { href: `#/project/${e.project_id}?entry=${e.id}` },
    h("div.row", pill(stageLabel(e.stage)), h("b", e.title), h("span.spacer"), h("span.small.muted", `${e.date} · ${fmtRel(e.updated_at)}`)),
    h("div.small.muted", `${e.project_title} · ${e.author_name}`),
    e.content ? h("div.small", { style: { marginTop: "6px", color: "#3C4E57" } }, e.content.slice(0, 200)) : null,
  )));
}

export function reportDialog(categoryId, name) {
  const from = input({ type: "date", value: daysAgo(30) });
  const to = input({ type: "date", value: today() });
  const all = h("input", { type: "checkbox" });
  const q = () => (all.checked ? "" : `&from=${from.value}&to=${to.value}`);
  modal({
    title: `팀 보고서 — ${name}`,
    body: h("div.stack", h("div.form-grid", field("시작", from), field("종료", to)), h("label.check", all, "기간 제한 없이 전체"), h("p.help", "HTML 보고서는 새 탭에서 열리며 [인쇄 / PDF 저장] 버튼으로 PDF 를 만들 수 있습니다.")),
    actions: [
      { label: "Markdown 다운로드", onClick: () => downloadFile(`/api/categories/${categoryId}/report?format=md&download=1${q()}`, `${name}-report.md`) },
      { label: "HTML 보고서 열기", cls: "primary", onClick: () => openReport(`/api/categories/${categoryId}/report?format=html${q()}`) },
    ],
  });
}
