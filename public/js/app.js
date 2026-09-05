import { state, getToken, loadMe, logout, h, mount, parseRoute, errToast, get } from "./core.js";
import * as Login from "./pages/login.js";
import * as Home from "./pages/home.js";
import * as Team from "./pages/team.js";
import * as Project from "./pages/project.js";
import * as Admin from "./pages/admin.js";
import * as Settings from "./pages/settings.js";

const app = document.getElementById("app");
let reviewCount = 0;

function layout(content, active) {
  const me = state.me;
  const a = me?.app || { name: "연구노트", org: "", org_sub: "", mark: "RN" };
  const nav = h("nav.nav");
  const link = (href, label, key, badge) => nav.append(h("a", { href, class: active === key ? "active" : "" }, label, badge ? h("span.badge", badge) : null));
  link("#/", "홈", "home");
  for (const m of me?.memberships || []) link(`#/team/${m.category_id}`, m.category_name, `team:${m.category_id}`);
  if (me?.is_admin) link("#/admin", "관리자", "admin", reviewCount || null);
  link("#/settings", "설정", "settings");
  nav.append(h("span.me", me?.user?.name || ""));
  const top = h("div.topbar", h("div.inner",
    h("div.mark", a.mark || "RN"),
    h("div.who", h("b", a.org || a.name), h("span", a.org_sub || "")),
    h("a.doc", { href: "#/" }, a.name),
    nav,
  ));
  mount(app, top, content, h("div.foot", `${a.org || ""} ${a.org_sub ? "· " + a.org_sub : ""} · ${a.name}`, " · ", h("a", { href: "/SKILL.md", target: "_blank" }, "AI 연동 지침"), " · ", h("a", { href: "https://github.com/juho127/researhNote", target: "_blank", rel: "noopener" }, "GitHub")));
}

async function render() {
  const route = parseRoute();
  const [head, id] = route.parts;

  if (!getToken()) {
    mount(app, Login.render({ onLogin: render }));
    return;
  }
  if (!state.me) {
    try { await loadMe(); } catch (e) {
      if (e.status === 401) { mount(app, Login.render({ onLogin: render, error: e.message })); return; }
      mount(app, h("div.wrap.narrow", h("div.empty", `서버 오류: ${e.message}`), h("p.right", h("button.btn", { onclick: logout }, "로그아웃"))));
      return;
    }
    if (state.me.is_admin) get("/api/admin/overview").then((o) => { reviewCount = o.review_queue?.length || 0; }).catch(() => {});
  }
  if (head === "login") { location.hash = "#/"; return; }

  const container = h("div.wrap");
  let active = "home";
  try {
    if (!head) { await Home.render(container); }
    else if (head === "team" && id) { active = `team:${id}`; await Team.render(container, id, route.query); }
    else if (head === "project" && id) { const p = await Project.render(container, id, route.query); active = p?.category_id ? `team:${p.category_id}` : "home"; }
    else if (head === "admin") { active = "admin"; await Admin.render(container, route.parts[1], route.query); }
    else if (head === "settings") { active = "settings"; await Settings.render(container); }
    else mount(container, h("div.empty", "페이지를 찾을 수 없습니다"));
  } catch (e) {
    if (e.status === 401) return; // api() 가 로그인으로 보냄
    mount(container, h("div.empty", `오류: ${e.message}`));
    errToast(e);
  }
  layout(container, active);
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", render);
window.addEventListener("rn:refresh", render);
render();
