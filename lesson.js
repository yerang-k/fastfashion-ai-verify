// 수업 구조(단계·모둠·진행 통제·주장 자료)의 기본값과 정규화. 학생 화면·교사 화면이 함께 씁니다.
// 교사가 저장한 설정이 서버에 있으면 그것을, 없으면 이 기본값(= 원래 수업 구성)을 씁니다.
const DEFAULT_LESSON={
 stages:[
  {id:0,name:'준비',time:'3분',on:true},
  {id:1,name:'생각 열기',time:'5분',on:true},
  {id:2,name:'목표',time:'2분',on:true},
  {id:3,name:'개인 조사',time:'10분',on:true},
  {id:7,name:'모둠 정리',time:'8분',on:true},
  {id:4,name:'모둠 공유',time:'13분',on:true},
  {id:5,name:'정리',time:'4분',on:true},
  {id:6,name:'마무리',time:'5분',on:true}],
 groups:[{n:1,size:4,claim:1},{n:2,size:4,claim:2},{n:3,size:4,claim:3},{n:4,size:4,claim:4},{n:5,size:3,claim:5}],
 claims:null,      // null이면 content.js 의 CLAIMS(기본 자료)를 사용
 current:0,        // 교사가 지정한 '현재 단계'(단계 id). 학생은 이 단계 화면만 본다. null=제한 없음(학생이 자유롭게 이동)
 rosterOnly:false, // true면 명단에 등록된 참여 코드만 입장 가능
 summary:{items:[ // 마무리 단계에서 반 전체가 한눈에 보는 ‘우리가 찾은 AI 자료 확인 포인트’ 정리본. 모둠 글은 교사가 설정 ⑥에서 가져와 다듬고, 기본으로는 선생님이 더하는 두 가지만 들어 있음
  {title:'주장 단위로 쪼개고 출처 찾아보기',text:'답변을 주장 단위로 쪼개 확인하고, AI가 댄 출처를 직접 찾아 열어 본다.',by:''},
  {title:'출처가 주장을 뒷받침하는지 확인하기',text:'출처가 주장을 정말 뒷받침하는지, 숫자와 표현이 같은지 확인한다.',by:''},
  {title:'검색으로 교차 확인하기',text:'검색으로 교차 확인하고 비판적으로 받아들인다.',by:''},
  {title:'원래 맥락과 원 출처까지 추적하기',text:'원래의 맥락과 원 출처까지 추적해 본다.',by:''},
  {title:'숫자가 무엇을 센 것인지 확인하기',text:'숫자가 무엇을 센 것인지(범위·정의·조건)와 몇 년 자료인지 확인한다.',by:''},
  {title:'출처가 있어도 내용이 바뀔 수 있다',text:'출처가 실제로 있어도 AI가 숫자나 내용을 바꿔 쓸 수 있고, 존재하지 않는 인용을 만들어 낼 수도 있음을 인지한다.',by:''}]},
 joinUrl:''        // 무대 화면 준비 단계에 크게 보여 줄 학생 접속 주소(짧은 주소). 비우면 학생 링크를 그대로 보여 줌
};
const REQUIRED_STAGES=[0,5]; // 준비(코드·모둠 입력)와 정리(제출)는 숨길 수 없음
const MAX_GROUPS=10,MAX_CLAIMS=10,MAX_SRC=8;
const SRC_LETTERS='ABCDEFGH';
// 자료 링크: http(s)만 허용(javascript: 같은 주소 차단). 'www.…'처럼 붙여 넣으면 https:// 를 앞에 붙여 준다.
const safeUrl=u=>{u=String(u||'').trim();if(/^(www\.|[\w-]+(\.[\w-]+)+(\/|$))/i.test(u)&&!/^[a-z]+:/i.test(u))u='https://'+u;return /^https?:\/\/\S+$/i.test(u)?u.slice(0,500):'';};
// PDF: 구글 드라이브 파일 주소만 받아 학생 화면 안에서 열리는 미리보기 주소로 바꾼다.
const drivePdf=u=>{const m=String(u||'').trim().match(/^https:\/\/drive\.google\.com\/(?:file\/(?:u\/\d+\/)?d\/|open\?id=|uc\?(?:[^#]*&)?id=)([A-Za-z0-9_-]{10,})/);return m?'https://drive.google.com/file/d/'+m[1]+'/preview':'';};

const OLD_NAME_3='개인 검증'; // 예전 기본 이름(단계 3). 서버에 저장된 설정에 남아 있으면 새 이름('개인 조사')으로 바꿔 보여 줌
function normLesson(raw){
 const L=JSON.parse(JSON.stringify(DEFAULT_LESSON));
 if(!raw||typeof raw!=='object')return L;
 if(Array.isArray(raw.stages)){
  const seen={},st=[];
  raw.stages.forEach(s=>{const d=DEFAULT_LESSON.stages.find(x=>x.id===s.id);if(!d||seen[d.id])return;seen[d.id]=1;
   st.push({id:d.id,name:String(s.name===OLD_NAME_3?d.name:(s.name||d.name)).slice(0,20),time:String(s.time==null?d.time:s.time).slice(0,10),on:REQUIRED_STAGES.includes(d.id)?true:s.on!==false});});
  DEFAULT_LESSON.stages.forEach((d,di)=>{if(seen[d.id])return; // 저장된 설정에 없는 단계(새로 생긴 단계)는 기본 순서상 바로 앞 단계 뒤에 끼워 넣음
   const pi=di?st.findIndex(s=>s.id===DEFAULT_LESSON.stages[di-1].id):-1;st.splice(pi+1,0,Object.assign({},d));seen[d.id]=1;});
  const i=st.findIndex(s=>s.id===0);if(i>0)st.unshift(st.splice(i,1)[0]); // 준비는 항상 맨 앞
  L.stages=st;}
 if(Array.isArray(raw.claims)&&raw.claims.length)
  L.claims=raw.claims.slice(0,MAX_CLAIMS).map((c,i)=>({n:i+1,t:String(c.t||''),hint:String(c.hint||''),cite:normCite(c.cite),
   src:(Array.isArray(c.src)?c.src:[]).slice(0,MAX_SRC).map(s=>({type:String(s.type||''),title:String(s.title||''),body:String(s.body||''),url:safeUrl(s.url),pdf:drivePdf(s.pdf)}))}));
 const ncl=(L.claims||CLAIMS).length;
 if(Array.isArray(raw.groups)&&raw.groups.length)
  L.groups=raw.groups.slice(0,MAX_GROUPS).map((g,i)=>({n:i+1,size:Math.max(1,Math.min(12,+g.size||4)),claim:Math.max(1,Math.min(ncl,+g.claim||1))}));
 L.groups.forEach(g=>{if(g.claim>ncl)g.claim=1;});
 L.rosterOnly=!!raw.rosterOnly;
 L.joinUrl=safeUrl(raw.joinUrl);
 L.summary=normSummary(raw.summary);
 const vis=L.stages.filter(s=>s.on);
 if(raw.current===null)L.current=null; // 명시적으로 null이면 제한 없음
 else{const c=raw.current==null?0:+raw.current;L.current=vis.some(s=>s.id===c)?c:vis[0].id;} // 숨겨진 단계면 첫 단계로
 return L;
}
// AI 답변 아래 '근거 자료'로 보여 줄 인용(ref)과, 자료 카드 중 AI가 인용한 카드 위치(src, -1=없음), 카드 배지 문구(badge, 비우면 기본 문구)
const normCite=c=>{c=c||{};const n=parseInt(c.src,10);return{ref:String(c.ref||'').slice(0,80),src:n>=0&&n<MAX_SRC?n:-1,badge:String(c.badge||'').slice(0,40)};};
const MAX_SUM=10;
/* 마무리 정리본 = 모둠이 저장한 확인 포인트(모둠 순서) + 교사 정리본의 나머지 항목. finds: {모둠번호: 확인 포인트 글}.
   교사가 가져와 다듬어 저장한 ‘N모둠’ 항목이 있으면 그 글을 우선 쓰고, 기본 샘플 그대로이면 모둠 글이 있을 때 샘플은 숨긴다. */
const mergeSummary=(items,finds)=>{items=items||[];const out=[];
 Object.keys(finds||{}).map(Number).sort((a,b)=>a-b).forEach(n=>{const t=String(finds[n]||'').trim();const mine=items.find(x=>x.by===n+'모둠');
  if(mine)out.push(mine);else if(t)out.push({title:'',text:t,by:n+'모둠'});});
 if(!out.length)return items;
 const key=a=>JSON.stringify(a.map(x=>[x.title,x.text,x.by]));
 if(key(items)===key(DEFAULT_LESSON.summary.items))return out; // 기본 샘플 그대로면 모둠 글만 보여 줌
 items.forEach(x=>{if(!out.includes(x))out.push(x);});return out;};
const normSummary=s=>{const a=s&&Array.isArray(s.items)?s.items:DEFAULT_LESSON.summary.items;return{items:a.slice(0,MAX_SUM).map(x=>({title:String((x&&x.title)||'').slice(0,30),text:String((x&&x.text)||'').slice(0,240),by:String((x&&x.by)||'').slice(0,20)}))};};
const claimsOf=L=>L.claims||CLAIMS;
const visStages=L=>L.stages.filter(s=>s.on);
const claimOfGroup=(L,g)=>{const gr=L.groups.find(x=>x.n===+g);return gr?claimsOf(L).find(c=>c.n===gr.claim)||null:null;};

// 무대 화면(교사용 프로젝터 화면)에 보여 줄 단계별 안내. 학생 화면의 '지금 할 일'과 같은 내용을 크게 보여 준다.
// 발표자 노트 기본값(교사 화면에만 보임, 교사가 수정하면 서버에 저장된 내용이 우선). 정답·풀이는 넣지 않고 진행 요령만 적는다.
const DEFAULT_NOTES={
 0:'학생들이 코드·모둠을 입력하도록 도와요. 명단에 없는 코드는 입장이 안 되니 학생 관리에서 확인해요. 모두 ‘준비 완료’를 누르면 시작해요.',
 1:'AI 답변을 함께 읽게 해요. 정답을 말해 주지 말고 “왜 그렇게 생각했나요?”를 물어요. 다 쓰면 저장하기를 누르도록 안내해요.',
 2:'기준(출처·정확성·신뢰성)을 미리 알려 주지 않는 것이 핵심이에요. “오늘은 우리가 직접 조사하면서, AI 자료를 쓸 때 무엇을 확인해야 하는지 찾아낼 거예요”라고 안내해요. 판정 4단계는 조사 결과를 말하는 도구일 뿐이에요.',
 3:'모둠원끼리 자료 A·B·C를 한 명씩 나눠 맡게 해요(인원이 남으면 한 자료를 두 명이 함께). 각자 맡은 자료를 직접 조사하는 시간이에요(모둠 의논은 다음 단계). 막막해하면 먼저 ‘원문 열기’로 AI가 댄 근거가 있는지 보게 하고, 그래도 어려우면 ‘힌트 보기’를 안내해요. 순회하며 “그래서 AI 자료는 무엇을 확인해야 할까?”를 미리 생각해 보라고 물어요(쓰는 건 다음 모둠 정리 단계에서 함께 해요 — 자료 1개만으로는 확인 포인트를 못 찾는 학생이 있는 게 정상이에요). 다 쓰면 저장하기를 누르게 해요.',
 7:'먼저 모둠마다 기록자를 정하게 해요. 모둠원이 각자 맡은 자료를 돌아가며 설명하고(화면의 ‘모둠원이 각자 조사한 내용’에도 저장한 대로 모여서 보여요), ‘판정 근거 한 문장’ → ‘모둠 판정’ → ‘확인 포인트 한 줄’(발표의 중심) 순서로 정하게 해요. 기록자만 입력할 수 있고, 저장하기를 눌러야 다른 모둠원 화면에 보여요. [예상 확인 포인트 — 교사용 안전망, 정답 아님] 1모둠: 널리 인용돼도 최초 출처가 없을 수 있다(원 출처 추적) / 2모둠: 수치는 무엇을 포함해 계산했는지(정의·범위) / 3모둠: 숫자가 나온 조건 / 4모둠: AI가 말한 출처(환경통계포털)를 직접 찾아 계산해 보고 숫자의 범위·연도 확인(대체로 맞지만 옷 전체가 아님) / 5모둠: 숫자가 맞아도 원 출처를 찾아 정확히 적기. [예상 밖일 때] 타당하면 칭찬하고 정리본에 넣어요. 얕으면 “그걸 어떻게 확인할 건데?”, 틀렸으면 “그 근거가 자료 어디에 있었지?”, 못 찾았으면 “AI 답과 카드를 나란히 놓고 달라진 곳은?”을 물어요.',
 4:'모둠 카드를 눌러 그 모둠의 발표 내용을 크게 보여 줘요(리모컨 →로 다음 모둠). 발표가 끝난 뒤 ‘모둠 판정 공개’를 켜면 학생 표가 채워져요. 다섯 모둠의 확인 포인트를 칠판에 모아 비슷한 것끼리 묶고, 학생이 우리 반 체크리스트를 쓰게 해요. 마지막에 묶음에 이름을 붙여 줘요(예: 출처가 실제로 있나 / 원 출처인가 / 숫자의 정의·조건 / 누가 만들었나) — 이때 출처·정확성·신뢰성이라는 말을 소개해요. ‘현황’의 ‘확인 포인트 모아 보기’로 발표 순서를 정해요(예상 밖 발견을 먼저, 그다음 예상 포인트). 학생 발표에서 안 나온 예상 포인트(‘누가 만든 자료인가’ 등)는 정리본에 ‘선생님이 더한 것’으로 넣어요.',
 5:'우리 반 체크리스트로 처음 판단을 다시 보게 해요. “앞으로 반드시 할 확인 3가지”를 쓰고, 자기평가를 체크한 뒤 ‘제출하기’를 누르도록 안내해요.',
 6:'무대 화면의 ‘우리가 찾은 AI 자료 확인 포인트’(학생 화면은 ‘🧩 확인 포인트 보기’ 버튼)를 한번 쭉 함께 읽으며 정리해요. 정리본은 ⚙ 설정 ⑥에서 만들어요(‘모둠 확인 포인트 가져오기’ → 표현 다듬기·이름 붙이기 → 저장). 이어서 ‘참고 자료’의 전문가 기준과 비교해 보게 하고, 다음 차시엔 이 체크리스트로 자신이 모아 온 자료를 검증해 검증 노트로 써서 제출한다고 안내해요.'
};
const STAGE_GUIDE={
 0:{todo:'참여 코드를 입력하고 내 모둠을 선택해요',points:['참여 코드 입력','내 모둠 선택','‘준비 완료’ 누르기']},
 1:{todo:'AI 답변을 읽고, 보고서에 인용해도 되는지 나의 첫 판단을 적어요',points:['AI 답변 읽기','인용해도 될까? 첫 판단 고르기','그렇게 생각한 이유 쓰기']},
 2:{todo:'오늘의 목표와 우리가 할 일을 함께 읽어요',points:['AI 자료를 쓸 때 무엇을 확인해야 할지 직접 찾아내기','내가 맡은 자료를 원문으로 조사하기','발견한 확인 포인트를 모둠에서 모으기','우리 반 체크리스트 만들기']},
 3:{todo:'모둠원끼리 자료 A·B·C를 나눠 맡아, 내가 맡은 자료를 직접 조사해요',points:['자료 1개 나눠 맡기','자료 카드·원문 열어 보기','내가 확인한 것, 이상한 점 쓰기','내 판정과 근거 한 문장 쓰기']},
 4:{todo:'모둠별로 발표하고, 다섯 모둠의 확인 포인트를 모아 우리 반 체크리스트를 만들어요',points:['발표 듣기 (모둠당 1분 30초)','다른 모둠 확인 포인트·판정 기록','다섯 조각을 모아 체크리스트 쓰기','전체 토의 쓰기']},
 5:{todo:'우리 반 체크리스트로 처음 생각을 다시 보고, 배운 점을 정리해 제출해요',points:['체크리스트로 처음 판단 다시 보기','앞으로 반드시 할 확인 3가지 쓰기','자기평가 체크','제출하기']},
 7:{todo:'각자 맡은 자료를 설명하고, 모둠이 발표할 판정 근거 → 판정 → 확인 포인트를 정리해요',points:['기록자 한 명 정하기','각자 맡은 자료 설명하기','판정 근거 한 문장 쓰고 모둠 판정 정하기','근거에서 확인 포인트 한 줄 정하기 (기록자만 입력)']},
 6:{todo:'우리가 찾은 확인 포인트를 한번 쭉 정리하고 마무리해요',points:['우리가 찾은 AI 자료 확인 포인트 정리','AI의 답은 탐구의 출발점이지 인용할 결론이 아니다','다음 시간: 이 체크리스트로 내가 모아 온 자료를 검증해 검증 노트 쓰기']}
};
