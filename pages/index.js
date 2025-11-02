// pages/index.js
import { useState } from "react";
import Head from "next/head";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // toggles (all ON by default)
  const [useWeb, setUseWeb] = useState(true);
  const [useDisprover, setUseDisprover] = useState(true);
  const [useOpinionator, setUseOpinionator] = useState(true);
  const [useNegation, setUseNegation] = useState(true);

  async function ask() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const params = new URLSearchParams({
        web: useWeb ? "1" : "0",
        disprover: useDisprover ? "1" : "0",
        opinionator: useOpinionator ? "1" : "0",
        negation: useNegation ? "1" : "0",
        prompt,
      });
      const r = await fetch(`/api/orchestrate?${params.toString()}`);
      const data = await r.json();
      setResult(data);
    } catch (e) {
      setResult({ ok: false, error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  const certainty = (() => {
    // derive a 0–100% score from available fields
    const vConf = result?.verifier?.overall_confidence;
    const rConf = result?.responder?.overall_confidence;
    const base = typeof vConf === "number" ? vConf
               : typeof rConf === "number" ? rConf
               : 0.6;
    // light tweak by verdict
    const verdict = result?.final?.verdict;
    const bump =
      verdict === "strongly_supported" ? 0.15
      : verdict === "ok" ? 0.08
      : verdict === "mixed" ? -0.05
      : verdict === "needs_correction" ? -0.15
      : 0;
    const pct = Math.max(0, Math.min(1, base + bump)) * 100;
    return Math.round(pct);
  })();

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask();
    }
  }

  return (
    <>
      <Head>
        {/* Font similar to ABSOLUT VODKA (condensed, bold) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Oswald:wght@600;700&display=swap"
          rel="stylesheet"
        />
        <title>TRUE VODKA</title>
      </Head>

      <div style={styles.page}>
        <h1 style={styles.brand}>TRUE VODKA</h1>

        <div style={styles.inputRow}>
          <textarea
            style={styles.textarea}
            rows={3}
            placeholder="Type your prompt… (Enter to send)"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button
            aria-label="Send"
            onClick={ask}
            disabled={loading}
            style={styles.sendButton}
            title="Send"
          >
            ↑
          </button>
        </div>

        <div style={styles.toggles}>
          <label style={styles.checkbox}>
            <input
              type="checkbox"
              checked={useWeb}
              onChange={(e) => setUseWeb(e.target.checked)}
            />
            Use web sources
          </label>
          <label style={styles.checkbox}>
            <input
              type="checkbox"
              checked={useDisprover}
              onChange={(e) => setUseDisprover(e.target.checked)}
            />
            Disprover (detective)
          </label>
          <label style={styles.checkbox}>
            <input
              type="checkbox"
              checked={useOpinionator}
              onChange={(e) => setUseOpinionator(e.target.checked)}
            />
            Opinionator
          </label>
          <label style={styles.checkbox}>
            <input
              type="checkbox"
              checked={useNegation}
              onChange={(e) => setUseNegation(e.target.checked)}
            />
            Negation test
          </label>
        </div>

        {/* Results */}
        <div style={styles.resultsWrap}>
          <div style={styles.answerBox}>
            {loading ? (
              <div style={styles.muted}>Thinking…</div>
            ) : !result ? (
              <div style={styles.muted}>Your answer will appear here.</div>
            ) : result?.ok ? (
              <div style={styles.answerText}>{result?.final?.answer || "(no answer)"}</div>
            ) : (
              <div style={styles.errorText}>{result?.error || "Error"}</div>
            )}
          </div>

          <div style={styles.scoreBox}>
            <div style={styles.scoreLabel}>Certainty</div>
            <div style={styles.scoreValue}>{isNaN(certainty) ? "—" : `${certainty}%`}</div>
            {result?.final?.verdict && (
              <div style={styles.verdict}>Verdict: {result.final.verdict}</div>
            )}
          </div>
        </div>

        <div style={styles.footerNav}>
          <a href="/lab" style={styles.link}>
            Deep Test →
          </a>
        </div>
      </div>
    </>
  );
}

const styles = {
  page: {
    background: "#fff",
    color: "#000",
    minHeight: "100vh",
    padding: "4rem 1.5rem",
    fontFamily:
      "'Helvetica Neue', Helvetica, Arial, 'Oswald', system-ui, -apple-system, sans-serif",
  },
  brand: {
    fontFamily: "'Oswald', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
    fontWeight: 700,
    letterSpacing: "0.04em",
    fontSize: "4rem",
    margin: "0 0 2rem 0",
    textAlign: "center",
  },
  inputRow: {
    position: "relative",
    maxWidth: 900,
    margin: "0 auto",
    display: "flex",
    alignItems: "stretch",
    gap: 0,
  },
  textarea: {
    flex: 1,
    border: "2px solid #000",
    borderRadius: 0,
    padding: "1rem 3.25rem 1rem 1rem",
    fontSize: "1rem",
    outline: "none",
    resize: "vertical",
    background: "#fff",
    color: "#000",
    minHeight: 84,
  },
  sendButton: {
    position: "absolute",
    right: 0,
    top: 0,
    height: "100%",
    width: "3rem",
    border: "2px solid #000",
    borderLeft: "none",
    borderRadius: 0,
    background: "#fff",
    color: "#000",
    fontSize: "1.3rem",
    fontWeight: 700,
    cursor: "pointer",
  },
  toggles: {
    maxWidth: 900,
    margin: "0.75rem auto 0",
    display: "flex",
    gap: "1.25rem",
    flexWrap: "wrap",
    alignItems: "center",
    fontSize: "0.95rem",
    userSelect: "none",
  },
  checkbox: { display: "inline-flex", gap: "0.5rem", alignItems: "center" },
  resultsWrap: {
    maxWidth: 900,
    margin: "1.5rem auto 0",
    display: "grid",
    gridTemplateColumns: "1fr 220px",
    gap: "1rem",
  },
  answerBox: {
    border: "2px solid #000",
    borderRadius: 0,
    padding: "1rem",
    minHeight: 160,
    background: "#fff",
  },
  answerText: { whiteSpace: "pre-wrap", lineHeight: 1.4 },
  muted: { color: "#555" },
  errorText: { color: "#b00000", whiteSpace: "pre-wrap" },
  scoreBox: {
    border: "2px solid #000",
    borderRadius: 0,
    padding: "1rem",
    background: "#fff",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    gap: "0.5rem",
    alignSelf: "start",
    minHeight: 160,
  },
  scoreLabel: { fontSize: "0.9rem", color: "#333" },
  scoreValue: { fontSize: "2rem", fontWeight: 800 },
  verdict: { fontSize: "0.9rem", color: "#333" },
  footerNav: {
    maxWidth: 900,
    margin: "1rem auto 0",
    display: "flex",
    justifyContent: "flex-end",
  },
  link: {
    color: "#000",
    textDecoration: "none",
    borderBottom: "2px solid #000",
    paddingBottom: 2,
  },
};
