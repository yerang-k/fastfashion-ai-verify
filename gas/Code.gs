/**
 * AI 답변, 믿어도 될까? — 응답 저장용 Apps Script
 *
 * [설치]
 * 1. 새 구글 스프레드시트를 만들고 확장 프로그램 > Apps Script 를 엽니다.
 * 2. 이 파일 내용을 Code.gs 에 붙여 넣고 저장합니다.
 * 3. 프로젝트 설정(톱니바퀴) > 스크립트 속성 > 속성 추가
 *      속성: TEACHER_PIN   값: 교사용 PIN(예: 숫자 6자리)
 * 4. 배포 > 새 배포 > 유형 '웹 앱'
 *      실행 사용자: 나 / 액세스 권한: 모든 사용자
 * 5. 나온 웹 앱 URL(…/exec)을 config.js 의 API_URL 에 붙여 넣습니다.
 * ※ 이 파일을 수정한 뒤에는 '배포 관리 > 수정 > 새 버전'으로 다시 배포해야 반영됩니다.
 *
 * [반 구분] 학생·교사 주소 뒤에 ?class=1-3 처럼 붙이면 그 반의 응답·명단·수업 설정이 따로 저장됩니다.
 *   - 반을 붙이지 않으면 '기본 반'으로, 예전 시트(학생응답·모둠기록지·명단)를 그대로 이어 씁니다.
 *   - 반마다 시트 이름 뒤에 _반이름 이 붙습니다(예: 학생응답_1-3). 교사 PIN은 모든 반이 같습니다.
 */

var SHEET_STUDENTS = '학생응답';
var SHEET_GROUPS = '모둠기록지';
var SHEET_CONFIG = '설정';
var HEAD_STUDENTS = ['code', 'group', 'dev', 'updatedAt', 'submittedAt', 'helpAt', 'json'];
var HEAD_GROUPS = ['group', 'updatedAt', 'json'];
var SHEET_ROSTER = '명단';
var HEAD_ROSTER = ['code', 'group'];
var MAXG = 20; // 허용하는 최대 모둠 번호
var MAX_JSON = 45000; // 셀 하나 한도(50,000자) 안쪽

function doGet(e) { return handle_(e.parameter || {}); }

function doPost(e) {
  var p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad request' }); }
  return handle_(p);
}

var READ_ACTIONS_ = { getStage: 1, getStudent: 1, getLesson: 1, getGroup: 1, getShare: 1, teacherAll: 1, uploadPdf: 1 }; // uploadPdf는 시트를 안 건드려서 잠금 없이 처리(오래 걸려도 다른 요청을 막지 않게)
var STUDENT_ACTIONS_ = { getStage: 1, saveStudent: 1, getStudent: 1, getLesson: 1, help: 1, saveGroup: 1, getGroup: 1, getShare: 1 };
var CLASS_ = ''; // 이번 요청의 반(기본 반은 빈 문자열)
function cleanClass_(c) { return String(c || '').replace(/[^A-Za-z0-9가-힣_-]/g, '').slice(0, 20); }
function sn_(name) { return CLASS_ ? name + '_' + CLASS_ : name; } // 반별 시트 이름
function ck_(key) { return CLASS_ ? key + '__' + CLASS_ : key; } // 반별 설정 키

