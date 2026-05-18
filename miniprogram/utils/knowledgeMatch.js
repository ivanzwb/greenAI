const articles = require("../data/knowledge.json");

function norm(s) {
  return String(s || "")
    .trim()
    .toLowerCase();
}

function scoreOne(article, query) {
  const q = norm(query);
  if (!q) return 0;
  let s = 0;
  const title = norm(article.title);
  const summary = norm(article.summary);
  const body = norm(article.body);
  const id = norm(article.id);
  if (title.includes(q)) s += 14;
  if (id === q) s += 20;
  if (summary.includes(q)) s += 5;
  if (body.includes(q)) s += 2;
  const tokens = q.split(/[\s,，.。!！?？/、]+/).filter((t) => t.length >= 2);
  for (const token of tokens) {
    if (title.includes(token)) s += 4;
    if (summary.includes(token)) s += 2;
    if (body.includes(token)) s += 1;
  }
  return s;
}

/**
 * @param {string} speciesLabel
 * @param {string} nickname
 * @returns {{ id: string, title: string } | null}
 */
function bestKnowledgeMatch(speciesLabel, nickname) {
  const list = Array.isArray(articles) ? articles : [];
  const queries = [speciesLabel, nickname, `${speciesLabel} ${nickname}`]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  if (!queries.length) return null;
  let best = null;
  let bestScore = 0;
  for (const article of list) {
    let sc = 0;
    for (const q of queries) {
      sc = Math.max(sc, scoreOne(article, q));
    }
    if (sc > bestScore) {
      bestScore = sc;
      best = article;
    }
  }
  if (!best || bestScore < 4) return null;
  return { id: best.id, title: best.title };
}

module.exports = { bestKnowledgeMatch };
