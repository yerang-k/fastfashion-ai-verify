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

var CLASS_ = ''; // 이번 요청의 반(기본 반은 빈 문자열)
function cleanClass_(c) { return String(c || '').replace(/[^A-Za-z0-9가-힣_-]/g, '').slice(0, 20); }
function sn_(name) { return CLASS_ ? name + '_' + CLASS_ : name; } // 반별 시트 이름
function ck_(key) { return CLASS_ ? key + '__' + CLASS_ : key; } // 반별 설정 키

function handle_(p) {
  CLASS_ = cleanClass_(p['class']);
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    switch (p.action) {
      case 'saveStudent': return out_(saveStudent_(p));
      case 'getStudent': return out_(getStudent_(p));
      case 'getLesson': return out_(getLesson_(p));
      case 'setLesson': return out_(setLesson_(p));
      case 'setStage': return out_(setStage_(p));
      case 'setRoster': return out_(setRoster_(p));
      case 'updateStudent': return out_(updateStudent_(p));
      case 'deleteStudent': return out_(deleteStudent_(p));
      case 'help': return out_(help_(p));
      case 'saveGroup': return out_(saveGroup_(p));
      case 'getGroup': return out_(getGroup_(p));
      case 'getShare': return out_(getShare_());
      case 'teacherAll': return out_(teacherAll_(p));
      case 'setShare': return out_(setShare_(p));
      case 'helpClear': return out_(helpClear_(p));
      default: return out_({ ok: false, error: 'unknown action' });
    }
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
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
    // 코드 열을 먼저 텍스트로 고정해야 '2-3-07' 같은 코드가 날짜로 바뀌지 않는다
    sh = ss.insertSheet(name);
    if (/^(학생응답|명단)/.test(name)) sh.getRange('A:A').setNumberFormat('@');
    sh.appendRow(head);
    sh.setFrozenRows(1);
    TEXT_FMT_DONE_[name] = true;
  } else if (/^(학생응답|명단)/.test(name) && !TEXT_FMT_DONE_[name]) {
    sh.getRange('A:A').setNumberFormat('@'); // 이미 있는 시트도 코드 열을 텍스트로(이후 입력분부터 적용)
    TEXT_FMT_DONE_[name] = true;
  }
  return sh;
}

function findRow_(sh, keyCol, key) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var vals = sh.getRange(2, keyCol, last - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0]) === String(key)) return i + 2;
  return -1;
}

function cleanCode_(c) { return String(c || '').trim().slice(0, 30); }
function cleanGroup_(g) { g = parseInt(g, 10); return g >= 1 && g <= MAXG ? g : 0; }

/* ---------- 명단(교사가 등록한 코드→모둠) : 학생 모둠의 기준 ---------- */
function rosterMap_() {
  var sh = sheet_(sn_(SHEET_ROSTER), HEAD_ROSTER);
  var last = sh.getLastRow(), m = {};
  if (last >= 2) sh.getRange(2, 1, last - 1, 2).getValues().forEach(function (r) { m[String(r[0])] = parseInt(r[1], 10) || 0; });
  return m;
}
function rosterUpsert_(code, group) {
  var sh = sheet_(sn_(SHEET_ROSTER), HEAD_ROSTER);
  var row = findRow_(sh, 1, code);
  if (row < 0) sh.appendRow([code, group]); else sh.getRange(row, 2).setValue(group);
}
function rosterDelete_(code) {
  var sh = sheet_(sn_(SHEET_ROSTER), HEAD_ROSTER);
  var row = findRow_(sh, 1, code);
  if (row > 0) sh.deleteRow(row);
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
  var row = rowC > 0 ? rowC : rowD;
  var submittedAt = p.submitted ? now : '';
  if (row < 0) {
    sh.appendRow([code, group, dev, now, submittedAt, '', json]);
  } else {
    var cur = sh.getRange(row, 1, 1, HEAD_STUDENTS.length).getValues()[0];
    sh.getRange(row, 1, 1, HEAD_STUDENTS.length).setValues([[
      code, group, dev || cur[2], now, submittedAt || cur[4], cur[5], json
    ]]);
  }
  return { ok: true, group: group };
}

