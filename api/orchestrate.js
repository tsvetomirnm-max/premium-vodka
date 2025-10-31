import OpenAI from "openai";
import { RESPONDER_SYS, VERIFIER_SYS, VIABILITY_SYS } from "../lib/roles.js";

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

    // 3) VIABILITY (for Responder answer vs the prompt)
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

    // Minimal final decision (we’ll expand later)
    const final_answer = verifier?.corrected_answer || responder?.final_answer || "";
    const verdict =
      verifier?.verdict || (viability_responder?.answers_prompt ? "ok" : "uncertain");

    return res.status(200).json({
      ok: true,
      prompt,
      responder,
      verifier,
      viability_responder,
      final: { verdict, answer: final_answer },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
