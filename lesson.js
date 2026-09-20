// 수업 구조(단계·모둠·진행 통제·주장 자료)의 기본값과 정규화. 학생 화면·교사 화면이 함께 씁니다.
// 교사가 저장한 설정이 서버에 있으면 그것을, 없으면 이 기본값(= 원래 수업 구성)을 씁니다.
const DEFAULT_LESSON={
 stages:[
  {id:0,name:'준비',time:'3분',on:true},
  {id:1,name:'생각 열기',time:'5분',on:true},
  {id:2,name:'목표',time:'2분',on:true},
  {id:3,name:'개인 검증',time:'9분',on:true},
  {id:7,name:'모둠 정리',time:'8분',on:true},
  {id:4,name:'모둠 공유',time:'13분',on:true},
  {id:5,name:'정리',time:'7분',on:true},
  {id:6,name:'마무리',time:'3분',on:true}],
 groups:[{n:1,size:4,claim:1},{n:2,size:4,claim:2},{n:3,size:4,claim:3},{n:4,size:4,claim:4},{n:5,size:3,claim:5}],
 claims:null,      // null이면 content.js 의 CLAIMS(기본 자료)를 사용
 current:0,        // 교사가 지정한 '현재 단계'(단계 id). 학생은 이 단계 화면만 본다. null=제한 없음(학생이 자유롭게 이동)
 rosterOnly:false  // true면 명단에 등록된 참여 코드만 입장 가능
};
const REQUIRED_STAGES=[0,5]; // 준비(코드·모둠 입력)와 정리(제출)는 숨길 수 없음
const MAX_GROUPS=10,MAX_CLAIMS=10,MAX_SRC=8;
const SRC_LETTERS='ABCDEFGH';
// 자료 링크: http(s)만 허용(javascript: 같은 주소 차단). 'www.…'처럼 붙여 넣으면 https:// 를 앞에 붙여 준다.
const safeUrl=u=>{u=String(u||'').trim();if(/^(www\.|[\w-]+(\.[\w-]+)+(\/|$))/i.test(u)&&!/^[a-z]+:/i.test(u))u='https://'+u;return /^https?:\/\/\S+$/i.test(u)?u.slice(0,500):'';};
// PDF: 구글 드라이브 파일 주소만 받아 학생 화면 안에서 열리는 미리보기 주소로 바꾼다.
const drivePdf=u=>{const m=String(u||'').trim().match(/^https:\/\/drive\.google\.com\/(?:file\/(?:u\/\d+\/)?d\/|open\?id=|uc\?(?:[^#]*&)?id=)([A-Za-z0-9_-]{10,})/);return m?'https://drive.google.com/file/d/'+m[1]+'/preview':'';};

function normLesson(raw){
 const L=JSON.parse(JSON.stringify(DEFAULT_LESSON));
 if(!raw||typeof raw!=='object')return L;
 if(Array.isArray(raw.stages)){
  const seen={},st=[];
  raw.stages.forEach(s=>{const d=DEFAULT_LESSON.stages.find(x=>x.id===s.id);if(!d||seen[d.id])return;seen[d.id]=1;
   st.push({id:d.id,name:String(s.name||d.name).slice(0,20),time:String(s.time==null?d.time:s.time).slice(0,10),on:REQUIRED_STAGES.includes(d.id)?true:s.on!==false});});
  DEFAULT_LESSON.stages.forEach((d,di)=>{if(seen[d.id])return; // 저장된 설정에 없는 단계(새로 생긴 단계)는 기본 순서상 바로 앞 단계 뒤에 끼워 넣음
   const pi=di?st.findIndex(s=>s.id===DEFAULT_LESSON.stages[di-1].id):-1;st.splice(pi+1,0,Object.assign({},d));seen[d.id]=1;});
  const i=st.findIndex(s=>s.id===0);if(i>0)st.unshift(st.splice(i,1)[0]); // 준비는 항상 맨 앞
  L.stages=st;}
 if(Array.isArray(raw.claims)&&raw.claims.length)
  L.claims=raw.claims.slice(0,MAX_CLAIMS).map((c,i)=>({n:i+1,t:String(c.t||''),hint:String(c.hint||''),
   src:(Array.isArray(c.src)?c.src:[]).slice(0,MAX_SRC).map(s=>({type:String(s.type||''),title:String(s.title||''),body:String(s.body||''),url:safeUrl(s.url),pdf:drivePdf(s.pdf)}))}));
 const ncl=(L.claims||CLAIMS).length;
 if(Array.isArray(raw.groups)&&raw.groups.length)
  L.groups=raw.groups.slice(0,MAX_GROUPS).map((g,i)=>({n:i+1,size:Math.max(1,Math.min(12,+g.size||4)),claim:Math.max(1,Math.min(ncl,+g.claim||1))}));
 L.groups.forEach(g=>{if(g.claim>ncl)g.claim=1;});
 L.rosterOnly=!!raw.rosterOnly;
 const vis=L.stages.filter(s=>s.on);
 if(raw.current===null)L.current=null; // 명시적으로 null이면 제한 없음
 else{const c=raw.current==null?0:+raw.current;L.current=vis.some(s=>s.id===c)?c:vis[0].id;} // 숨겨진 단계면 첫 단계로
 return L;
}
const claimsOf=L=>L.claims||CLAIMS;
const visStages=L=>L.stages.filter(s=>s.on);
const claimOfGroup=(L,g)=>{const gr=L.groups.find(x=>x.n===+g);return gr?claimsOf(L).find(c=>c.n===gr.claim)||null:null;};

// 무대 화면(교사용 프로젝터 화면)에 보여 줄 단계별 안내. 학생 화면의 '지금 할 일'과 같은 내용을 크게 보여 준다.
const STAGE_GUIDE={
 0:{todo:'참여 코드를 입력하고 내 모둠을 선택해요',points:['참여 코드 입력','내 모둠 선택','‘준비 완료’ 누르기']},
 1:{todo:'AI 답변을 읽고, 보고서에 인용해도 되는지 나의 첫 판단을 적어요',points:['AI 답변 읽기','인용해도 될까? 첫 판단 고르기','그렇게 생각한 이유 쓰기']},
 2:{todo:'오늘의 목표와 판정 기준을 함께 읽어요',points:['출처 — 어디서 왔는가?','정확성 — 다른 자료와 일치하는가?','신뢰성 — 만든 주체와 이해관계는?']},
 3:{todo:'혼자서 우리 모둠 문장을 자료와 대조해 판정하고, 보고서에 쓸 수 있게 고쳐 써요',points:['자료 카드 읽기','출처·정확성·신뢰성 확인','내 판정과 근거 한 문장','보고서용으로 고쳐 쓰기']},
 4:{todo:'모둠별로 발표하고, 다른 모둠의 판정과 근거를 기록해요',points:['발표 듣기 (모둠당 2분)','다른 모둠 판정·근거 기록','전체 토의와 피드백 쓰기']},
 5:{todo:'처음 생각과 비교하며 배운 점을 정리하고 제출해요',points:['지금의 판단 고르기','앞으로 할 확인 절차 쓰기','자기평가 체크','제출하기']},
 7:{todo:'각자 판정한 것을 나누고, 모둠이 발표할 내용을 하나로 정리해요',points:['기록자 한 명 정하기','서로의 판정과 근거 나누기','모둠 판정·근거 한 문장 정하기','보고서용 문장 정리 (기록자만 입력)']},
 6:{todo:'오늘의 한 문장을 읽고 마무리해요',points:['AI의 답은 탐구의 출발점이지 인용할 결론이 아니다','출처를 추적하고, 조건을 묻고, 비교한 뒤에 쓴다']}
};