function handle_(p) {
  CLASS_ = cleanClass_(p['class']);
  // 반 시트는 createClass(교사 PIN)로만 만들어짐. 그 밖의 모든 요청(교사 화면 포함)은 없는 반이면 거절 — 안 그러면 삭제한 반을 열어 둔 다른 화면이 시트를 되살림
  if (CLASS_ && p.action !== 'createClass' && !SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sn_(SHEET_STUDENTS))) return out_({ ok: false, error: 'no class' });
  var lock = null;
  try {
    // 읽기만 하는 요청은 줄을 세우지 않고 바로 처리한다(학생 수만큼 쌓여 느려지는 것을 방지). 쓰기만 잠금.
    if (!READ_ACTIONS_[p.action] && p.action !== 'setStage') { lock = LockService.getScriptLock(); lock.waitLock(20000); }
    switch (p.action) {
      case 'saveStudent': return out_(saveStudent_(p));
      case 'getStage': return out_(getStage_());
      case 'getStudent': return out_(getStudent_(p));
      case 'getLesson': return out_(getLesson_(p));
      case 'setLesson': return out_(setLesson_(p));
      case 'setStage': return out_(setStage_(p));
      case 'setRoster': return out_(setRoster_(p));
      case 'updateStudent': return out_(updateStudent_(p));
      case 'deleteStudent': return out_(deleteStudent_(p));
      case 'help': return out_(help_(p));
      case 'saveGroup': return out_(saveGroup_(p));
      case 'clearRecorder': return out_(clearRecorder_(p));
      case 'getGroup': return out_(getGroup_(p));
      case 'getShare': return out_(getShare_());
      case 'teacherAll': return out_(teacherAll_(p));
      case 'setShare': return out_(setShare_(p));
      case 'setClock': return out_(setClock_(p));
      case 'changePin': return out_(changePin_(p));
      case 'createClass': return out_(createClass_(p));
      case 'deleteClass': return out_(deleteClass_(p));
      case 'setNotes': return out_(setNotes_(p));
      case 'helpClear': return out_(helpClear_(p));
      case 'uploadPdf': return out_(uploadPdf_(p));
      default: return out_({ ok: false, error: 'unknown action' });
    }
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally {
    if (lock) { try { lock.releaseLock(); } catch (x) {} }
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- 시트 도우미 ---------- */
var TEXT_FMT_DONE_ = {};
function sheet_(name, head) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    var lk = LockService.getScriptLock(), had = lk.hasLock();
    if (!had) lk.waitLock(20000);
    try {
      sh = ss.getSheetByName(name);
      if (!sh) {
        // 코드 열을 먼저 텍스트로 고정해야 '2-3-07' 같은 코드가 날짜로 바뀌지 않는다
        sh = ss.insertSheet(name);
        if (/^(학생응답|명단)/.test(name)) sh.getRange('A:A').setNumberFormat('@');
        sh.appendRow(head);
        sh.setFrozenRows(1);
        TEXT_FMT_DONE_[name] = true;
      }
    } finally { if (!had) { try { lk.releaseLock(); } catch (x) {} } }
  } else if (/^(학생응답|명단)/.test(name) && !TEXT_FMT_DONE_[name]) {
    // 이미 있는 시트도 코드 열을 텍스트로(이후 입력분부터 적용). 쓰기 작업이라 요청마다 하지 않고 몇 시간에 한 번만.
    var fk = 'fmt:' + name, cch = CacheService.getScriptCache();
    if (cch.get(fk) === null) {
      sh.getRange('A:A').setNumberFormat('@');
      try { cch.put(fk, '1', 21600); } catch (e) {}
    }
    TEXT_FMT_DONE_[name] = true;
  }
  return sh;
}

// 첫 칸(코드)을 텍스트 서식으로 만든 뒤 행을 쓴다. row<0 이면 맨 아래에 추가.
function putRow_(sh, row, arr) {
  if (row < 0) row = sh.getLastRow() + 1;
  sh.getRange(row, 1).setNumberFormat('@');
  sh.getRange(row, 1, 1, arr.length).setValues([arr]);
}

function findRow_(sh, keyCol, key) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var vals = sh.getRange(2, keyCol, last - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) { var v = vals[i][0]; if ((v instanceof Date ? v.toISOString() : String(v)) === String(key)) return i + 2; }
  return -1;
}

function cleanCode_(c) { return String(c || '').trim().slice(0, 30); }
function cleanGroup_(g) { g = parseInt(g, 10); return g >= 1 && g <= MAXG ? g : 0; }

/* ---------- 명단(교사가 등록한 코드→모둠) : 학생 모둠의 기준 ---------- */
function rosterMap_() {
  var cache = CacheService.getScriptCache(), key = 'roster:' + CLASS_;
  var hit = cache.get(key);
  if (hit !== null) { try { return JSON.parse(hit); } catch (e) {} }
  var sh = sheet_(sn_(SHEET_ROSTER), HEAD_ROSTER);
  var last = sh.getLastRow(), m = {};
  if (last >= 2) sh.getRange(2, 1, last - 1, 2).getValues().forEach(function (r) { m[String(r[0] instanceof Date ? r[0].toISOString() : r[0])] = parseInt(r[1], 10) || 0; });
  try { cache.put(key, JSON.stringify(m), 600); } catch (e) {}
  return m;
}
function rosterDirty_() { try { CacheService.getScriptCache().remove('roster:' + CLASS_); } catch (e) {} }
function rosterUpsert_(code, group) {
  var sh = sheet_(sn_(SHEET_ROSTER), HEAD_ROSTER);
  var row = findRow_(sh, 1, code);
  if (row < 0) putRow_(sh, -1, [code, group]); else sh.getRange(row, 2).setValue(group);
  rosterDirty_();
}
function rosterDelete_(code) {
  var sh = sheet_(sn_(SHEET_ROSTER), HEAD_ROSTER);
  var row = findRow_(sh, 1, code);
  if (row > 0) sh.deleteRow(row);
  rosterDirty_();
}

