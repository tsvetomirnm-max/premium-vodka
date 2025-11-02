// api/orchestrate.js
import OpenAI from "openai";
import {
  RESPONDER_SYS,
  VERIFIER_SYS,
  WATCHDOG_SYS,
  DISPROVER_SYS,
  OBJECTION_WATCHDOG_SYS,
  REFINER_SYS,
  OPINIONATOR_SYS,
  VALUATOR_SYS,
  REVERSER_SYS,
  VERIFIER_NEGATION_SYS,
  TRUTH_SCALES_SYS,
} from "../lib/roles.js";
import { webScan } from "../lib/webscan.js";

const MODEL = "gpt-4o-mini";

async function chatJSON(client, messages) {
  const r = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages,
  });
  const raw = r.choices?.[0]?.message?.content || "{}";
  try { return JSON.parse(raw); } catch { return {}; }
}

// Helper: run one Responder
async function runResponder(client, prompt) {
  return chatJSON(client, [
    { role: "system", content: RESPONDER_SYS },
    { role: "user", content: prompt },
  ]);
}

// Helper: run Watchdog on (prompt, answer)
async function runWatchdog(client, prompt, answerText) {
  return chatJSON(client, [
    { role: "system", content: WATCHDOG_SYS },
    {
      role: "user",
      content:
        "PROMPT:\n" + prompt +
        "\n\nANSWER_TEXT:\n" + (answerText || "") +
        "\n\nReturn ONLY the Watchdog JSON.",
    },
  ]);
}

// Helper: run Verifier on responder JSON
async function runVerifier(client, responderJson) {
  return chatJSON(client, [
    { role: "system", content: VERIFIER_SYS },
    {
      role: "user",
      content:
        "Here is the Responder JSON to review:\n" +
        JSON.stringify(responderJson, null, 2) +
        "\nReturn ONLY the Verifier JSON.",
    },
  ]);
}

