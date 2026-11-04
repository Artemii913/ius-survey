const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { score } = require('../docs/scoring.js');
const backend = fs.readFileSync(require('node:path').join(__dirname,'../apps-script/Code.gs'),'utf8');
function answersFor(total) {let extra=total-27;return Array.from({length:27},()=>{const x=Math.min(4,extra);extra-=x;return x+1;});}
const expected=[[27,0],[62,0],[63,1],[81,1],[98,1],[99,2],[135,2]];
function payload(total=81){return {id:'c72e6513-2b0b-4590-a5af-5388dce845ed',version:'ius-27-v1',clientDate:'2026-11-04T09:00:00.000Z',name:'Тестовый участник',age:26,sex:'unspecified',consent:true,website:'',answers:answersFor(total),displayText:'Тестовая запись'};}
test('browser and backend agree on every total and category boundary',()=>{
  const ctx=vm.createContext({});vm.runInContext(backend,ctx);
  for(let total=27;total<=135;total++){
    const got=score(answersFor(total)),server=ctx.validate_(payload(total));
    assert.equal(got.total,total);assert.equal(server.total,total);assert.equal(got.bandIndex,server.bandIndex);
  }
  for(const [total,index]of expected)assert.equal(score(answersFor(total)).bandIndex,index);
});
test('demographics never change scores',()=>{
  const ctx=vm.createContext({});vm.runInContext(backend,ctx);
  for(const sex of ['male','female','other','unspecified'])for(const age of [1,18,120])assert.equal(ctx.validate_({...payload(),age,sex}).total,81);
});
test('reject incomplete, sparse and invalid answers',()=>{
  for(const answers of [[],Array(27),Array(26).fill(3),Array(28).fill(3),[0,...Array(26).fill(3)],[6,...Array(26).fill(3)],['3',...Array(26).fill(3)],[2.5,...Array(26).fill(3)]])assert.throws(()=>score(answers));
});
test('server validates demographics, consent, version and malicious sex keys',()=>{
  const ctx=vm.createContext({});vm.runInContext(backend,ctx);
  for(const patch of [{age:0},{age:121},{age:2.5},{age:'26'},{name:'  '},{name:'a'.repeat(101)},{sex:'__proto__'},{sex:'toString'},{consent:false},{website:'bot'},{version:'fake'},{id:'fake'},{clientDate:'bad'},{answers:Array(27).fill(6)}])assert.throws(()=>ctx.validate_({...payload(),...patch}));
  assert.equal(ctx.safeText_('=IMPORTXML("x")'),'\'=IMPORTXML("x")');
  assert.equal(ctx.safeText_('  +1'),"'  +1");assert.equal(ctx.safeText_('Анна'),'Анна');
});
function harness(){
  const rows=[['Дата получения','ID отправки','Версия','Имя','Возраст','Пол',...Array.from({length:27},(_,i)=>'Вопрос '+(i+1)),'Сумма','Уровень','Полный результат','Дата на устройстве','Согласие','Хеш отправки']];let locked=false,fail=false;const forcedHeights=[];
  const sheet={getLastRow:()=>rows.length,getMaxRows:()=>1000,setRowHeightsForced:(...args)=>forcedHeights.push(args),getRange:(r,c,n=1,m=1)=>({
    getValues:()=>Array.from({length:n},(_,i)=>(rows[r+i-1]||[]).slice(c-1,c-1+m)),
    getValue:()=>rows[r-1]?.[c-1],
    setValues:values=>{if(fail)throw new Error('Storage unavailable');assert.equal(locked,true);values.forEach((v,i)=>{rows[r+i-1]=v;});},
    setNumberFormat:()=>{},setWrapStrategy(value){assert.equal(value,'CLIP');return this;},setVerticalAlignment(value){assert.equal(value,'middle');return this;},createTextFinder:needle=>({matchEntireCell(){return this;},matchCase(){return this;},findNext(){const i=rows.findIndex((row,i)=>i>0&&row[1]===needle);return i<0?null:{getRow:()=>i+1};}})
  })};
  const context={PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'test-sheet'})},SpreadsheetApp:{WrapStrategy:{CLIP:'CLIP'},openById:()=>({getSheetByName:()=>sheet}),flush:()=>{}},LockService:{getScriptLock:()=>({waitLock:()=>{locked=true;},releaseLock:()=>{locked=false;}})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>require('node:crypto').createHash('sha256').update(s).digest(),base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url')},ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})}};
  const ctx=vm.createContext(context);vm.runInContext(backend,ctx);
  return {rows,ctx,forcedHeights,send:p=>ctx.doPost({parameter:{payload:JSON.stringify(p)}}),setFailure:()=>{fail=true;},isLocked:()=>locked};
}
test('writes entire response, computes score server side, prevents formula injection and deduplicates retries',()=>{
  const h=harness(),p={...payload(),name:'=1+1',total:999};
  assert.equal(h.send(p).ok,true);assert.equal(h.rows.length,2);assert.equal(h.rows[1].length,39);
  assert.equal(h.rows[1][3],"'=1+1");assert.deepEqual(Array.from(h.rows[1].slice(6,33)),p.answers);assert.equal(h.rows[1][33],81);assert.equal(h.rows[1][35],p.displayText);
  assert.deepEqual(h.forcedHeights,[[2,1,30]]);
  assert.equal(h.send(p).ok,true);assert.equal(h.rows.length,2);
  assert.equal(h.send({...p,age:30}).ok,false);assert.equal(h.rows.length,2);assert.equal(h.isLocked(),false);
});
test('storage failure never returns a successful receipt and always releases lock',()=>{
  const h=harness();h.setFailure();assert.equal(h.send(payload()).ok,false);assert.equal(h.rows.length,1);assert.equal(h.isLocked(),false);
});