/* ---------- 학생 ---------- */
function saveStudent_(p) {
  var code = cleanCode_(p.code), group = cleanGroup_(p.group);
  if (!code || !group) return { ok: false, error: 'code/group required' };
  var rg = rosterMap_()[code];
  if (rg) group = rg; // 명단(교사 지정)이 있으면 항상 그 모둠
  var json = JSON.stringify(p.data || {});
  if (json.length > MAX_JSON) return { ok: false, error: 'too large' };
  var sh = sheet_(sn_(SHEET_STUDENTS), HEAD_STUDENTS);
  var now = new Date();
  var dev = String(p.dev || '');
  var rowC = findRow_(sh, 1, code);
  var rowD = dev ? findRow_(sh, 3, dev) : -1; // 같은 기기가 코드를 고친 경우 → 이름만 바꿈
  // '명단만 입장'이 켜져 있으면 서버도 막는다(화면의 확인을 우회해 직접 요청을 보내도 명단 밖 코드는 저장되지 않음)
  if (!rg && rowC < 0 && (lessonGet_() || {}).rosterOnly) return { ok: false, error: 'not in roster' };
  var row = rowC > 0 ? rowC : rowD;
  var submittedAt = p.submitted ? now : '';
  if (row < 0) {
    putRow_(sh, -1, [code, group, dev, now, submittedAt, '', json]);
  } else {
    var cur = sh.getRange(row, 1, 1, HEAD_STUDENTS.length).getValues()[0];
    putRow_(sh, row, [code, group, dev || cur[2], now, submittedAt || cur[4], cur[5], json]);
  }
  return { ok: true, group: group };
}

// 코드 사용 여부와 명단 정보만 알려 준다(응답 내용은 돌려주지 않음).
function getStudent_(p) {
  var code = cleanCode_(p.code);
  var sh = sheet_(sn_(SHEET_STUDENTS), HEAD_STUDENTS);
  var row = findRow_(sh, 1, code);
  var rmap = rosterMap_(), inRoster = Object.prototype.hasOwnProperty.call(rmap, code);
  var rg = rmap[code] || 0; // 모둠 없이 학번만 등록된 경우 0(학생이 스스로 고름)
  var lesson = lessonGet_() || {};
  var res = { ok: true, found: row > 0, rosterFound: inRoster, rosterGroup: rg, rosterOnly: !!lesson.rosterOnly };
  // 기기 번호(dev)는 본인 확인용 비밀이라 내려주지 않고, 요청한 기기와 같은지만 알려 준다
  if (row > 0) res.sameDev = String(sh.getRange(row, 3).getValue()) === String(p.dev || '');
  return res;
}

/* ---------- 수업 설정(교사가 저장, 학생이 주기적으로 읽음) ---------- */
function cfgGet_(key) {
  var cache = CacheService.getScriptCache(), ckey = 'cfg:' + ck_(key);
  var hit = cache.get(ckey);
  if (hit !== null) { try { return JSON.parse(hit).v; } catch (e) {} }
  var sh = sheet_(SHEET_CONFIG, ['key', 'value']);
  var row = findRow_(sh, 1, ck_(key));
  var val = row > 0 ? String(sh.getRange(row, 2).getValue()) : '';
  try { cache.put(ckey, JSON.stringify({ v: val }), 21600); } catch (e) {}
  return val;
}
function cfgSet_(key, val) {
  var sh = sheet_(SHEET_CONFIG, ['key', 'value']);
  var row = findRow_(sh, 1, ck_(key));
  if (row < 0) sh.appendRow([ck_(key), val]); else sh.getRange(row, 2).setValue(val);
  var cache = CacheService.getScriptCache(), ckey = 'cfg:' + ck_(key);
  try { cache.put(ckey, JSON.stringify({ v: String(val) }), 21600); } catch (e) { try { cache.remove(ckey); } catch (x) {} } // 너무 크면 캐시를 비워 옛 값이 남지 않게
}
// 현재 단계: 'stage' 키에 따로 저장('null'=자유 이동). 없으면 수업 설정 JSON 안의 current를 씀(옛 방식과 호환)
function stageOverride_() { var v = cfgGet_('stage'); return v === '' ? undefined : (v === 'null' ? null : parseInt(v, 10)); }
function lessonGet_() {
  var t = cfgGet_('lesson'), l = null;
  if (t) { try { l = JSON.parse(t); } catch (e) { l = null; } }
  var st = stageOverride_();
  if (st !== undefined) { l = l || {}; l.current = st; }
  return l;
}
// 학생·무대 화면이 자주 묻는 가벼운 요청: 지금 단계 + 수업 설정 버전(lv) + 판정 공개 여부(so). 시트를 읽지 않고 캐시만 읽는다
function getStage_() {
  var st = stageOverride_(), cur;
  if (st !== undefined) cur = st; else { var l = lessonGet_() || {}; cur = ('current' in l) ? l.current : 0; }
  return { ok: true, current: cur, lv: cfgGet_('lessonVer'), so: cfgGet_('shareOpen') === 'true' };
}

