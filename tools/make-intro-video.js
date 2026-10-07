// 생각 열기 도입 영상(media/intro-think.mp4) 제작 스크립트.
// 장면 HTML → Edge 헤드리스로 PNG 캡처 → Windows 한국어 여성 음성(Heami)으로 나레이션 → ffmpeg으로 합쳐 mp4 생성.
// 사용: node tools/make-intro-video.js   (문구를 고치려면 아래 NARR/상수만 바꾸고 다시 실행)
// AI 답변 문장 5개는 content.js에서 그대로 읽어 와서 앱 화면과 글자가 어긋나지 않게 한다.
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const EDGE = process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const FFDIR = process.env.FFDIR || 'C:/Users/ADMIN/AppData/Local/Microsoft/WinGet/Packages/yt-dlp.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-N-126374-g089a48eb36-win64-gpl/bin';
const FFMPEG = FFDIR + '/ffmpeg.exe', FFPROBE = FFDIR + '/ffprobe.exe';
const WORK = process.env.WORK || path.join(os.tmpdir(), 'intro-video');
const OUT = path.join(ROOT, 'media', 'intro-think.mp4');
const RATE = +(process.env.RATE || 1); // 음성 속도(-10~10)
fs.mkdirSync(WORK, { recursive: true }); fs.mkdirSync(path.dirname(OUT), { recursive: true });

// ---- 앱과 같아야 하는 문구(index.html의 생각 열기 화면) ----
const claims = (new Function(fs.readFileSync(path.join(ROOT, 'content.js'), 'utf8') + ';return CLAIMS;'))();
const S = claims.map(c => c.t);
const ASK = '패스트패션이 환경에 미치는 영향을 근거 자료와 함께 알려줘.';
const INTRO = '패스트패션의 환경 영향은 매우 심각합니다.';
const OUTRO = '따라서 옷을 적게 사고 오래 입는 것이 중요합니다.';
const OPTS = ['그대로 인용해도 된다 — 구체적 수치와 기관이 나와 있으니까', '일부는 확인이 필요하다', '인용하면 안 된다'];
const appHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
[ASK, INTRO, OUTRO, ...OPTS].forEach(t => { if (!appHtml.includes(t)) throw new Error('앱 문구와 다름: ' + t); });

// ---- 장면 목록: n=나레이션, show=그 장면에서 보이는 AI 문장 수, hl=강조할 항목 ----
const scenes = [
  { k: 'title', n: '지현이는 내일까지 탐구 보고서를 내야 해요. 주제는, 패스트패션은 정말 지구를 망치고 있을까?', cap: '지현이는 내일까지 탐구 보고서를 내야 해요.' },
  { k: 'ask', n: '그래서 AI에게 물었어요. 패스트패션이 환경에 미치는 영향을, 근거 자료와 함께 알려줘.', cap: 'AI에게 물어봤어요.' },
  { k: 'chat', n: 'AI가 대답했어요. ' + INTRO, intro: true },
  ...S.map((s, i) => ({ k: 'chat', n: s, intro: true, upto: i + 1, hl: i + 1 })),
  { k: 'chat', n: OUTRO + ' 지현이는 복사 버튼 위에 마우스를 올렸어요.', intro: true, upto: 5, outro: true, copy: true, cap: '지현이는 복사 버튼 위에 마우스를 올렸어요.' },
  { k: 'ask2', n: '이 답변, 보고서에 그대로 써도 될까요?', hold: 5, intro: true, upto: 5, outro: true }, // 배경에는 전체 대화가 흐리게 깔린다
];