// 코드 사용 여부와 명단 정보만 알려 준다(응답 내용은 돌려주지 않음).
function getStudent_(p) {
  var code = cleanCode_(p.code);
  var sh = sheet_(sn_(SHEET_STUDENTS), HEAD_STUDENTS);
  var row = findRow_(sh, 1, code);
  var rg = rosterMap_()[code] || 0;
  var lesson = lessonGet_() || {};
  var res = { ok: true, found: row > 0, rosterFound: !!rg, rosterGroup: rg, rosterOnly: !!lesson.rosterOnly };
  if (row > 0) res.dev = String(sh.getRange(row, 3).getValue());
  return res;
}

/* ---------- 수업 설정(교사가 저장, 학생이 주기적으로 읽음) ---------- */
function cfgGet_(key) {
  var sh = sheet_(SHEET_CONFIG, ['key', 'value']);
  var row = findRow_(sh, 1, ck_(key));
  return row > 0 ? String(sh.getRange(row, 2).getValue()) : '';
}
function cfgSet_(key, val) {
  var sh = sheet_(SHEET_CONFIG, ['key', 'value']);
  var row = findRow_(sh, 1, ck_(key));
  if (row < 0) sh.appendRow([ck_(key), val]); else sh.getRange(row, 2).setValue(val);
}
function lessonGet_() {
  var t = cfgGet_('lesson');
  if (!t) return null;
  try { return JSON.parse(t); } catch (e) { return null; }
}

// 학생용: 수업 설정 + 이 기기(또는 코드)가 배정받은 코드·모둠
function getLesson_(p) {
  var lesson = lessonGet_();
  var sh = sheet_(sn_(SHEET_STUDENTS), HEAD_STUDENTS);
  var dev = String(p.dev || ''), code = cleanCode_(p.code);
  var row = dev ? findRow_(sh, 3, dev) : -1;
  if (row < 0 && code) row = findRow_(sh, 1, code);
  var effCode = code, grp = 0;
  if (row > 0) { effCode = String(sh.getRange(row, 1).getValue()); grp = parseInt(sh.getRange(row, 2).getValue(), 10) || 0; }
  var rg = effCode ? (rosterMap_()[effCode] || 0) : 0;
  if (rg) grp = rg;
  var me = (row > 0 || rg) ? { code: effCode, group: grp } : null;
  return { ok: true, lesson: lesson, me: me };
}

function setLesson_(p) {
  if (!pinOk_(p.pin)) return { ok: false, error: 'pin' };
  if (!p.lesson || typeof p.lesson !== 'object') return { ok: false, error: 'bad lesson' };
  var stored = lessonGet_() || {};
  var merged = {};
  for (var k in p.lesson) merged[k] = p.lesson[k];
  merged.current = 'current' in stored ? stored.current : 0; // 현재 단계는 단계 버튼으로만 바뀜
  var json = JSON.stringify(merged);
  if (json.length > MAX_JSON) return { ok: false, error: 'too large' };
  cfgSet_('lesson', json);
  return { ok: true };
}

// 교사가 학생에게 보여 줄 '현재 단계'를 지정한다(단계 id 0~6). 비우면(null) 학생이 자유롭게 이동한다.
function setStage_(p) {
  if (!pinOk_(p.pin)) return { ok: false, error: 'pin' };
  var l = lessonGet_() || {};
  var n = parseInt(p.stage, 10);
  if (p.stage === null || p.stage === '' || p.stage === undefined) l.current = null;
  else if (isNaN(n) || n < 0 || n > 6) return { ok: false, error: 'bad stage' };
  else l.current = n;
  cfgSet_('lesson', JSON.stringify(l));
  return { ok: true, current: l.current };
}

/* ---------- 명단 · 학생 관리 (교사) ---------- */
function setRoster_(p) {
  if (!pinOk_(p.pin)) return { ok: false, error: 'pin' };
  var list = (p.list || []).slice(0, 500), map = {}, order = [];
  list.forEach(function (r) {
    var c = cleanCode_(r.code), g = cleanGroup_(r.group);
    if (c && g) { if (!(c in map)) order.push(c); map[c] = g; }
  });
  var sh = sheet_(sn_(SHEET_ROSTER), HEAD_ROSTER);
  var cur = p.mode === 'replace' ? {} : rosterMap_();
  var curOrder = p.mode === 'replace' ? [] : Object.keys(cur);
  order.forEach(function (c) { if (!(c in cur)) curOrder.push(c); cur[c] = map[c]; });
  var last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, 2).clearContent();
  if (curOrder.length) sh.getRange(2, 1, curOrder.length, 2).setValues(curOrder.map(function (c) { return [c, cur[c]]; }));
  // 이미 접속한 학생의 모둠도 명단에 맞춤
  var ssh = sheet_(sn_(SHEET_STUDENTS), HEAD_STUDENTS), sl = ssh.getLastRow();
  if (sl >= 2) {
    var rng = ssh.getRange(2, 1, sl - 1, 2), vals = rng.getValues(), ch = false;
    vals.forEach(function (r) { var g = map[String(r[0])]; if (g && r[1] !== g) { r[1] = g; ch = true; } });
    if (ch) rng.setValues(vals);
  }
  return { ok: true, count: curOrder.length };
}