// 학생용: 수업 설정 + 이 기기(또는 코드)가 배정받은 코드·모둠
function getLesson_(p) {
  var lesson = lessonGet_();
  var sh = sheet_(sn_(SHEET_STUDENTS), HEAD_STUDENTS);
  var dev = String(p.dev || ''), code = cleanCode_(p.code);
  var row = dev ? findRow_(sh, 3, dev) : -1;
  if (row < 0 && code) row = findRow_(sh, 1, code);
  var effCode = code, grp = 0;
  if (row > 0) {
    var cv = sh.getRange(row, 1).getValue();
    if (cv instanceof Date) row = -1; // 날짜로 변질된 옛 행은 무시(교사 화면에서 삭제)
    else { effCode = String(cv); grp = parseInt(sh.getRange(row, 2).getValue(), 10) || 0; }
  }
  var rg = effCode ? (rosterMap_()[effCode] || 0) : 0;
  if (rg) grp = rg;
  var me = (row > 0 || rg) ? { code: effCode, group: grp } : null;
  return { ok: true, lesson: lesson, me: me, lv: cfgGet_('lessonVer') };
}

function setLesson_(p) {
  if (!pinOk_(p)) return { ok: false, error: 'pin' };
  if (!p.lesson || typeof p.lesson !== 'object') return { ok: false, error: 'bad lesson' };
  var stored = lessonGet_() || {};
  var merged = {};
  for (var k in p.lesson) merged[k] = p.lesson[k];
  merged.current = 'current' in stored ? stored.current : 0; // 현재 단계는 단계 버튼으로만 바뀜
  var json = JSON.stringify(merged);
  if (json.length > MAX_JSON) return { ok: false, error: 'too large' };
  cfgSet_('lesson', json);
  cfgSet_('lessonVer', String(Date.now()));
  return { ok: true };
}

// 교사가 학생에게 보여 줄 '현재 단계'를 지정한다(단계 id 0~7). 비우면(null) 학생이 자유롭게 이동한다.
function setStage_(p) {
  if (!pinOk_(p)) return { ok: false, error: 'pin' };
  var n = parseInt(p.stage, 10), val;
  if (p.stage === null || p.stage === '' || p.stage === undefined) val = 'null';
  else if (isNaN(n) || n < 0 || n > 7) return { ok: false, error: 'bad stage' };
  else val = String(n);
  // 캐시에 먼저 넣어 학생들이 곧바로 새 단계를 보게 하고, 시트에는 그 뒤에 저장(다른 학생의 저장 때문에 기다리지 않도록 문서 잠금을 따로 씀)
  try { CacheService.getScriptCache().put('cfg:' + ck_('stage'), JSON.stringify({ v: val }), 21600); } catch (e) {}
  var lk = null;
  try { lk = LockService.getDocumentLock(); lk.waitLock(10000); } catch (e) { lk = null; }
  try { cfgSet_('stage', val); } finally { if (lk) { try { lk.releaseLock(); } catch (x) {} } }
  return { ok: true, current: val === 'null' ? null : n };
}

