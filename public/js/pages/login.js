import { h, setToken, loadMe, state, errToast, input } from "../core.js";

export function render({ onLogin, error }) {
  const tok = input({ type: "password", placeholder: "rn_…", autocomplete: "off", spellcheck: false });
  const err = h("p.help", { style: { color: "var(--brick)", minHeight: "18px" } }, error || "");
  const btn = h("button.btn.primary", { type: "submit" }, "들어가기");
  const form = h("form", {
    onsubmit: async (e) => {
      e.preventDefault();
      const t = tok.value.trim();
      if (!t) { err.textContent = "토큰을 입력하세요"; return; }
      btn.disabled = true; err.textContent = "";
      setToken(t);
      try { await loadMe({ noRedirect: true }); location.hash = "#/"; onLogin(); }
      catch (ex) { setToken(null); state.me = null; err.textContent = ex.status === 401 ? ex.message : `연결 실패: ${ex.message}`; if (ex.status !== 401) errToast(ex); }
      finally { btn.disabled = false; }
    },
  },
    h("label.field", h("span", "개인 접근 토큰"), tok, h("span.help", "관리자(연구책임자)가 발급한 토큰을 붙여넣으세요. 토큰은 이 브라우저에만 저장됩니다.")),
    err,
    h("div.row", { style: { justifyContent: "flex-end" } }, btn),
  );
  return h("div.wrap.narrow", h("div.login",
    h("div.hero", h("div.eyebrow", "Research Note"), h("h1", "연구노트"), h("p.sub", "논문 진행을 날짜별로 기록하고, 같은 팀과 검토하며, AI 도구로 자동 기록하는 연구실 노트")),
    h("div.card", form),
    h("p.small.muted", { style: { marginTop: "16px" } }, "토큰이 없다면 연구책임자에게 요청하세요. AI 도구(Claude Code 등) 연동은 로그인 후 [설정]에서 안내합니다."),
  ));
}