function updateStudent_(p) {
  if (!pinOk_(p.pin)) return { ok: false, error: 'pin' };
  var code = cleanCode_(p.code);
  var newCode = cleanCode_(p.newCode) || code;
  var g = p.group == null || p.group === '' ? 0 : cleanGroup_(p.group);
  var ssh = sheet_(sn_(SHEET_STUDENTS), HEAD_STUDENTS);
  var row = findRow_(ssh, 1, code);
  var roster = rosterMap_();
  if (newCode !== code && (findRow_(ssh, 1, newCode) > 0 || roster[newCode])) return { ok: false, error: 'dup' };
  var curGroup = g || roster[code] || (row > 0 ? parseInt(ssh.getRange(row, 2).getValue(), 10) : 0);
  if (!curGroup) return { ok: false, error: 'group required' };
  if (row > 0) ssh.getRange(row, 1, 1, 2).setValues([[newCode, curGroup]]);
  if (newCode !== code) rosterDelete_(code);
  rosterUpsert_(newCode, curGroup); // 이후 학생 기기가 저장해도 이 모둠이 유지됨
  return { ok: true };
}

function deleteStudent_(p) {
  if (!pinOk_(p.pin)) return { ok: false, error: 'pin' };
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
  sh.getRange(row, 6).setValue(new Date());
  return { ok: true };
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

var GROUP_FIELDS = ['g_src', 'g_acc', 'g_rel', 'g_verdict', 'g_reason', 'g_rewrite', 'g_speaker', 'g_recorder'];

function saveGroup_(p) {
  var g = cleanGroup_(p.group);
  if (!g) return { ok: false, error: 'group required' };
  var sh = sheet_(sn_(SHEET_GROUPS), HEAD_GROUPS);
  var cur = loadGroup_(sh, g);
  var f = cur.fields, inc = p.fields || {};
  GROUP_FIELDS.forEach(function (k) {
    var n = inc[k];
    if (!n || typeof n.t !== 'number') return;
    if (!f[k] || n.t > f[k].t) f[k] = { v: String(n.v == null ? '' : n.v).slice(0, 3000), t: n.t };
  });
  var json = JSON.stringify(f);
  if (json.length > MAX_JSON) return { ok: false, error: 'too large' };
  if (cur.row < 0) sh.appendRow([g, new Date(), json]);
  else sh.getRange(cur.row, 2, 1, 2).setValues([[new Date(), json]]);
  return { ok: true, fields: f };
}

function getGroup_(p) {
  var g = cleanGroup_(p.group);
  if (!g) return { ok: false, error: 'group required' };
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
function pinOk_(pin) {
  var cache = CacheService.getScriptCache();
  var fails = parseInt(cache.get('pinfail') || '0', 10);
  if (fails >= 10) return false; // 10회 실패 시 10분간 잠금
  var real = PropertiesService.getScriptProperties().getProperty('TEACHER_PIN');
  if (real && String(pin) === String(real)) return true;
  cache.put('pinfail', String(fails + 1), 600);
  return false;
}

function teacherAll_(p) {
  if (!pinOk_(p.pin)) return { ok: false, error: 'pin' };
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
  return { ok: true, students: students, groups: groups, shareOpen: getConfig_().shareOpen, lesson: lessonGet_(), roster: roster, classes: classList_(), cls: CLASS_ };
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

function setShare_(p) {
  if (!pinOk_(p.pin)) return { ok: false, error: 'pin' };
  cfgSet_('shareOpen', p.open ? 'true' : 'false');
  return { ok: true, shareOpen: !!p.open };
}

function helpClear_(p) {
  if (!pinOk_(p.pin)) return { ok: false, error: 'pin' };
  var sh = sheet_(sn_(SHEET_STUDENTS), HEAD_STUDENTS);
  var row = findRow_(sh, 1, cleanCode_(p.code));
  if (row > 0) sh.getRange(row, 6).setValue('');
  return { ok: true };
}