/* ---------- 명단 · 학생 관리 (교사) ---------- */
function setRoster_(p) {
  if (!pinOk_(p)) return { ok: false, error: 'pin' };
  var list = (p.list || []).slice(0, 500), map = {}, order = [];
  list.forEach(function (r) {
    var c = cleanCode_(r.code), g = cleanGroup_(r.group); // 모둠은 선택: 안 적으면 0(학생이 입장할 때 스스로 고름)
    if (c) { if (!(c in map)) order.push(c); map[c] = g; }
  });
  var sh = sheet_(sn_(SHEET_ROSTER), HEAD_ROSTER);
  var cur = p.mode === 'replace' ? {} : rosterMap_();
  var curOrder = p.mode === 'replace' ? [] : Object.keys(cur);
  order.forEach(function (c) { if (!(c in cur)) curOrder.push(c); cur[c] = map[c]; });
  var last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, 2).clearContent();
  if (curOrder.length) sh.getRange(2, 1, curOrder.length, 1).setNumberFormat('@');
  if (curOrder.length) sh.getRange(2, 1, curOrder.length, 2).setValues(curOrder.map(function (c) { return [c, cur[c]]; }));
  rosterDirty_();
  // 이미 접속한 학생의 모둠도 명단에 맞춤
  var ssh = sheet_(sn_(SHEET_STUDENTS), HEAD_STUDENTS), sl = ssh.getLastRow();
  if (sl >= 2) {
    var rng = ssh.getRange(2, 1, sl - 1, 2), vals = rng.getValues(), ch = false;
    vals.forEach(function (r) { var g = map[String(r[0])]; if (g && r[1] !== g) { r[1] = g; ch = true; } });
    if (ch) { ssh.getRange(2, 1, sl - 1, 1).setNumberFormat('@'); rng.setValues(vals); }
  }
  return { ok: true, count: curOrder.length };
}

function updateStudent_(p) {
  if (!pinOk_(p)) return { ok: false, error: 'pin' };
  var code = cleanCode_(p.code);
  var newCode = cleanCode_(p.newCode) || code;
  var g = p.group == null || p.group === '' ? 0 : cleanGroup_(p.group);
  var ssh = sheet_(sn_(SHEET_STUDENTS), HEAD_STUDENTS);
  var row = findRow_(ssh, 1, code);
  var roster = rosterMap_();
  if (newCode !== code && (findRow_(ssh, 1, newCode) > 0 || roster[newCode])) return { ok: false, error: 'dup' };
  var curGroup = g || roster[code] || (row > 0 ? parseInt(ssh.getRange(row, 2).getValue(), 10) : 0);
  if (!curGroup) return { ok: false, error: 'group required' };
  if (row > 0) { ssh.getRange(row, 1).setNumberFormat('@'); ssh.getRange(row, 1, 1, 2).setValues([[newCode, curGroup]]); }
  if (newCode !== code) rosterDelete_(code);
  rosterUpsert_(newCode, curGroup); // 이후 학생 기기가 저장해도 이 모둠이 유지됨
  return { ok: true };
}

function deleteStudent_(p) {
  if (!pinOk_(p)) return { ok: false, error: 'pin' };
  var code = cleanCode_(p.code);
  var ssh = sheet_(sn_(SHEET_STUDENTS), HEAD_STUDENTS);
  var row = findRow_(ssh, 1, code);
  if (row > 0) ssh.deleteRow(row);
  rosterDelete_(code);
  return { ok: true };
}

function help_(p) {
  var code = cleanCode_(p.code);
  var sh = sheet_(sn_(SHEET_STUDENTS), HEAD_STUDENTS);
  var row = findRow_(sh, 1, code);
  if (row < 0) return { ok: false, error: 'no student' };
  if (!studentGroup_(p)) return { ok: false, error: 'not yours' };
  sh.getRange(row, 6).setValue(new Date());
  return { ok: true };
}

// 요청자(코드+기기번호)가 저장된 학생 행과 맞으면 그 학생의 모둠 번호를, 아니면 0을 돌려준다(다른 모둠 기록 읽기·쓰기 방지)
function studentGroup_(p) {
  var code = cleanCode_(p.code), dev = String(p.dev || '');
  if (!code || !dev) return 0;
  var sh = sheet_(sn_(SHEET_STUDENTS), HEAD_STUDENTS);
  var row = findRow_(sh, 1, code);
  if (row < 0) return 0;
  var v = sh.getRange(row, 2, 1, 2).getValues()[0]; // [모둠, 기기번호]
  if (String(v[1]) !== dev) return 0;
  return cleanGroup_(rosterMap_()[code] || v[0]);
}