const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function html(sc) {
  const css = `*{box-sizing:border-box;margin:0}body{width:1920px;height:1080px;background:#111;color:#f4f4f2;font-family:"Malgun Gothic","Noto Sans KR",sans-serif;overflow:hidden;position:relative}
.top{position:absolute;left:72px;top:40px;color:#c9b18b;font-size:26px;letter-spacing:.08em}
.cap{position:absolute;left:0;right:0;bottom:64px;text-align:center;font-size:48px;line-height:1.6;padding:0 120px;word-break:keep-all}
.cap span{background:rgba(0,0,0,.78);padding:8px 26px;border-radius:14px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px}
.moon{font-size:120px;line-height:1}.sub{color:#c9b18b;font-size:40px;letter-spacing:.06em}
.card{background:#181816;border:2px solid #3a3a38;border-radius:28px;padding:54px 90px;text-align:center}
.lbl{color:#c9b18b;font-size:32px;margin-bottom:22px}.title{font-size:78px;font-weight:800;line-height:1.35;word-break:keep-all}
.chat{position:absolute;left:150px;right:150px;top:104px}
.row{display:flex;gap:22px;margin-bottom:22px;align-items:flex-start}.row.me{justify-content:flex-end}
.av{flex:0 0 66px;height:66px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:28px}
.me .av{background:#c9b18b;color:#111}.ai .av{background:#f4f4f2;color:#111;font-size:24px}
.b{border-radius:26px;padding:22px 34px;font-size:35px;line-height:1.5;word-break:keep-all;max-width:1500px}
.me .b{background:#c9b18b;color:#111}.ai .b{background:#1e1e1c;border:2px solid #3a3a38}
.ai .b p{margin:0 0 10px}.ai .b p:last-child{margin:0}
.n{display:inline-flex;width:1.2em;height:1.2em;border-radius:50%;background:#c9b18b;color:#111;font-weight:800;font-size:.8em;align-items:center;justify-content:center;margin-right:.45em;vertical-align:.05em}
.hl{background:#c9b18b;color:#111;padding:2px 12px;border-radius:10px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.hl .n{background:#111;color:#c9b18b}
.copy{margin-left:88px;margin-top:6px;display:inline-flex;align-items:center;gap:10px;border:2px solid #c9b18b;color:#c9b18b;border-radius:14px;padding:10px 26px;font-size:32px;position:relative;box-shadow:0 0 0 8px rgba(201,177,139,.18)}
.cur{position:absolute;left:calc(100% - 26px);top:46px;filter:drop-shadow(0 4px 6px #000)}
.dim{opacity:.07;filter:blur(6px)}
.q{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:48px}
.q h1{font-size:84px;font-weight:800;line-height:1.3;text-align:center;word-break:keep-all}
.opts{display:flex;flex-direction:column;gap:20px;width:1500px}
.opt{background:#181816;border:2px solid #3a3a38;border-radius:22px;padding:22px 36px;font-size:38px;display:flex;gap:22px;align-items:center}
.opt i{font-style:normal;flex:0 0 58px;height:58px;border-radius:50%;background:#c9b18b;color:#111;font-weight:800;font-size:34px;display:flex;align-items:center;justify-content:center}`;
  let body = '';
  if (sc.k === 'title') {
    body = `<div class="center"><div class="moon">🌙</div><div class="sub">밤 11시 · 제출 마감 하루 전</div><div class="card"><div class="lbl">주제탐구 보고서 · 지현</div><div class="title">패스트패션은 정말<br>지구를 망치고 있을까?</div></div></div>`;
  } else {
    const me = `<div class="row me"><div class="b">${esc(ASK)}</div><div class="av">지</div></div>`;
    let ai = '';
    if (sc.intro) {
      const ps = [`<p>${esc(INTRO)}</p>`];
      for (let i = 0; i < (sc.upto || 0); i++) ps.push(`<p>${sc.hl === i + 1 ? '<span class="hl">' : '<span>'}<span class="n">${i + 1}</span>${esc(S[i])}</span></p>`);
      if (sc.outro) ps.push(`<p>${esc(OUTRO)}</p>`);
      ai = `<div class="row ai"><div class="av">AI</div><div><div class="b">${ps.join('')}</div>${sc.copy ? '<div class="copy">📋 복사<svg class="cur" width="54" height="54" viewBox="0 0 24 24"><path d="M3 2l7 18 2.5-7.5L20 10z" fill="#f4f4f2" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg></div>' : ''}</div></div>`;
    }
    const chat = `<div class="chat${sc.k === 'ask2' ? ' dim' : ''}">${me}${ai}</div>`;
    body = chat;
  }
  return `<!doctype html><meta charset="utf-8"><style>${css}</style><body><div class="top">지현의 탐구 보고서</div>${body}${
    sc.cap ? `<div class="cap"><span>${esc(sc.cap)}</span></div>` : ''}${
    sc.k === 'ask2' ? `<div class="q"><h1>이 답변, 보고서에 그대로 써도 될까요?</h1><div class="opts">${OPTS.map((o, i) => `<div class="opt"><i>${i + 1}</i>${esc(o)}</div>`).join('')}</div></div>` : ''}</body>`;
}

