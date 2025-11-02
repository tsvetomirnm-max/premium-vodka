// pages/lab.js
import { useState } from "react";
import Head from "next/head";

export default function Lab() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // toggles (default ON)
  const [useWeb, setUseWeb] = useState(true);
  const [useDisprover, setUseDisprover] = useState(true);
  const [useOpinionator, setUseOpinionator] = useState(true);
  const [useNegation, setUseNegation] = useState(true);

  async function run() {
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
      setResult(await r.json());
    } catch (e) {
      setResult({ ok: false, error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      run();
    }
  }

  // Build per-role call counts (best-effort from payload)
  const counts = (() => {
    const d = result || {};
    const c = {};
    c.valuator = d.valuator ? 1 : 0;
    c.responder = Array.isArray(d.responders_all) ? d.responders_all.length : d.responder ? 1 : 0;
    c.verifier =
      (Array.isArray(d.verifiers_all) ? d.verifiers_all.filter(Boolean).length : 0) +
      (d.verifier ? 1 : 0);
    c.watchdog =
      (Array.isArray(d.watchdogs_all) ? d.watchdogs_all.length : 0) +
      (d.watchdog_responder ? 1 : 0) +
      (d.watchdog_verifier ? 1 : 0);
    c.disprover = d.disprover ? 1 : 0;
    c.objection_watchdog = d.objection_watchdog ? 1 : 0;
    c.refiner = d.refiner ? (d.refiner.changed ? 1 : 1) : 0;
    c.reverser = d.reverser ? 1 : 0;
    c.negation_verifier = d.negation_verifier ? 1 : 0;
    c.opinionator = d.opinionator ? 1 : 0;
    c.truth_scales = d.truth_scales ? 1 : 0;
    return c;
  })();

  const order = [
    "valuator",
    "responder",
    "verifier",
    "watchdog",
    "disprover",
    "objection_watchdog",
    "refiner",
    "reverser",
    "negation_verifier",
    "opinionator",
    "truth_scales",
  ];

  return (
    <>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Oswald:wght@600;700&display=swap"
          rel="stylesheet"
        />
        <title>TRUE VODKA — Lab</title>
      </Head>

      <div style={styles.page}>
        <div style={styles.topBar}>
          <a href="/" style={styles.link}>← Back</a>
          <div style={styles.brand}>TRUE VODKA / LAB</div>
        </div>

        <div style={styles.inputRow}>
          <textarea
            style={styles.textarea}
            rows={4}
            placeholder="Prompt for deep testing… (Enter to run)"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button onClick={run} disabled={loading} style={styles.sendButton} title="Run">
            ↑
          </button>
        </div>

        <div style={styles.toggles}>
          <label style={styles.checkbox}>
            <input type="checkbox" checked={useWeb} onChange={(e) => setUseWeb(e.target.checked)} />
            Use web sources
          </label>
          <label style={styles.checkbox}>
            <input type="checkbox" checked={useDisprover} onChange={(e) => setUseDisprover(e.target.checked)} />
            Disprover (detective)
          </label>
          <label style={styles.checkbox}>
            <input type="checkbox" checked={useOpinionator} onChange={(e) => setUseOpinionator(e.target.checked)} />
            Opinionator
          </label>
          <label style={styles.checkbox}>
            <input type="checkbox" checked={useNegation} onChange={(e) => setUseNegation(e.target.checked)} />
            Negation test
          </label>
        </div>

        {/* Final Answer */}
        <section style={styles.section}>
          <div style={styles.h2}>Final</div>
          <div style={styles.box}>
            {loading ? (
              <div style={styles.muted}>Running…</div>
            ) : !result ? (
              <div style={styles.muted}>Final answer will appear here.</div>
            ) : result?.ok ? (
              <>
                <div style={styles.answerText}>{result?.final?.answer || "(no answer)"} </div>
                <div style={styles.metaRow}>
                  <div>Verdict: <b>{result?.final?.verdict || "—"}</b></div>
                  {result?.logs?.web_diversity && (
                    <div>Web diversity: <b>{result.logs.web_diversity}</b></div>
                  )}
                </div>
              </>
            ) : (
              <div style={styles.errorText}>{result?.error || "Error"}</div>
            )}
          </div>
        </section>

        {/* Summary counts */}
        <section style={styles.section}>
          <div style={styles.h2}>Call summary</div>
          <div style={styles.box}>
            {order.map((k) => (
              <div key={k} style={styles.row}>
                <div style={{ width: 220 }}>{k}</div>
                <div>{counts[k] ?? 0}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Raw role outputs */}
        <section style={styles.section}>
          <div style={styles.h2}>Raw results by role</div>
          <div style={styles.box}>
            {!result ? (
              <div style={styles.muted}>Nothing yet.</div>
            ) : (
              <div style={{ display: "grid", gap: "1rem" }}>
                {[
                  ["valuator", result.valuator],
                  ["responders_all", result.responders_all],
                  ["verifiers_all", result.verifiers_all],
                  ["watchdogs_all", result.watchdogs_all],
                  ["selected_idx", result.selected_idx],
                  ["responder", result.responder],
                  ["verifier", result.verifier],
                  ["watchdog_responder", result.watchdog_responder],
                  ["watchdog_verifier", result.watchdog_verifier],
                  ["disprover", result.disprover],
                  ["objection_watchdog", result.objection_watchdog],
                  ["refiner", result.refiner],
                  ["reverser", result.reverser],
                  ["negation_verifier", result.negation_verifier],
                  ["opinionator", result.opinionator],
                  ["web_evidence", result.web_evidence],
                  ["truth_scales", result.truth_scales],
                  ["logs", result.logs],
                ].map(([label, data]) => (
                  <Details key={label} label={label} data={data} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function Details({ label, data }) {
  return (
    <details style={styles.details} open={false}>
      <summary style={styles.summary}>{label}</summary>
      <pre style={styles.pre}>
        {data ? JSON.stringify(data, null, 2) : "—"}
      </pre>
    </details>
  );
}

const styles = {
  page: {
    background: "#fff",
    color: "#000",
    minHeight: "100vh",
    padding: "2rem 1.5rem 4rem",
    fontFamily:
      "'Helvetica Neue', Helvetica, Arial, 'Oswald', system-ui, -apple-system, sans-serif",
    maxWidth: 1100,
    margin: "0 auto",
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "1rem",
  },
  link: {
    color: "#000",
    textDecoration: "none",
    borderBottom: "2px solid #000",
    paddingBottom: 2,
  },
  brand: {
    fontFamily: "'Oswald', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
    fontWeight: 700,
    letterSpacing: "0.04em",
  },
  inputRow: {
    position: "relative",
    marginTop: "0.5rem",
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
    minHeight: 100,
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
    marginTop: "0.75rem",
    display: "flex",
    gap: "1.25rem",
    flexWrap: "wrap",
    alignItems: "center",
    fontSize: "0.95rem",
    userSelect: "none",
  },
  checkbox: { display: "inline-flex", gap: "0.5rem", alignItems: "center" },

  section: { marginTop: "1.5rem" },
  h2: { fontWeight: 700, marginBottom: "0.5rem", letterSpacing: "0.02em" },

  box: {
    border: "2px solid #000",
    borderRadius: 0,
    background: "#fff",
    padding: "1rem",
  },
  row: { display: "flex", justifyContent: "space-between", padding: "0.25rem 0" },

  answerText: { whiteSpace: "pre-wrap", lineHeight: 1.4 },
  metaRow: { marginTop: "0.75rem", display: "flex", gap: "1.5rem", color: "#333" },
  muted: { color: "#555" },
  errorText: { color: "#b00000", whiteSpace: "pre-wrap" },

  details: {
    border: "2px solid #000",
    borderRadius: 0,
    padding: "0.5rem 0.75rem",
  },
  summary: {
    cursor: "pointer",
    fontWeight: 600,
    listStyle: "none",
    outline: "none",
  },
  pre: {
    marginTop: "0.5rem",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontSize: "0.9rem",
    lineHeight: 1.35,
  },
};