/* ---------- 모둠 공동 기록지 (필드별로 나중에 쓴 값이 이김) ---------- */
function loadGroup_(sh, g) {
  var row = findRow_(sh, 1, g);
  if (row < 0) return { row: -1, fields: {} };
  var txt = sh.getRange(row, 3).getValue();
  var f = {};
  try { f = JSON.parse(txt) || {}; } catch (e) {}
  return { row: row, fields: f };
}

// 모둠이 '발표할 내용'만 담는다(개인 검증 기록은 각 학생의 응답에 따로 저장). 기록자는 칸이 아니라 모둠 기록의 _rec(기록자 코드)로 따로 관리
var GROUP_FIELDS = ['g_verdict', 'g_reason', 'g_rewrite', 'g_speaker'];

function saveGroup_(p) {
  var g = studentGroup_(p); // 화면이 보낸 모둠 번호가 아니라, 서버에 저장된 '내 모둠'만 쓸 수 있음
  if (!g) return { ok: false, error: 'not yours' };
  var sh = sheet_(sn_(SHEET_GROUPS), HEAD_GROUPS);
  var cur = loadGroup_(sh, g);
  var f = cur.fields, inc = p.fields || {}, code = cleanCode_(p.code);
  // 기록자: 정해지지 않았을 때만 누구나 맡을 수 있고, 맡은 사람만 내려놓을 수 있다. 모둠 기록은 기록자만 쓸 수 있다(기록자가 없거나 다른 사람이면 서버가 쓰기를 무시)
  if (p.rec === 'claim' && !f._rec) f._rec = { v: code, t: Date.now() };
  else if (p.rec === 'release' && f._rec && f._rec.v === code) delete f._rec;
  var locked = !f._rec || f._rec.v !== code;
  if (!locked) GROUP_FIELDS.forEach(function (k) {
    var n = inc[k];
    if (!n || typeof n.t !== 'number') return;
    if (!f[k] || n.t > f[k].t) f[k] = { v: String(n.v == null ? '' : n.v).slice(0, 3000), t: n.t };
  });
  var json = JSON.stringify(f);
  if (json.length > MAX_JSON) return { ok: false, error: 'too large' };
  if (cur.row < 0) sh.appendRow([g, new Date(), json]);
  else sh.getRange(cur.row, 2, 1, 2).setValues([[new Date(), json]]);
  return { ok: true, fields: f, locked: locked };
}

// 교사용: 기록자가 결석하거나 기기가 꺼졌을 때 기록자를 풀어 준다
function clearRecorder_(p) {
  if (!pinOk_(p)) return { ok: false, error: 'pin' };
  var g = cleanGroup_(p.group);
  if (!g) return { ok: false, error: 'group required' };
  var sh = sheet_(sn_(SHEET_GROUPS), HEAD_GROUPS), cur = loadGroup_(sh, g);
  if (cur.row > 0 && cur.fields._rec) { delete cur.fields._rec; sh.getRange(cur.row, 2, 1, 2).setValues([[new Date(), JSON.stringify(cur.fields)]]); }
  return { ok: true };
}

function getGroup_(p) {
  var g = studentGroup_(p);
  if (!g) return { ok: false, error: 'not yours' };
  return { ok: true, fields: loadGroup_(sheet_(sn_(SHEET_GROUPS), HEAD_GROUPS), g).fields };
}

/* ---------- 설정: 모둠 공유 공개 ---------- */
function getConfig_() { return { shareOpen: cfgGet_('shareOpen') === 'true' }; }

function getShare_() {
  if (!getConfig_().shareOpen) return { ok: true, open: false, groups: {} };
  var sh = sheet_(sn_(SHEET_GROUPS), HEAD_GROUPS);
  var groups = {};
  for (var g = 1; g <= MAXG; g++) {
    var f = loadGroup_(sh, g).fields;
    if (f.g_verdict || f.g_reason) {
      groups[g] = {
        g_verdict: f.g_verdict ? f.g_verdict.v : '',
        g_reason: f.g_reason ? f.g_reason.v : '',
        g_rewrite: f.g_rewrite ? f.g_rewrite.v : ''
      };
    }
  }
  return { ok: true, open: true, groups: groups };
}

