import OpenAI from "openai";

const MODEL = "gpt-4o-mini";

export default async function handler(req, res) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ ok: false, error: "Missing OPENAI_API_KEY" });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const userPrompt =
      (req.method === "POST" && req.body && req.body.prompt) ||
      (req.query && req.query.prompt) ||
      "Explain Premium Vodka in one sentence.";

    // 1) RESPONDER PASS (same logic as /api/responder)
    const responderSys =
      "You are Premium Vodka Responder. Answer concisely. Then output strict JSON ONLY with keys: final_answer (string), overall_confidence (0..1), claims (array of objects with id (string), text (string), type (fact|stat|quote|procedural|definition), confidence (0..1)). No extra text.";
    const responderMessages = [
      { role: "system", content: responderSys },
      { role: "user", content: userPrompt },
    ];

    const responderResp = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: responderMessages,
    });

    const responderRaw = responderResp.choices?.[0]?.message?.content ?? "{}";
    let responderData;
    try {
      responderData = JSON.parse(responderRaw);
    } catch {
      responderData = { final_answer: "", overall_confidence: 0, claims: [] };
    }

    // 2) VERIFIER PASS: review responderData and correct if needed
    const verifierSys =
      "You are Premium Vodka Verifier. Review the Responder's JSON (final_answer + claims). " +
      "Check for internal coherence and common factual mistakes. If something seems wrong or overstated, " +
      "produce a minimally corrected answer while preserving scope and tone. Output strict JSON ONLY with keys: " +
      "corrected_answer (string), verdict (strongly_supported|mixed|needs_correction|uncertain), " +
      "claims_review (array of {id, status: verified|corrected|flagged|unclear, notes}), overall_confidence (0..1). No extra text.";
    const verifierMessages = [
      { role: "system", content: verifierSys },
      {
        role: "user",
        content:
          "Here is the Responder JSON to review:\n\n" +
          JSON.stringify(responderData, null, 2) +
          "\n\nReturn only the Verifier JSON.",
      },
    ];

    const verifierResp = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: verifierMessages,
    });

    const verifierRaw = verifierResp.choices?.[0]?.message?.content ?? "{}";
    let verifierData;
    try {
      verifierData = JSON.parse(verifierRaw);
    } catch {
      verifierData = {
        corrected_answer: responderData.final_answer || "",
        verdict: "uncertain",
        claims_review: [],
        overall_confidence: 0,
      };
    }

    return res.status(200).json({
      ok: true,
      prompt: userPrompt,
      responder: responderData,
      verifier: verifierData,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
