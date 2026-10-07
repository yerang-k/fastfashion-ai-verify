// 도입 영상 속 가상 학생 '지현' 캐릭터(SVG). 장면마다 표정(gaze/brows/mouth)과 자세(pose)를 바꿔 쓴다.
// 좌표계: 440 x 600 (상반신). pose = 'type'(노트북 앞) | 'hesitate'(마우스에 손) | 'think'(턱에 손)
const C = { skin: '#f5d7bb', skinDk: '#e6bb9a', hair: '#2b2321', hairHi: '#54443d', card: '#c9b18b', cardDk: '#a58d5f', shirt: '#f4f4f2', blush: '#ee9a93', lip: '#c4605c', ink: '#2b2321' };

function eye(cx, cy, gx, gy, mood) {
  if (mood === 'happy') return `<path d="M${cx - 17},${cy + 4} Q${cx},${cy - 14} ${cx + 17},${cy + 4}" fill="none" stroke="${C.ink}" stroke-width="6" stroke-linecap="round"/>`;
  const big = mood === 'worried' ? 1.08 : 1;
  return `<ellipse cx="${cx}" cy="${cy}" rx="${18.5 * big}" ry="${20 * big}" fill="#fff"/>` +
    `<circle cx="${cx + gx}" cy="${cy + gy}" r="${11.5 * big}" fill="${C.ink}"/><circle cx="${cx + gx + 4}" cy="${cy + gy - 4}" r="3.8" fill="#fff"/>` +
    `<path d="M${cx - 23},${cy - 6} Q${cx},${cy - 27} ${cx + 23},${cy - 6}" fill="none" stroke="${C.ink}" stroke-width="5" stroke-linecap="round"/>`;
}
const BROWS = {
  flat: ['M150,232 Q176,222 202,232', 'M242,232 Q268,222 294,232'],
  worried: ['M150,242 Q176,236 202,218', 'M242,218 Q268,236 294,242'],
  raise: ['M150,222 Q176,206 202,220', 'M242,232 Q268,224 294,234'],
};
const MOUTH = {
  smile: `<path d="M200,326 Q222,346 244,326" fill="none" stroke="${C.lip}" stroke-width="5" stroke-linecap="round"/>`,
  flat: `<path d="M206,330 L238,330" fill="none" stroke="${C.lip}" stroke-width="5" stroke-linecap="round"/>`,
  o: `<ellipse cx="222" cy="333" rx="9" ry="11" fill="#a8504c"/>`,
  wavy: `<path d="M200,334 Q211,322 222,334 T244,334" fill="none" stroke="${C.lip}" stroke-width="5" stroke-linecap="round"/>`,
};

// 얼굴·머리(뒷머리 → 목 → 몸 위에서 쓰는 조각들을 한 번에)
function head({ gaze = [0, 0], brows = 'flat', mouth = 'smile', mood = 'open' }) {
  const [gx, gy] = gaze;
  return `
  <path d="M92,300 C80,170 150,95 222,95 C294,95 364,170 352,300 L356,392 C356,412 338,418 322,410 L304,345 L140,345 L122,410 C106,418 88,412 88,392 Z" fill="${C.hair}"/>
  <ellipse cx="222" cy="262" rx="100" ry="108" fill="${C.skin}"/>
  <ellipse cx="124" cy="278" rx="12" ry="20" fill="${C.skin}"/><ellipse cx="320" cy="278" rx="12" ry="20" fill="${C.skin}"/>
  <ellipse cx="146" cy="312" rx="21" ry="11" fill="${C.blush}" opacity=".45"/><ellipse cx="298" cy="312" rx="21" ry="11" fill="${C.blush}" opacity=".45"/>
  ${eye(176, 272, gx, gy, mood)}${eye(268, 272, gx, gy, mood)}
  <path d="M222,298 q-4,7 3,9" fill="none" stroke="${C.skinDk}" stroke-width="3.5" stroke-linecap="round"/>
  ${MOUTH[mouth]}
  <path d="M112,262 C100,160 160,112 224,112 C292,112 346,160 332,262 C320,222 300,196 270,184 C258,210 222,226 176,222 C148,222 124,236 112,262 Z" fill="${C.hair}"/>
  <path d="M112,262 C106,300 110,330 118,352 L138,347 C132,312 130,288 130,262 Z" fill="${C.hair}"/>
  <path d="M332,262 C338,300 334,330 326,352 L306,347 C312,312 314,288 314,262 Z" fill="${C.hair}"/>
  <path d="${BROWS[brows][0]}" fill="none" stroke="${C.hair}" stroke-width="6.5" stroke-linecap="round"/>
  <path d="${BROWS[brows][1]}" fill="none" stroke="${C.hair}" stroke-width="6.5" stroke-linecap="round"/>
  <path d="M152,152 C178,128 218,122 254,132" fill="none" stroke="${C.hairHi}" stroke-width="8" stroke-linecap="round" opacity=".75"/>`;
}

