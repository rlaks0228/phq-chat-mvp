const OpenAI = require("openai");

const MODEL = process.env.MODEL || "o4-mini"; // 빠른 모델
const SCOPE_KEYWORDS = [
  "우울","우울증","슬픔","무기력","불안","공황","스트레스","수면","잠",
  "자살","자해","멘탈","정신건강","상담","위기","마음","감정","피곤","자존감","우울감"
];

function inScope(text="") {
  const t = (text || "").toLowerCase();
  return SCOPE_KEYWORDS.some(k => t.includes(k.toLowerCase()));
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    const { message = "" } = req.body || {};

    if (!inScope(message)) {
      return res.json({
        ok: true,
        reply:
          "이 챗은 우울/불안/정신건강 관련 1차 지원 전용이에요. 그 밖의 주제는 안내가 어려워요. " +
          "마음이 힘들거나 걱정/불안/수면 등과 관련된 이야기는 편하게 물어봐 주세요. " +
          "위기라면 즉시 1577-0199 또는 119에 연락해 주세요."
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.json({
        ok: true,
        reply: "⚠️ 서버에 OPENAI_API_KEY가 없어 간단 응답만 제공돼요. 위기 시 1577-0199/119"
      });
    }

    const client = new OpenAI({ apiKey });
    const system =
      "너는 청소년 정신건강 1차 지원 챗봇. 진단/치료 금지. 공감/정보/연결만. " +
      "자살/자해 신호 탐지 시 맨 앞에 [고위험] 문구와 1577-0199, 119를 즉시 안내. " +
      '항상 마지막 줄에: "이 도구는 선별용이며 전문 진단/치료가 아닙니다."';

    const resp = await client.responses.create({
      model: MODEL,
      input: [
        { role: "system", content: system },
        { role: "user", content: `사용자 메시지:\n${message}\n간결하게 3~5문장. 약물/진단 언급 금지.` }
      ],
      max_output_tokens: 260,
      temperature: 0.4
    });

    const out = resp.output_text ?? (resp.output?.[0]?.content?.[0]?.text || "");
    return res.json({ ok: true, reply: out });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "GPT 호출 실패" });
  }
};
