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
  TRUTH_SCALES_SYS, // not used yet (no web), placeholder for later
} from "../lib/roles.js";

const MODEL = "gpt-4o-mini";

// Utility: JSON-only chat call
async function chatJSON(client, messages) {
  const r = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages,
  });
  const raw = r.choices?.[0]?.message?.content || "{}";
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
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

    // Optional toggles from query (for experimentation)
    const useOpinionator = (req.query.opinionator ?? "1") === "1";
    const useDisprover = (req.query.disprover ?? "1") === "1";
    const useNegation = (req.query.negation ?? "1") === "1";
    // Placeholder for web scanner/scales later
    const useWeb = (req.query.web ?? "0") === "1";

    // 0) VALUATOR — plan how hard this is (guides orchestration heuristics)
    const valuator = await chatJSON(client, [
      { role: "system", content: VALUATOR_SYS },
      { role: "user", content: prompt },
    ]);

    // 1) RESPONDER — draft + claims
    const responder = await chatJSON(client, [
      { role: "system", content: RESPONDER_SYS },
      { role: "user", content: prompt },
    ]);

    // 2) VERIFIER — correctness pass (no prompt access)
    const verifier = await chatJSON(client, [
      { role: "system", content: VERIFIER_SYS },
      {
        role: "user",
        content:
          "Here is the Responder JSON to review:\n" +
          JSON.stringify(responder, null, 2) +
          "\nReturn ONLY the Verifier JSON.",
      },
    ]);

    // Choose candidate answer after verifier
    let candidateAnswer = verifier?.corrected_answer || responder?.final_answer || "";

    // 3) WATCHDOG — on Responder vs Prompt
    const watchdog_responder = await chatJSON(client, [
      { role: "system", content: WATCHDOG_SYS },
      {
        role: "user",
        content:
          "PROMPT:\n" +
          prompt +
          "\n\nANSWER_TEXT:\n" +
          (responder?.final_answer || "") +
          "\n\nReturn ONLY the Watchdog JSON.",
      },
    ]);

    // 4) WATCHDOG — on Verifier-corrected vs Prompt
    const watchdog_verifier = await chatJSON(client, [
      { role: "system", content: WATCHDOG_SYS },
      {
        role: "user",
        content:
          "PROMPT:\n" +
          prompt +
          "\n\nANSWER_TEXT:\n" +
          candidateAnswer +
          "\n\nReturn ONLY the Watchdog JSON.",
      },
    ]);

    // 5) DISPROVER — adversarial objections
    let disprover = null;
    let objection_watchdog = null;
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

      // Are objections relevant to the prompt/answer?
      const antiText =
        Array.isArray(disprover?.objections)
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
    }

    // 6) REFINER — address relevant objections with minimal edits
    let refiner = null;
    if (useDisprover && objection_watchdog?.relevant_to_prompt) {
      const antiText =
        Array.isArray(disprover?.objections)
          ? disprover.objections.map(o => `• ${o.claim_or_point}: ${o.rationale}`).join("\n")
          : "";
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

    // 7) NEGATION CHECK — reverse claims and verify that negations are NOT true
    let reverser = null;
    let negation_verifier = null;
    if (useNegation && Array.isArray(responder?.claims) && responder.claims.length > 0) {
      reverser = await chatJSON(client, [
        { role: "system", content: REVERSER_SYS },
        {
          role: "user",
          content:
            "CLAIMS:\n" + JSON.stringify(responder.claims, null, 2) +
            "\n\nReturn ONLY the Reverser JSON.",
        },
      ]);

      // Verify negations: if any negated claim looks true, flag issue
      negation_verifier = await chatJSON(client, [
        { role: "system", content: VERIFIER_NEGATION_SYS },
        {
          role: "user",
          content:
            "NEGATED_CLAIMS:\n" + JSON.stringify(reverser, null, 2) +
            "\n\nReturn ONLY the Negation Verifier JSON.",
        },
      ]);
    }

    // 8) OPINIONATOR — identify contested topics & viewpoints
    let opinionator = null;
    if (useOpinionator) {
      opinionator = await chatJSON(client, [
        { role: "system", content: OPINIONATOR_SYS },
        { role: "user", content: prompt },
      ]);
    }

    // (Placeholder) 9) TRUTH SCALES — when you add web sources later
    // If useWeb is true, you would:
    //  - fetch snippets externally (your Web Scanner)
    //  - call TRUTH_SCALES_SYS with {claims, snippets} to get verified/refuted per-claim results.

    // 10) Compose final verdict (very simple heuristics; refine later)
    let verdict = verifier?.verdict || "uncertain";
    if (watchdog_verifier?.answers_prompt === false) verdict = "needs_correction";
    if (watchdog_responder?.answers_prompt === false) verdict = "needs_correction";

    const antiSeverity = (disprover?.severity || "").toLowerCase();
    const objectionsRelevant = !!(objection_watchdog?.relevant_to_prompt);
    if (objectionsRelevant && (antiSeverity === "medium" || antiSeverity === "high")) {
      verdict = verdict === "strongly_supported" ? "mixed" : verdict;
    }
    if (negation_verifier?.any_issue) {
      verdict = "mixed";
    }

    // 11) Final answer (candidate answer possibly refined)
    const final_answer = candidateAnswer;

    // 12) Minimal logs to help you tune
    const logs = {
      useOpinionator,
      useDisprover,
      useNegation,
      useWeb,
      model: MODEL,
    };

    return res.status(200).json({
      ok: true,
      prompt,
      valuator,
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
      final: { verdict, answer: final_answer },
      logs,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