function body(pose) {
  const torso = `<path d="M24,600 C24,500 66,436 150,414 L190,406 L254,406 L294,414 C378,436 420,500 420,600 Z" fill="${C.card}"/>
    <path d="M168,412 L222,506 L276,412 Z" fill="${C.shirt}"/>
    <path d="M176,416 L134,600" stroke="${C.cardDk}" stroke-width="6" fill="none"/><path d="M268,416 L310,600" stroke="${C.cardDk}" stroke-width="6" fill="none"/>
    <path d="M192,330 L192,412 L222,456 L252,412 L252,330 Z" fill="${C.skin}"/>
    <path d="M192,350 Q222,378 252,350 L252,330 L192,330 Z" fill="${C.skinDk}"/>`;
  const laptop = `<path d="M62,600 L98,480 Q102,466 118,466 L326,466 Q342,466 346,480 L382,600 Z" fill="#34342f" stroke="#55554f" stroke-width="4"/>
    <path d="M222,512 q-18,-6 -22,-26 q22,-2 28,16 q4,4 -6,10 Z" fill="none" stroke="${C.card}" stroke-width="4" stroke-linejoin="round"/>`;
  let extra = '';
  if (pose === 'hesitate') {
    extra = `<path d="M444,600 L396,548" stroke="${C.card}" stroke-width="58" stroke-linecap="round"/>
      <rect x="338" y="508" width="64" height="86" rx="26" fill="#e9e6df" stroke="#9c988d" stroke-width="3"/>
      <ellipse cx="376" cy="548" rx="34" ry="28" fill="${C.skin}" transform="rotate(-18 376 548)"/>
      <rect x="346" y="504" width="15" height="34" rx="7.5" fill="${C.skin}"/><rect x="363" y="499" width="15" height="38" rx="7.5" fill="${C.skin}"/><rect x="380" y="504" width="15" height="34" rx="7.5" fill="${C.skin}"/>`;
  } else if (pose === 'think') {
    extra = `<path d="M396,600 C408,540 350,476 292,436" fill="none" stroke="${C.card}" stroke-width="54" stroke-linecap="round"/>
      <path d="M396,600 C408,540 350,476 292,436" fill="none" stroke="${C.cardDk}" stroke-width="3" stroke-linecap="round" opacity=".5" transform="translate(-14,2)"/>
      <ellipse cx="268" cy="404" rx="31" ry="24" fill="${C.skin}" transform="rotate(-28 268 404)"/>
      <ellipse cx="238" cy="392" rx="12" ry="8" fill="${C.skin}" transform="rotate(14 238 392)"/>
      <path d="M262,388 q10,-8 22,-4 M268,402 q10,-8 22,-3" fill="none" stroke="${C.skinDk}" stroke-width="3" stroke-linecap="round"/>`;
  }
  return torso + (pose === 'think' ? '' : laptop) + extra;
}

const POSES = {
  type: { head: { gaze: [0, 7], brows: 'flat', mouth: 'flat' }, pose: 'type' },
  read: { head: { gaze: [11, 1], brows: 'flat', mouth: 'flat' }, pose: 'type' },
  hello: { head: { gaze: [0, 0], brows: 'flat', mouth: 'smile' }, pose: 'type' },
  hesitate: { head: { gaze: [-7, 9], brows: 'worried', mouth: 'wavy' }, pose: 'hesitate' },
  think: { head: { gaze: [10, -9], brows: 'raise', mouth: 'o' }, pose: 'type', tilt: -5 }, // 턱에 손 대신 고개를 기울여 생각하는 모습
};

// 전체 상반신 SVG 조각(좌표 440x600). 바깥 <svg>는 호출하는 쪽에서 감싼다.
const inner = name => { const p = POSES[name], h = head(p.head); return body(p.pose) + (p.tilt ? `<g transform="rotate(${p.tilt} 222 400)">${h}</g>` : h); };
const svg = (name, w) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 600" width="${w}" height="${Math.round(w * 600 / 440)}" style="overflow:visible">${inner(name)}</svg>`;
// 채팅 아바타용 얼굴만(원형)
const face = (size, name = 'hello') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="86 96 272 300" width="${size}" height="${size}" style="border-radius:50%;background:${C.card};display:block"><defs><clipPath id="fc"><rect x="86" y="96" width="272" height="300"/></clipPath></defs><g clip-path="url(#fc)">${head(POSES[name].head)}</g></svg>`;

module.exports = { svg, inner, face, C };
