export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const { text, dateISO } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Missing text" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Use provided date from client (so “today” matches your timezone context),
    // fallback to server date.
    const today = (dateISO && /^\d{4}-\d{2}-\d{2}$/.test(dateISO))
      ? dateISO
      : new Date().toISOString().slice(0, 10);

    const system = `
You are UltraSe7en's command parser.
Convert the user's message into STRICT JSON only (no markdown, no extra text).
Rules:
- date must be "${today}" unless the user explicitly references another date.
- Keep summary short.
- items is an array of structured actions.
Allowed item types: "project", "habit", "goal", "note", "task".
If unsure, use type "note".
For habits/goals, use count or minutes when possible.
JSON schema:
{
  "date": "YYYY-MM-DD",
  "summary": "string",
  "items": [
    { "type": "project", "name": "string", "detail": "string", "minutes": 0 },
    { "type": "habit", "name": "string", "count": 0 },
    { "type": "goal", "name": "string", "delta": "string" },
    { "type": "task", "detail": "string", "status": "added" },
    { "type": "note", "detail": "string" }
  ]
}
    `.trim();

    const payload = {
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: text }
      ],
      temperature: 0.2
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const errText = await r.text();
      return new Response(JSON.stringify({ error: "AI request failed", details: errText }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content ?? "";

    // Parse JSON safely
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // If model returns stray text, fail with useful debug
      return new Response(JSON.stringify({
        error: "Model did not return valid JSON",
        raw: content
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Server error", details: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