// ---- 1) 장면 PNG ----
const sh = (cmd, args, opt) => { const r = cp.spawnSync(cmd, args, Object.assign({ encoding: 'utf8' }, opt)); if (r.status !== 0 && !(opt && opt.ok)) throw new Error(cmd + ' 실패: ' + (r.stderr || r.stdout || '').slice(-600)); return r; };
scenes.forEach((sc, i) => {
  const f = path.join(WORK, `s${String(i).padStart(2, '0')}`);
  fs.writeFileSync(f + '.html', html(sc), 'utf8');
  try { fs.unlinkSync(f + '.png'); } catch (e) {}
  sh(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--screenshot=${f}.png`, '--window-size=1920,1080', 'file:///' + f.replace(/\\/g, '/') + '.html'], { ok: true });
  if (!fs.existsSync(f + '.png')) throw new Error('캡처 실패 ' + f);
});

// ---- 2) 나레이션(Windows Heami 여성 음성) ----
fs.writeFileSync(path.join(WORK, 'narr.json'), JSON.stringify(scenes.map(s => s.n)), 'utf8');
fs.writeFileSync(path.join(WORK, 'tts.ps1'), `Add-Type -AssemblyName System.Speech
$lines = Get-Content -Raw -Encoding UTF8 '${path.join(WORK, 'narr.json').replace(/\\/g, '/')}' | ConvertFrom-Json
$i = 0
foreach ($t in $lines) {
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $s.SelectVoice('Microsoft Heami Desktop'); $s.Rate = ${RATE}
  $s.SetOutputToWaveFile(('${WORK.replace(/\\/g, '/')}/n{0:00}.wav' -f $i))
  $s.Speak($t); $s.Dispose(); $i++
}`, 'utf8');
sh('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(WORK, 'tts.ps1')]);

// ---- 3) 타임라인 계산 ----
const OV = 0.35, LEAD0 = 0.7, LEAD = 0.55, TAIL = 0.45;
const dur = scenes.map((_, i) => parseFloat(sh(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(WORK, `n${String(i).padStart(2, '0')}.wav`)]).stdout));
let t = 0; const starts = [], narrAt = [], clipLen = [];
scenes.forEach((sc, i) => {
  const lead = i === 0 ? LEAD0 : LEAD, last = i === scenes.length - 1;
  const L = lead + dur[i] + (last ? (sc.hold || 5) : TAIL);
  starts.push(t); narrAt.push(t + lead); clipLen.push(L + (last ? 0 : OV)); t += L;
});
const total = t;

// ---- 4) ffmpeg 합성 ----
const args = ['-y', '-hide_banner', '-loglevel', 'error'];
scenes.forEach((_, i) => args.push('-framerate', '25', '-loop', '1', '-t', clipLen[i].toFixed(3), '-i', path.join(WORK, `s${String(i).padStart(2, '0')}.png`)));
scenes.forEach((_, i) => args.push('-i', path.join(WORK, `n${String(i).padStart(2, '0')}.wav`)));
const N = scenes.length;
let fc = scenes.map((_, i) => `[${i}:v]format=yuv420p,setsar=1[v${i}]`).join(';');
let prev = 'v0';
for (let i = 1; i < N; i++) { fc += `;[${prev}][v${i}]xfade=transition=fade:duration=${OV}:offset=${starts[i].toFixed(3)}[x${i}]`; prev = 'x' + i; }
fc += ';' + scenes.map((_, i) => `[${N + i}:a]aresample=44100,adelay=${Math.round(narrAt[i] * 1000)}|${Math.round(narrAt[i] * 1000)}[a${i}]`).join(';');
fc += ';' + scenes.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${N}:duration=longest:normalize=0,apad=whole_dur=${total.toFixed(3)}[aout]`;
args.push('-filter_complex', fc, '-map', `[${prev}]`, '-map', '[aout]', '-t', total.toFixed(3), '-c:v', 'libx264', '-crf', '21', '-preset', 'slow', '-r', '25', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', OUT);
sh(FFMPEG, args);
console.log(`완성: ${OUT}\n길이 ${total.toFixed(1)}초, 크기 ${(fs.statSync(OUT).size / 1048576).toFixed(2)}MB`);
console.log('장면별 시작(초):', starts.map(x => x.toFixed(1)).join(' '));