/* ---------- 교사 (PIN 필요) ---------- */
// 교사 PIN 변경: 지금 PIN(p.pin)이 맞아야 하고, 새 PIN은 4~20자의 숫자·영문만 허용
function changePin_(p) {
  if (!pinOk_(p)) return { ok: false, error: 'pin' };
  var np = String(p.newPin || '').trim();
  if (!/^[A-Za-z0-9]{4,20}$/.test(np)) return { ok: false, error: 'bad pin' };
  PropertiesService.getScriptProperties().setProperty('TEACHER_PIN', np);
  return { ok: true };
}
// 틀린 횟수는 '요청한 사람(p.cid = 그 기기가 만든 임의 번호)'마다 따로 센다. 학생이 틀려도 그 학생만 10분 잠기고 교사는 영향 없음.
// 다만 cid는 요청자가 마음대로 바꿀 수 있어서, 전체 실패가 10분에 100번을 넘으면(누가 cid를 바꿔 가며 PIN을 찍는 상황)
// 이미 PIN으로 로그인한 적 있는 기기(6시간 유지)만 통과시킨다 → 수업 전에 교사 화면·무대 화면 기기를 모두 한 번씩 로그인해 둘 것.
function pinOk_(p) {
  var cache = CacheService.getScriptCache();
  var cid = String(p.cid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40) || 'anon';
  var kc = 'pinfail:c:' + cid, kt = 'pintrust:' + cid, kg = 'pinfail:all';
  var fails = parseInt(cache.get(kc) || '0', 10);
  if (fails >= 10) return false; // 이 기기는 10분간 잠금
  var trusted = cache.get(kt) !== null;
  var all = parseInt(cache.get(kg) || '0', 10);
  if (all >= 100 && !trusted) return false;
  var real = PropertiesService.getScriptProperties().getProperty('TEACHER_PIN');
  if (real && String(p.pin) === String(real)) {
    if (fails) cache.remove(kc);
    if (!trusted) cache.put(kt, '1', 21600);
    return true;
  }
  cache.put(kc, String(fails + 1), 600);
  cache.put(kg, String(all + 1), 600);
  return false;
}

function teacherAll_(p) {
  if (!pinOk_(p)) return { ok: false, error: 'pin' };
  var sh = sheet_(sn_(SHEET_STUDENTS), HEAD_STUDENTS);
  var last = sh.getLastRow();
  var students = [];
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, HEAD_STUDENTS.length).getValues().forEach(function (r) {
      var d = {};
      try { d = JSON.parse(r[6]) || {}; } catch (e) {}
      students.push({
        code: r[0], group: r[1], updatedAt: toMs_(r[3]), submittedAt: toMs_(r[4]), helpAt: toMs_(r[5]), data: d
      });
    });
  }
  var gsh = sheet_(sn_(SHEET_GROUPS), HEAD_GROUPS);
  var groups = {};
  for (var g = 1; g <= MAXG; g++) { var gf = loadGroup_(gsh, g).fields; if (Object.keys(gf).length) groups[g] = gf; }
  var rm = rosterMap_(), roster = Object.keys(rm).map(function (c) { return { code: c, group: rm[c] }; });
  return { ok: true, students: students, groups: groups, shareOpen: getConfig_().shareOpen, lesson: lessonGet_(), roster: roster, classes: classList_(), cls: CLASS_, notes: notesGet_(), clock: parseInt(cfgGet_('clock') || '0', 10) || 0, now: Date.now() };
}

