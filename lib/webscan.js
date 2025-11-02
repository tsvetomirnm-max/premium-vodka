// lib/webscan.js

// --- helpers --------------------------------------------------------------
function stripHtml(html) {
  if (!html) return "";
  html = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  html = html.replace(/<style[\s\S]*?<\/style>/gi, " ");
  html = html.replace(/<[^>]+>/g, " ");
  return html.replace(/\s+/g, " ").trim();
}

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

function pickSnippets(fullText, query, maxChars = 1400) {
  if (!fullText) return "";
  const terms = (query || "").toLowerCase().split(/\W+/).filter(Boolean);
  if (!terms.length) return fullText.slice(0, maxChars);

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

function hostname(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ""; }
}
// crude eTLD+1 extractor (good enough for our ranking)
function rootDomain(url) {
  const h = hostname(url);
  if (!h) return "";
  const parts = h.split(".").filter(Boolean);
  if (parts.length <= 2) return h;
  // keep last two labels, but allow ccTLDs like .co.uk (keep last 3 if second last is common SLD)
  const sld = parts[parts.length - 2];
  const cc = parts[parts.length - 1];
  const commonSLD = new Set(["co", "com", "org", "net", "gov", "ac"]);
  if (cc.length === 2 && commonSLD.has(sld)) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

// domain weight (higher = more credible default)
function domainWeight(url) {
  const h = hostname(url);
  const rd = rootDomain(url);

  // high trust institutions & vendors
  const HIGH = [
    "nature.com","science.org","aaas.org","aps.org","arxiv.org",
    "nih.gov","nasa.gov","who.int",
    "mit.edu","stanford.edu","harvard.edu","caltech.edu","ox.ac.uk","cam.ac.uk",
    "help.sap.com","learning.sap.com","sap.com"
  ];
  // medium trust references / pro media / vendor blogs / consultancies
  const MED = [
    "wikipedia.org","blogs.sap.com","sap-press.com","redhat.com","microsoft.com",
    "ibm.com","oracle.com","docs.aws.amazon.com","cloud.google.com",
    "s-peers.com","accenture.com","deloitte.com","pwc.com","kpmg.com",
    "gartner.com","forrester.com"
  ];
  // low (still allowed but de-weighted)
  const LOW = ["youtube.com","reddit.com","medium.com","substack.com"];

  if (HIGH.some(d => rd.endsWith(d))) return 1.0;
  if (MED.some(d => rd.endsWith(d)))  return 0.7;
  if (LOW.some(d => rd.endsWith(d)))  return 0.3;

  // heuristic bumps
  if (h.endsWith(".edu") || h.endsWith(".ac.uk")) return 0.9;
  if (h.endsWith(".gov")) return 0.9;

  return 0.5; // default medium
}

// --- Brave search ---------------------------------------------------------
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

// --- main entry -----------------------------------------------------------
export async function webScan(query, maxResults = 5) {
  const hits = await braveSearch(query, maxResults);
  if (!hits.sources.length) return hits;

  const enriched = [];
  for (const h of hits.sources.slice(0, maxResults)) {
    const text = await fetchPageText(h.url);
    const snippet = pickSnippets(text || h.preview || "", query, 1400);
    const w = domainWeight(h.url);
    const rd = rootDomain(h.url);
    // simple score: snippet relevance proxy = snippet length (non-empty) + weight
    const relevance = snippet ? 1 : 0;
    const score = relevance * 1.0 + w * 1.0;
    enriched.push({ title: h.title, url: h.url, snippet, weight: w, root_domain: rd, score });
  }

  // sort by score desc, then weight, then keep
  enriched.sort((a, b) => b.score - a.score || b.weight - a.weight);

  // diversity: keep at least 2 distinct domains if possible
  const seen = new Set();
  const final = [];
  for (const e of enriched) {
    const key = e.root_domain;
    // allow multiple from same domain but prefer new ones first
    if (!seen.has(key) || final.length < 2) {
      seen.add(key);
      final.push(e);
    }
  }
  // if still fewer than requested, append remaining
  for (const e of enriched) {
    if (final.length >= Math.min(maxResults, enriched.length)) break;
    if (!final.includes(e)) final.push(e);
  }

  return {
    sources: final.map(({ title, url, snippet }) => ({ title, url, snippet })),
    note: "",
    stats: {
      unique_domains: Array.from(new Set(final.map(x => x.root_domain))).length,
      by_domain: final.map(x => ({ domain: x.root_domain, weight: x.weight })),
    },
  };
}
