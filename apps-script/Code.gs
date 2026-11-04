/** Backend for the IUS survey. Spreadsheet stays private. No secrets belong in GitHub. */
var VERSION = 'ius-27-v1';
var SHEET_NAME = 'Ответы';
var LEVELS = ['Низкая непереносимость неопределённости','Средняя непереносимость неопределённости','Высокая непереносимость неопределённости'];
var SEX_LABELS = {female:'Женский',male:'Мужской',other:'Другой',unspecified:'Предпочитаю не указывать'};
function headers_() {
  return ['Дата получения','ID отправки','Версия','Имя','Возраст','Пол'].concat(Array.from({length:27},function(_,i){return 'Вопрос '+(i+1);})).concat(['Сумма','Уровень','Полный результат','Дата на устройстве','Согласие','Хеш отправки']);
}
/** Run once from editor. Use the returned URL to open the private spreadsheet. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID');
  var book = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create('IUS — ответы участников');
  props.setProperty('SPREADSHEET_ID',book.getId());
  var sheet = book.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = book.insertSheet(SHEET_NAME);
  var headers = headers_();
  if(sheet.getMaxColumns()<headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(),headers.length-sheet.getMaxColumns());
  if(sheet.getLastRow()===0) sheet.getRange(1,1,1,headers.length).setValues([headers]);
  checkHeaders_(sheet);
  sheet.setFrozenRows(1);sheet.setFrozenColumns(4);
  sheet.getRange(1,1,1,headers.length).setBackground('#176c79').setFontColor('#ffffff').setFontWeight('bold').setWrap(true);
  sheet.setRowHeight(1,48);sheet.setColumnWidths(1,headers.length,125);sheet.setColumnWidth(1,170);sheet.setColumnWidth(2,285);sheet.setColumnWidth(4,180);sheet.setColumnWidth(35,300);sheet.setColumnWidth(36,500);sheet.setColumnWidth(39,320);
  sheet.getRange('A2:A').setNumberFormat('dd.mm.yyyy hh:mm:ss');
  if(!sheet.getFilter())sheet.getRange(1,1,sheet.getMaxRows(),headers.length).createFilter();
  SpreadsheetApp.flush(); console.log(book.getUrl());return book.getUrl();
}
function checkHeaders_(sheet) {
  var expected=headers_(), actual=sheet.getRange(1,1,1,expected.length).getValues()[0];
  if(expected.some(function(h,i){return actual[i]!==h;}))throw new Error('Unexpected spreadsheet headers');
}
function validate_(p) {
  if(!p || typeof p!=='object' || Array.isArray(p))throw new Error('payload');
  if(typeof p.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(p.id))throw new Error('id');
  if(p.version!==VERSION || p.consent!==true || p.website)throw new Error('version or consent');
  if(typeof p.name!=='string'||!p.name.trim()||p.name.trim().length>100)throw new Error('name');
  if(!Number.isInteger(p.age)||p.age<1||p.age>120)throw new Error('age');
  if(typeof p.sex!=='string'||!Object.prototype.hasOwnProperty.call(SEX_LABELS,p.sex))throw new Error('sex');
  if(!Array.isArray(p.answers)||p.answers.length!==27||Array.from(p.answers).some(function(x){return !Number.isInteger(x)||x<1||x>5;}))throw new Error('answers');
  if(typeof p.displayText!=='string'||p.displayText.length>20000)throw new Error('text');
  if(typeof p.clientDate!=='string'||p.clientDate.length>40||!Number.isFinite(Date.parse(p.clientDate)))throw new Error('date');
  var total=p.answers.reduce(function(a,b){return a+b;},0);
  return {total:total,bandIndex:total<=62?0:total<=98?1:2};
}
function safeText_(value) {return /^[\s]*[=+@-]/.test(value)?"'"+value:value;}
function json_(value) {return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
function doGet() {return json_({ok:true,service:'ius-survey',version:VERSION});}
function doPost(e) {
  var lock,locked=false;
  try {
    if(!e||!e.parameter||typeof e.parameter.payload!=='string'||e.parameter.payload.length>40000)throw new Error('size');
    var p=JSON.parse(e.parameter.payload), result=validate_(p);
    var props=PropertiesService.getScriptProperties(),id=props.getProperty('SPREADSHEET_ID');
    if(!id)throw new Error('not configured');
    var hash=Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify([p.version,p.name.trim(),p.age,p.sex,p.answers,p.clientDate,p.displayText,p.consent])));
    lock=LockService.getScriptLock();lock.waitLock(20000);locked=true;
    var sheet=SpreadsheetApp.openById(id).getSheetByName(SHEET_NAME);
    if(!sheet)throw new Error('sheet missing');checkHeaders_(sheet);
    var last=sheet.getLastRow();
    var existing=last>1?sheet.getRange(2,2,last-1,1).createTextFinder(p.id).matchEntireCell(true).matchCase(false).findNext():null;
    if(existing) {
      if(sheet.getRange(existing.getRow(),39).getValue()!==hash)throw new Error('id conflict');
    } else {
      var row=[new Date(),p.id,p.version,safeText_(p.name.trim()),p.age,SEX_LABELS[p.sex]].concat(p.answers).concat([result.total,LEVELS[result.bandIndex],safeText_(p.displayText),p.clientDate,true,hash]);
      if(last>=sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),100);
      sheet.getRange(last+1,1,1,row.length).setValues([row]);
      sheet.getRange(last+1,1).setNumberFormat('dd.mm.yyyy hh:mm:ss');
      sheet.getRange(last+1,1,1,row.length).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP).setVerticalAlignment('middle');
      sheet.setRowHeightsForced(last+1,1,30);
      SpreadsheetApp.flush();
    }
    return json_({ok:true,id:p.id,total:result.total,bandIndex:result.bandIndex});
  } catch(error) {
    // Never echo participant data or raw exceptions into the response or logs.
    return json_({ok:false,error:'SAVE_FAILED'});
  } finally {if(locked)lock.releaseLock();}
}
