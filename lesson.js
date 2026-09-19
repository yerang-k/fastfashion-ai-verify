// 수업 구조(단계·모둠·진행 통제·주장 자료)의 기본값과 정규화. 학생 화면·교사 화면이 함께 씁니다.
// 교사가 저장한 설정이 서버에 있으면 그것을, 없으면 이 기본값(= 원래 수업 구성)을 씁니다.
const DEFAULT_LESSON={
 stages:[
  {id:0,name:'준비',time:'3분',on:true},
  {id:1,name:'생각 열기',time:'5분',on:true},
  {id:2,name:'목표',time:'2분',on:true},
  {id:3,name:'모둠 탐구',time:'17분',on:true},
  {id:4,name:'모둠 공유',time:'13분',on:true},
  {id:5,name:'정리',time:'7분',on:true},
  {id:6,name:'마무리',time:'3분',on:true}],
 groups:[{n:1,size:4,claim:1},{n:2,size:4,claim:2},{n:3,size:4,claim:3},{n:4,size:4,claim:4},{n:5,size:3,claim:5}],
 claims:null,      // null이면 content.js 의 CLAIMS(기본 자료)를 사용
 openTo:null,      // null=학생이 모든 단계로 이동 가능, 숫자=보이는 단계 중 그 순번(0부터)까지만 이동 가능
 rosterOnly:false  // true면 명단에 등록된 참여 코드만 입장 가능
};
const REQUIRED_STAGES=[0,5]; // 준비(코드·모둠 입력)와 정리(제출)는 숨길 수 없음
const MAX_GROUPS=10,MAX_CLAIMS=10,MAX_SRC=5;

function normLesson(raw){
 const L=JSON.parse(JSON.stringify(DEFAULT_LESSON));
 if(!raw||typeof raw!=='object')return L;
 if(Array.isArray(raw.stages)){
  const seen={},st=[];
  raw.stages.forEach(s=>{const d=DEFAULT_LESSON.stages.find(x=>x.id===s.id);if(!d||seen[d.id])return;seen[d.id]=1;
   st.push({id:d.id,name:String(s.name||d.name).slice(0,20),time:String(s.time==null?d.time:s.time).slice(0,10),on:REQUIRED_STAGES.includes(d.id)?true:s.on!==false});});
  DEFAULT_LESSON.stages.forEach(d=>{if(!seen[d.id])st.push(Object.assign({},d));});
  const i=st.findIndex(s=>s.id===0);if(i>0)st.unshift(st.splice(i,1)[0]); // 준비는 항상 맨 앞
  L.stages=st;}
 if(Array.isArray(raw.claims)&&raw.claims.length)
  L.claims=raw.claims.slice(0,MAX_CLAIMS).map((c,i)=>({n:i+1,t:String(c.t||''),hint:String(c.hint||''),
   src:(Array.isArray(c.src)?c.src:[]).slice(0,MAX_SRC).map(s=>({type:String(s.type||''),title:String(s.title||''),body:String(s.body||'')}))}));
 const ncl=(L.claims||CLAIMS).length;
 if(Array.isArray(raw.groups)&&raw.groups.length)
  L.groups=raw.groups.slice(0,MAX_GROUPS).map((g,i)=>({n:i+1,size:Math.max(1,Math.min(12,+g.size||4)),claim:Math.max(1,Math.min(ncl,+g.claim||1))}));
 L.groups.forEach(g=>{if(g.claim>ncl)g.claim=1;});
 L.rosterOnly=!!raw.rosterOnly;
 const vis=L.stages.filter(s=>s.on).length;
 L.openTo=(raw.openTo==null||raw.openTo==='')?null:Math.max(0,Math.min(vis-1,+raw.openTo||0));
 return L;
}
const claimsOf=L=>L.claims||CLAIMS;
const visStages=L=>L.stages.filter(s=>s.on);
const claimOfGroup=(L,g)=>{const gr=L.groups.find(x=>x.n===+g);return gr?claimsOf(L).find(c=>c.n===gr.claim)||null:null;};
