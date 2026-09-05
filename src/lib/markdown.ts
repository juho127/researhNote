/** 소형 마크다운 렌더러 (보고서용). 입력 HTML 은 모두 이스케이프한다. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function inline(s: string): string {
  let t = escapeHtml(s);
  t = t.replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  t = t.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, a, b) => `<a href="${b}" target="_blank" rel="noopener">${a}</a>`);
  t = t.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_m, pre, url) => `${pre}<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
  return t;
}

export function renderMarkdown(src: string): string {
  const lines = (src || "").replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  let listType: "ul" | "ol" | null = null;
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };
  while (i < lines.length) {
    const line = lines[i];
    // code fence
    const fence = line.match(/^```(\w*)/);
    if (fence) {
      closeList();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code${fence[1] ? ` class="lang-${escapeHtml(fence[1])}"` : ""}>${escapeHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }
    // table (| a | b |) with separator row
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      closeList();
      const header = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
        i++;
      }
      out.push("<table><thead><tr>" + header.map((h) => `<th>${inline(h)}</th>`).join("") + "</tr></thead><tbody>" +
        rows.map((r) => "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") + "</tbody></table>");
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const lvl = Math.min(6, h[1].length + 2); // 보고서 안에서는 h3 부터
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
      i++;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      closeList();
      out.push("<hr>");
      i++;
      continue;
    }
    const bq = line.match(/^>\s?(.*)$/);
    if (bq) {
      closeList();
      const buf = [bq[1]];
      i++;
      while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${buf.map(inline).join("<br>")}</blockquote>`);
      continue;
    }
    const ul = line.match(/^\s*[-*+]\s+(?:\[( |x|X)\]\s+)?(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      const type: "ul" | "ol" = ul ? "ul" : "ol";
      if (listType !== type) {
        closeList();
        out.push(`<${type}>`);
        listType = type;
      }
      if (ul && ul[1] !== undefined) {
        const checked = ul[1].toLowerCase() === "x";
        out.push(`<li class="task${checked ? " done" : ""}"><input type="checkbox" disabled${checked ? " checked" : ""}> ${inline(ul[2])}</li>`);
      } else {
        out.push(`<li>${inline(ul ? ul[2] : ol![1])}</li>`);
      }
      i++;
      continue;
    }
    if (!line.trim()) {
      closeList();
      i++;
      continue;
    }
    closeList();
    // paragraph: 연속 줄 병합
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*[-*+]\s|\s*\d+[.)]\s|\s*\|)/.test(lines[i])) buf.push(lines[i++]);
    out.push(`<p>${buf.map(inline).join("<br>")}</p>`);
  }
  closeList();
  return out.join("\n");
}
