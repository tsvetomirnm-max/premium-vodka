// lib/webscan.js

// Strip HTML to plain text (best effort)
function stripHtml(html) {
  if (!html) return "";
  html = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  html = html.replace(/<style[\s\S]*?<\/style>/gi, " ");
  html = html.replace(/<[^>]+>/g, " ");
  return html.replace(/\s+/g, " ").trim();
}

// Fetch page body and return a trimmed plain-text version
async function fetchPageText(url, maxLen = 6000) {
  try {
    const resp = await fetch(url, { redirect: "follow" });
    const ct = resp.headers.get("content-type") || "";
    const text = await resp.text();
    if (!ct.includes("text/html")) return text.slice(0, maxLen);
    const clean = stripHtml(text);
    return clean.slice(0, maxLen);
  } catch {
    return "";
  }
}

// Naive snippet selection: rank sentences by how many query terms they contain
function pickSnippets(fullText, query, maxChars = 1400) {
  if (!fullText) return "";
  const terms = (query || "").toLowerCase().split(/\W+/).filter(Boolean);
  if (terms.length === 0) return fullText.slice(0, maxChars);

  const sentences = fullText.split(/(?<=[.!?])\s+/);
  const scored = sentences.map((s) => {
    const low = s.toLowerCase();
    const hits = terms.reduce((acc, t) => acc + (low.includes(t) ? 1 : 0), 0);
    return { s, hits };
  });
  scored.sort((a, b) => b.hits - a.hits);

  let out = "";
  for (const { s, hits } of scored) {
    if (hits === 0) break;
    if ((out + " " + s).length > maxChars) break;
    out += (out ? " " : "") + s;
  }
  return out || fullText.slice(0, maxChars);
}

async function braveSearch(query, count = 5) {
  const token = process.env.BRAVE_API_KEY;
  if (!token) return { sources: [], note: "BRAVE_API_KEY not set." };

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
  const r = await fetch(url, { headers: { "X-Subscription-Token": token } });
  const j = await r.json();
  const results = j?.web?.results || [];
  return {
    sources: results.map((x) => ({ title: x.title, url: x.url, preview: x.description || "" })),
    note: "",
  };
}

// Public API: run Brave search, fetch pages, pick relevant snippets
export async function webScan(query, maxResults = 5) {
  const hits = await braveSearch(query, maxResults);
  if (!hits.sources.length) return hits;

  const out = [];
  for (const h of hits.sources.slice(0, maxResults)) {
    const text = await fetchPageText(h.url);
    const snippet = pickSnippets(text || h.preview || "", query, 1400);
    out.push({ title: h.title, url: h.url, snippet });
  }
  return { sources: out, note: "" };
}
