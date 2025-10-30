import OpenAI from "openai";

export default async function handler(req, res) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing OPENAI_API_KEY",
      });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const userPrompt =
      (req.method === "POST" && req.body && req.body.prompt) ||
      (req.query && req.query.prompt) ||
      "Explain Premium Vodka in one sentence.";

    const messages = [
      {
        role: "system",
        content:
          "You are Premium Vodka Responder. Answer concisely. Then output strict JSON ONLY with keys: final_answer (string), overall_confidence (0..1), claims (array of objects with id (string), text (string), type (fact|stat|quote|procedural|definition), confidence (0..1)). No extra text.",
      },
      { role: "user", content: userPrompt },
    ];

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages,
    });

    const raw = completion.choices?.[0]?.message?.content ?? "{}";
    const data = JSON.parse(raw);

    return res.status(200).json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
