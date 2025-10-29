const OpenAI = require("openai");

const MODEL = process.env.MODEL || "gpt-4.1-mini";

async function withRetry(fn, tries = 2) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 500 * (i + 1))); }
  }
  throw lastErr;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    const { message = "" } = req.body || {};

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey)
      return res.json({ ok: true, reply: "API 키가 없어 현재는 응답할 수 없습니다." });

    const client = new OpenAI({ apiKey });
    const system = `
너는 친절하고 따뜻한 대화 파트너야.
- 사용자의 감정과 고민을 존중하며, 공감과 정보 중심으로 대화해.
- 정신건강, 학교, 진로, 인간관계, 일반 지식 등 어떤 주제든 차분히 대답해.
- 확실하지 않으면 "그 부분은 잘 모르겠어요"라고 말해.
- 위기 상황(자해, 자살 등)에는 반드시 1577-0199 또는 119 안내.
- 답변은 3~6문장.
    `.trim();

    const user = `사용자 메시지:\n${message}`;

    const call = () => client.responses.create({
      model: MODEL,
      input: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      max_output_tokens: 800,
      temperature: 0.7
    });

    const resp = await withRetry(call, 2);
    const out = resp.output_text ?? (resp.output?.[0]?.content?.[0]?.text || "");
    return res.json({ ok: true, reply: out || "응답을 가져올 수 없습니다." });

  } catch (e) {
    console.error("chat api error:", e);
    return res.status(500).json({ ok: false, error: "GPT 호출 실패" });
  }
};
