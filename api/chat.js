const OpenAI = require("openai");

const MODEL = process.env.MODEL || "gpt-4.1-mini"; // 기본: 빠르고 안정적
const SCOPE_KEYWORDS = [
  "우울","우울증","슬픔","무기력","불안","공황","스트레스","수면","잠",
  "자살","자해","멘탈","정신건강","상담","위기","마음","감정","피곤","자존감","우울감"
];

function inScope(text="") {
  const t = (text || "").toLowerCase();
  return SCOPE_KEYWORDS.some(k => t.includes(k.toLowerCase()));
}

// 재시도 유틸 (지수백오프)
async function withRetry(fn, tries = 2) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    const { message = "" } = req.body || {};

    // 범위 밖이면 정중 거절 (느슨하게 유지)
    if (!inScope(message)) {
      return res.json({
        ok: true,
        reply:
          "이 챗은 우울/불안/정신건강 관련 1차 지원 전용이에요. 그 밖의 주제는 아직 잘 몰라요. " +
          "마음이 힘들거나 걱정/불안/수면 등과 관련된 이야기는 편하게 물어봐 주세요. " +
          "위기라면 즉시 1577-0199 또는 119에 연락해 주세요."
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // 키 없을 땐 기본 안전 응답
      return res.json({
        ok: true,
        reply:
          "지금은 간단 안내만 가능해요. 혹시 자해/자살 생각이 있다면 지금 바로 1577-0199 또는 119에 연락해 주세요.\n" +
          "이 도구는 선별용이며 전문 진단/치료가 아닙니다."
      });
    }

    const client = new OpenAI({ apiKey });
    const system = `
너는 청소년 정신건강 1차 지원 챗봇이야.
- 진단/치료/처방 금지. 공감/정보/연결만.
- 모호하거나 확실치 않은 내용은 과감히 "그 부분은 제가 잘 모르겠어요. 대신 전문가 상담을 권해요."라고 말해.
- 자살/자해 신호(직접 표현/구체 계획 등)면 맨 앞에 [고위험] + 1577-0199/119 즉시 안내.
- 답변은 3~6문장. 쉬운 한국어. 과도한 장문 금지.
- 마지막 줄에 반드시: "이 도구는 선별용이며 전문 진단/치료가 아닙니다."
`.trim();

    const user = `사용자 메시지:\n${message}\n\n과도한 단정 금지. 공감 + 실용적 안내 중심.`;

    const call = () => client.responses.create({
      model: MODEL,                     // gpt-4.1-mini 기본 (Vercel env에서 바꿔도 됨)
      input: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      max_output_tokens: 700,           // 제한 완화
      temperature: 0.6                  // 유연성 소폭 ↑
      // SDK 차원 timeout은 별도 옵션이므로 재시도로 보호
    });

    const resp = await withRetry(call, 2); // 2회 재시도
    const out = resp.output_text ?? (resp.output?.[0]?.content?.[0]?.text || "");
    return res.json({ ok: true, reply: out || "잠시 후 다시 시도해 주세요." });

  } catch (e) {
    console.error("chat api error:", e);
    return res.status(500).json({ ok: false, error: "GPT 호출 실패(재시도 후)" });
  }
};