// 반 만들기: 시트 3개를 만든다(교사 PIN 필요)
function createClass_(p) {
  if (!pinOk_(p)) return { ok: false, error: 'pin' };
  if (!CLASS_) return { ok: false, error: 'default' };
  sheet_(sn_(SHEET_STUDENTS), HEAD_STUDENTS); sheet_(sn_(SHEET_ROSTER), HEAD_ROSTER); sheet_(sn_(SHEET_GROUPS), HEAD_GROUPS);
  return { ok: true };
}
// 반 삭제: 그 반의 시트 3개(학생응답·모둠기록지·명단)와 설정 줄을 지운다. 기본 반은 지울 수 없음(설정·시트의 기준이라)
function deleteClass_(p) {
  if (!pinOk_(p)) return { ok: false, error: 'pin' };
  if (!CLASS_) return { ok: false, error: 'default' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  [SHEET_STUDENTS, SHEET_GROUPS, SHEET_ROSTER].forEach(function (n) { var sh = ss.getSheetByName(sn_(n)); if (sh) ss.deleteSheet(sh); });
  var cs = ss.getSheetByName(SHEET_CONFIG), cache = CacheService.getScriptCache(), suf = '__' + CLASS_;
  if (cs) {
    for (var r = cs.getLastRow(); r >= 2; r--) {
      var k = String(cs.getRange(r, 1).getValue());
      if (k.length > suf.length && k.slice(-suf.length) === suf) { try { cache.remove('cfg:' + k); } catch (e) {} cs.deleteRow(r); }
    }
  }
  rosterDirty_();
  return { ok: true };
}

// 만들어진 반 목록('학생응답' 시트 기준). 기본 반은 빈 문자열.
function classList_() {
  var out = [];
  SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(function (sh) {
    var m = sh.getName().match(/^학생응답(?:_(.+))?$/);
    if (m) out.push(m[1] || '');
  });
  return out;
}

function toMs_(v) { return v instanceof Date ? v.getTime() : 0; }

// 수업 시계: 시작한 시각(서버 시각, ms)을 반별로 저장. 여러 기기(조작용·무대용)가 같은 시계를 보게 하고 새로고침해도 이어짐. 시간이 흘러도 단계에는 영향 없음
function setClock_(p) {
  if (!pinOk_(p)) return { ok: false, error: 'pin' };
  cfgSet_('clock', p.on ? String(Date.now()) : '');
  return { ok: true };
}

// 발표자 노트: 단계 id(0~7) → 메모. 교사 화면에서만 보이며 학생용 조회(getLesson 등)에는 포함하지 않는다
function notesGet_() {
  var t = cfgGet_('notes');
  if (!t) return {};
  try { var o = JSON.parse(t); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; }
}
function setNotes_(p) {
  if (!pinOk_(p)) return { ok: false, error: 'pin' };
  var src = p.notes || {}, out = {}, total = 0;
  for (var k in src) {
    var id = parseInt(k, 10);
    if (isNaN(id) || id < 0 || id > 7) continue;
    var v = String(src[k] == null ? '' : src[k]).slice(0, 1500);
    out[id] = v; total += v.length;
  }
  if (total > 20000) return { ok: false, error: 'too large' };
  cfgSet_('notes', JSON.stringify(out));
  return { ok: true };
}

function setShare_(p) {
  if (!pinOk_(p)) return { ok: false, error: 'pin' };
  cfgSet_('shareOpen', p.open ? 'true' : 'false');
  return { ok: true, shareOpen: !!p.open };
}

function helpClear_(p) {
  if (!pinOk_(p)) return { ok: false, error: 'pin' };
  var sh = sheet_(sn_(SHEET_STUDENTS), HEAD_STUDENTS);
  var row = findRow_(sh, 1, cleanCode_(p.code));
  if (row > 0) sh.getRange(row, 6).setValue('');
  return { ok: true };
}


// ---------- 자료용 PDF 업로드(교사 화면) ----------
// 파일은 교사 드라이브의 'AI 답변 믿어도 될까 자료' 폴더에 저장되고, '링크가 있는 모든 사용자 - 보기'로 공유된다(학생 정보는 없음).
// ※ 처음 한 번, 편집기에서 authorizeDrive 함수를 실행해 드라이브 권한을 승인해야 한다.
var MAX_PDF_BYTES = 15 * 1024 * 1024;
function authorizeDrive() { return DriveApp.getRootFolder().getName(); }
function pdfFolder_() {
  var it = DriveApp.getFoldersByName('AI 답변 믿어도 될까 자료');
  return it.hasNext() ? it.next() : DriveApp.createFolder('AI 답변 믿어도 될까 자료');
}
function uploadPdf_(p) {
  if (!pinOk_(p)) return { ok: false, error: 'pin' };
  var b64 = String(p.base64Data || '');
  if (!b64) return { ok: false, error: 'empty' };
  if (b64.length > MAX_PDF_BYTES * 4 / 3 + 100) return { ok: false, error: 'too large' };
  var name = String(p.filename || '자료.pdf').replace(/[\\/:*?"<>|]/g, '_').slice(0, 100);
  if (!/\.pdf$/i.test(name)) name += '.pdf';
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), 'application/pdf', name);
  var b = blob.getBytes();
  if (b.length < 5 || b[0] !== 0x25 || b[1] !== 0x50 || b[2] !== 0x44 || b[3] !== 0x46) return { ok: false, error: 'not pdf' }; // '%PDF' 로 시작해야 함
  var file = pdfFolder_().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, name: file.getName(), url: 'https://drive.google.com/file/d/' + file.getId() + '/preview' };
}
