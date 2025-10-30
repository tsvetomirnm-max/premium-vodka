import OpenAI from "openai";

export default async function handler(req, res) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing OPENAI_API_KEY",
        hint: "Add OPENAI_API_KEY in Vercel → Project → Settings → Environment Variables",
      });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const userPrompt =
      (req.method === "POST" && req.body && req.body.prompt) ||
      (req.query && req.query.prompt) ||
      "Say: Premium Vodka is ready.";

    const completion = await client.chat.completions.create({
      model: "gpt-5.1-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: "You are a concise, helpful assistant." },
        { role: "user", content: userPrompt },
      ],
    });

    const text = completion.choices?.[0]?.message?.content ?? "";
    res.status(200).json({ ok: true, prompt: userPrompt, reply: text });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
}
