import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import OpenAI from 'openai';

const app = express();
app.use(express.json());
app.use(express.static('.'));

const PORT = process.env.PORT || 3000;
const MODEL = process.env.MODEL || 'o4-mini'; // 빠른 기본값
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || null;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// ── 유틸
function distKm(lat1, lon1, lat2, lon2) {
  const toRad = d => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 +
    Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ── 데이터 로드
const DATA_FILE = path.join(process.cwd(), 'data', 'centers.csv');
let centers = [];
try {
  if (fs.existsSync(DATA_FILE)) {
    const csv = fs.readFileSync(DATA_FILE, 'utf-8');
    centers = parse(csv, { columns: true, skip_empty_lines: true, trim: true })
      .map(r => {
        const name = r['기관명'] || r['name'] || r['센터명'] || '기관';
        const address = r['주소'] || r['address'] || '';
        const phone = r['전화번호'] || r['phone'] || '';
        const lat = parseFloat(r['위도'] || r['lat'] || r['latitude'] || '');
        const lng = parseFloat(r['경도'] || r['lng'] || r['longitude'] || '');
        return { name, address, phone, lat, lng };
      });
  }
} catch (e) {
  console.error('센터 데이터 로드 실패:', e);
}

// ── 범위 판단(정신건강/우울 관련만)
const SCOPE_KEYWORDS = [
  '우울', '우울증', '슬픔', '무기력', '불안', '공황', '스트레스',
  '수면', '잠', '자살', '자해', '멘탈', '정신건강', '상담', '위기',
  '마음', '감정', '피곤', '자존감', '우울감'
];
function inScope(text='') {
  const t = (text || '').toLowerCase();
  // 한국어/영문 혼합 키워드 체크
  return SCOPE_KEYWORDS.some(k => t.includes(k.toLowerCase()));
}

// ── GPT 호출 헬퍼 (빠른 소형모델 기본, 짧은 답)
async function gptRespond({ system, user, json = false, maxOutput = 300 }) {
  if (!openai) {
    return {
      text: '⚠️ 서버에 OPENAI_API_KEY가 없어 간단 응답만 제공 중입니다.'
    };
  }
  const resp = await openai.responses.create({
    model: MODEL,                     // o4-mini 권장 (빠름/저렴)
    input: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    max_output_tokens: maxOutput,     // 짧게
    temperature: 0.4,
    ...(json ? { response_format: { type: 'json_object' } } : {})
  });
  const out = resp.output_text ?? (resp.output?.[0]?.content?.[0]?.text || '');
  return { text: out };
}

// ── 라우트
app.post('/api/chat', async (req, res) => {
  const { message = '' } = req.body || {};

  // 범위 밖이면 즉시 가드 응답
  if (!inScope(message)) {
    return res.json({
      ok: true,
      reply:
        '이 챗은 우울/불안/정신건강 관련 1차 지원 전용이에요. 그 밖의 주제는 안내가 어려워요. ' +
        '마음이 힘들거나 걱정/불안/수면 등과 관련된 이야기는 편하게 물어봐 주세요. ' +
        '위기라면 즉시 1577-0199 또는 119에 연락해 주세요.'
    });
  }

  // 시스템 프롬프트를 짧고 명확하게 (속도↑)
  const system =
    '너는 청소년 정신건강 1차 지원 챗봇. 진단/치료 금지. 공감/정보/연결만. ' +
    '자살/자해 신호 탐지 시 맨 앞에 [고위험] 문구와 1577-0199, 119를 즉시 안내. ' +
    '항상 마지막 줄에: "이 도구는 선별용이며 전문 진단/치료가 아닙니다."';

  const user =
    `사용자 메시지:\n${message}\n` +
    '간결하게 3~5문장. 약물/진단 언급 금지.';

  try {
    const out = await gptRespond({ system, user, maxOutput: 260 });
    res.json({ ok: true, reply: out.text });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'GPT 호출 실패' });
  }
});

app.post('/api/interp', async (req, res) => {
  const { scores = [], userLat = null, userLng = null } = req.body || {};
  const total = (scores || []).reduce((a, b) => a + (Number(b) || 0), 0);
  const item9 = Number(scores?.[8] || 0);

  let severity = '없음/최소';
  if (total >= 5 && total <= 9) severity = '경도';
  else if (total <= 14) severity = '중등도';
  else if (total <= 19) severity = '중등도-중증';
  else if (total >= 20) severity = '중증';

  const crisis = item9 >= 1;

  // 근처 센터
  let resultCenters = [...centers];
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
    const tel = c.phone ? `<div>📞 ${c.phone}</div>` : '';
    const km = typeof c.d === 'number' ? `<div>📍 약 ${c.d.toFixed(1)} km</div>` : '';
    return `
      <li style="margin-bottom:12px">
        <div><b>${c.name}</b></div>
        <div>${c.address || ''}</div>
        ${tel}
        ${km}
        <div><a target="_blank" href="https://map.kakao.com/?q=${mapsQ}">지도 열기</a></div>
      </li>`;
  }).join('');

  // 공감 메시지(선택)
  let supportive = '';
  if (openai) {
    try {
      const sys =
        'PHQ-9 결과를 바탕으로 3~4문장 공감 메시지. 진단/치료 금지. ' +
        'crisis=true면 맨 앞에 [고위험] + 1577-0199/119 안내.';
      const usr = JSON.stringify({ total, severity, crisis });
      const out = await gptRespond({ system: sys, user: usr, maxOutput: 200 });
      supportive = out.text;
    } catch {}
  }

  res.json({ ok: true, total, severity, crisis, supportive, centersHtml });
});

app.listen(PORT, () => console.log(`✅ Server on http://localhost:${PORT} (model=${MODEL})`));
