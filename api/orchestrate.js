import OpenAI from "openai";
import {
  RESPONDER_SYS,
  VERIFIER_SYS,
  VIABILITY_SYS,
  ANTI_FACT_SYS,
} from "../lib/roles.js";

const MODEL = "gpt-4o-mini";

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

    // 1) RESPONDER → draft + claims
    const responder = await chatJSON(client, [
      { role: "system", content: RESPONDER_SYS },
      { role: "user", content: prompt },
    ]);

    // 2) VERIFIER → correctness pass (no access to prompt)
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

    // Decide current best answer text
    const candidateAnswer = verifier?.corrected_answer || responder?.final_answer || "";

    // 3) VIABILITY on Responder answer vs prompt
    const viability_responder = await chatJSON(client, [
      { role: "system", content: VIABILITY_SYS },
      {
        role: "user",
        content:
          "PROMPT:\n" +
          prompt +
          "\n\nANSWER_TEXT:\n" +
          (responder?.final_answer || "") +
          "\n\nReturn ONLY the Viability JSON.",
      },
    ]);

    // 4) VIABILITY on Verifier corrected answer vs prompt
    const viability_verifier = await chatJSON(client, [
      { role: "system", content: VIABILITY_SYS },
      {
        role: "user",
        content:
          "PROMPT:\n" +
          prompt +
          "\n\nANSWER_TEXT:\n" +
          candidateAnswer +
          "\n\nReturn ONLY the Viability JSON.",
      },
    ]);

    // 5) ANTI-FACT → adversarial objections on candidate answer
    const anti_fact = await chatJSON(client, [
      { role: "system", content: ANTI_FACT_SYS },
      {
        role: "user",
        content:
          "Analyze this answer and list its weakest points or likely errors:\n\n" +
          candidateAnswer +
          "\n\nReturn ONLY the Anti-Fact JSON.",
      },
    ]);

    // 6) VIABILITY on Anti-Fact output (are objections relevant to the prompt?)
    const antiText =
      Array.isArray(anti_fact?.objections)
        ? anti_fact.objections.map(o => `• ${o.claim_or_point}: ${o.rationale}`).join("\n")
        : "";
    const viability_anti = await chatJSON(client, [
      { role: "system", content: VIABILITY_SYS },
      {
        role: "user",
        content:
          "PROMPT:\n" +
          prompt +
          "\n\nANSWER_TEXT (objections list):\n" +
          antiText +
          "\n\nReturn ONLY the Viability JSON.",
      },
    ]);

    // Minimal final decision logic
    let verdict = verifier?.verdict || "uncertain";
    if (viability_verifier?.answers_prompt === false) verdict = "needs_correction";
    if (viability_responder?.answers_prompt === false) verdict = "needs_correction";
    if ((anti_fact?.severity || "").toLowerCase() === "high") verdict = "mixed";

    const final_answer = candidateAnswer;

    return res.status(200).json({
      ok: true,
      prompt,
      responder,
      verifier,
      viability_responder,
      viability_verifier,
      anti_fact,
      viability_anti,
      final: { verdict, answer: final_answer }
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
