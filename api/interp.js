const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const OpenAI = require("openai");

// CSV를 전역 캐시에 한 번만 로드
let centers = null;
function loadCenters() {
  if (centers) return centers;
  const p = path.join(process.cwd(), "data", "centers.csv");
  if (!fs.existsSync(p)) return (centers = []);
  const csv = fs.readFileSync(p, "utf-8");
  centers = parse(csv, { columns: true, skip_empty_lines: true, trim: true }).map(r => {
    const name = r["기관명"] || r["name"] || r["센터명"] || "기관";
    const address = r["주소"] || r["address"] || "";
    const phone = r["전화번호"] || r["phone"] || "";
    const lat = parseFloat(r["위도"] || r["lat"] || r["latitude"] || "");
    const lng = parseFloat(r["경도"] || r["lng"] || r["longitude"] || "");
    return { name, address, phone, lat, lng };
  });
  return centers;
}

function distKm(lat1, lon1, lat2, lon2) {
  const toRad = d => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    const { scores = [], userLat = null, userLng = null } = req.body || {};
    const total = (scores || []).reduce((a, b) => a + (Number(b) || 0), 0);
    const item9 = Number(scores?.[8] || 0);

    let severity = "없음/최소";
    if (total >= 5 && total <= 9) severity = "경도";
    else if (total <= 14) severity = "중등도";
    else if (total <= 19) severity = "중등도-중증";
    else if (total >= 20) severity = "중증";

    const crisis = item9 >= 1;

    const list = loadCenters();
    let resultCenters = [...list];
    if (userLat && userLng && Number.isFinite(Number(userLat)) && Number.isFinite(Number(userLng))) {
      resultCenters = resultCenters
        .filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lng))
        .map(c => ({ ...c, d: distKm(userLat, userLng, c.lat, c.lng) }))
        .sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9))
        .slice(0, 8);
    } else {
      resultCenters = resultCenters.slice(0, 8);
    }

    const centersHtml = resultCenters.map(c => {
      const mapsQ = encodeURIComponent(c.address || c.name);
      const tel = c.phone ? `<div>📞 ${c.phone}</div>` : "";
      const km = typeof c.d === "number" ? `<div>📍 약 ${c.d.toFixed(1)} km</div>` : "";
      return `
        <li style="margin-bottom:12px">
          <div><b>${c.name}</b></div>
          <div>${c.address || ""}</div>
          ${tel}
          ${km}
          <div><a target="_blank" href="https://map.kakao.com/?q=${mapsQ}">지도 열기</a></div>
        </li>`;
    }).join("");

    // (선택) 공감 메시지: 키 없으면 생략
    let supportive = "";
    const apiKey = process.env.OPENAI_API_KEY;
    const MODEL = process.env.MODEL || "o4-mini";
    if (apiKey) {
      try {
        const client = new OpenAI({ apiKey });
        const sys =
          "PHQ-9 결과로 3~4문장 공감 메시지. 진단/치료 금지. crisis=true면 맨 앞 [고위험]+1577-0199/119.";
        const usr = JSON.stringify({ total, severity, crisis });
        const resp = await client.responses.create({
          model: MODEL,
          input: [{ role: "system", content: sys }, { role: "user", content: usr }],
          max_output_tokens: 200,
          temperature: 0.4
        });
        supportive = resp.output_text ?? (resp.output?.[0]?.content?.[0]?.text || "");
      } catch {}
    }

    return res.json({ ok: true, total, severity, crisis, supportive, centersHtml });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "서버 오류" });
  }
};