export default async function handler(req, res) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ ok: false, error: "Missing OPENAI_API_KEY" });
    }
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt =
      (req.method === "POST" && req.body && req.body.prompt) ||
      (req.query && req.query.prompt) ||
      "Explain TRUE VODKA in one sentence.";

    // Toggles
    const useOpinionator = (req.query.opinionator ?? "1") === "1";
    const useDisprover   = (req.query.disprover   ?? "1") === "1";
    const useNegation    = (req.query.negation    ?? "1") === "1";
    const useWeb         = (req.query.web         ?? "0") === "1";

    // 0) VALUATOR — tells us difficulty & suggested.responders
    const valuator = await chatJSON(client, [
      { role: "system", content: VALUATOR_SYS },
      { role: "user", content: prompt },
    ]);
    const suggestedResponders = Math.max(
      1,
      Math.min(3, Number(valuator?.suggested?.responders || 1)) // cap at 3 for cost/latency
    );
    const isHard =
      (valuator?.difficulty === "hard") || (valuator?.ambiguity === "high");

    // 1) MULTI-RESPONDER FANOUT (K = suggestedResponders)
    const responders_all = [];
    const verifiers_all = [];
    const watchdogs_all = [];

    for (let i = 0; i < suggestedResponders; i++) {
      const r = await runResponder(client, prompt);
      responders_all.push(r);
      // For complex questions, verify EACH draft before selection
      if (isHard) {
        const v = await runVerifier(client, r);
        verifiers_all.push(v);
        const candidate = v?.corrected_answer || r?.final_answer || "";
        const w = await runWatchdog(client, prompt, candidate);
        watchdogs_all.push(w);
      } else {
        // For easy/medium, watchdog the raw responder answer
        const w = await runWatchdog(client, prompt, r?.final_answer || "");
        watchdogs_all.push(w);
        verifiers_all.push(null); // not used for selection in easy mode
      }
    }

    // 2) SELECT BEST RESPONDER (rule: highest watchdog confidence with answers_prompt=true)
    //    If hard: watchdog is run on verifier-corrected text, else on responder text.
    let bestIdx = 0;
    let bestScore = -1;
    for (let i = 0; i < responders_all.length; i++) {
      const w = watchdogs_all[i] || {};
      const ok = !!w.answers_prompt;
      const score = ok ? Number(w.confidence || 0) : -1;
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }

    const responder = responders_all[bestIdx];
    // Always run final Verifier on the selected Responder (to get a corrected answer)
    const verifier = isHard && verifiers_all[bestIdx]
      ? verifiers_all[bestIdx]
      : await runVerifier(client, responder);

    let candidateAnswer = verifier?.corrected_answer || responder?.final_answer || "";

    // 3) Watchdogs for record (selected)
    const watchdog_responder = await runWatchdog(client, prompt, responder?.final_answer || "");
    const watchdog_verifier  = await runWatchdog(client, prompt, candidateAnswer);

    // 4) (Optional) DISPROVER + OBJECTION WATCHDOG + REFINER
    let disprover = null, objection_watchdog = null, refiner = null;
    if (useDisprover) {
      disprover = await chatJSON(client, [
        { role: "system", content: DISPROVER_SYS },
        {
          role: "user",
          content:
            "Analyze this answer and list its weakest points or likely errors:\n\n" +
            candidateAnswer +
            "\n\nReturn ONLY the Disprover JSON.",
        },
      ]);
      const antiText = Array.isArray(disprover?.objections)
        ? disprover.objections.map(o => `• ${o.claim_or_point}: ${o.rationale}`).join("\n")
        : "";
      objection_watchdog = await chatJSON(client, [
        { role: "system", content: OBJECTION_WATCHDOG_SYS },
        {
          role: "user",
          content:
            "PROMPT:\n" + prompt +
            "\n\nANSWER_TEXT:\n" + candidateAnswer +
            "\n\nOBJECTIONS:\n" + antiText +
            "\n\nReturn ONLY the Objection Watchdog JSON.",
        },
      ]);
      if (objection_watchdog?.relevant_to_prompt) {
        refiner = await chatJSON(client, [
          { role: "system", content: REFINER_SYS },
          {
            role: "user",
            content:
              "CANDIDATE_ANSWER:\n" + candidateAnswer +
              "\n\nRELEVANT_OBJECTIONS:\n" + antiText +
              "\n\nReturn ONLY the Refiner JSON.",
          },
        ]);
        if (refiner?.changed && refiner?.refined_answer) {
          candidateAnswer = refiner.refined_answer;
        }
      }
    }

    // 5) NEGATION TEST (optional)
    let reverser = null, negation_verifier = null;
    if (useNegation && Array.isArray(responder?.claims) && responder.claims.length > 0) {
      reverser = await chatJSON(client, [
        { role: "system", content: REVERSER_SYS },
        { role: "user", content: "CLAIMS:\n" + JSON.stringify(responder.claims, null, 2) },
      ]);
      negation_verifier = await chatJSON(client, [
        { role: "system", content: VERIFIER_NEGATION_SYS },
        { role: "user", content: "NEGATED_CLAIMS:\n" + JSON.stringify(reverser, null, 2) },
      ]);
    }

    // 6) OPINIONATOR (optional)
    let opinionator = null;
    if (useOpinionator) {
      opinionator = await chatJSON(client, [
        { role: "system", content: OPINIONATOR_SYS },
        { role: "user", content: prompt },
      ]);
    }

    // 7) WEB SCAN + TRUTH SCALES (optional; Brave-based)
    let web_evidence = null, truth_scales = null;
    if (useWeb) {
      web_evidence = await webScan(prompt, 5); // { sources: [{title,url,snippet}], note }
      if (Array.isArray(web_evidence?.sources) && web_evidence.sources.length > 0) {
        const evidence = web_evidence.sources.map((s, i) => ({
          title: s.title || `Source ${i + 1}`,
          url: s.url,
          text: s.snippet || "",
        }));
        truth_scales = await chatJSON(client, [
          { role: "system", content: TRUTH_SCALES_SYS },
          {
            role: "user",
            content:
              "CLAIMS:\n" + JSON.stringify(responder?.claims || [], null, 2) +
              "\n\nEVIDENCE SNIPPETS (title, url, text):\n" + JSON.stringify(evidence, null, 2) +
              "\n\nReturn ONLY the Truth Scales JSON.",
          },
        ]);
      } else {
        truth_scales = { per_claim: [], overall: "insufficient", note: web_evidence?.note || "" };
      }
    }

    // 8) Verdict (keep it transparent & simple)
    let verdict = verifier?.verdict || "uncertain";
    if (watchdog_verifier?.answers_prompt === false) verdict = "needs_correction";
    if (watchdog_responder?.answers_prompt === false) verdict = "needs_correction";

    const antiSeverity = (disprover?.severity || "").toLowerCase();
    const objectionsRelevant = !!(objection_watchdog?.relevant_to_prompt);
    if (objectionsRelevant && (antiSeverity === "medium" || antiSeverity === "high")) {
      verdict = verdict === "strongly_supported" ? "mixed" : verdict;
    }
    if (negation_verifier?.any_issue) verdict = "mixed";
    if (truth_scales?.overall === "refuted" || truth_scales?.overall === "insufficient") {
      verdict = truth_scales.overall === "refuted" ? "needs_correction" : "mixed";
    }

    const final_answer = candidateAnswer;

    const logs = {
      model: MODEL,
      suggestedResponders,
      isHard,
      useOpinionator, useDisprover, useNegation, useWeb,
      web_note: web_evidence?.note || undefined,
      selected_idx: bestIdx,
    };

    return res.status(200).json({
      ok: true,
      prompt,
      valuator,
      responders_all,
      verifiers_all,
      watchdogs_all,
      selected_idx: bestIdx,
      responder,
      verifier,
      watchdog_responder,
      watchdog_verifier,
      disprover,
      objection_watchdog,
      refiner,
      reverser,
      negation_verifier,
      opinionator,
      web_evidence,
      truth_scales,
      final: { verdict, answer: final_answer },
      logs,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
