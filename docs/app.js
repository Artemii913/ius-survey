(() => {
  'use strict';
  const cfg = window.SURVEY_CONFIG;
  const $ = id => document.getElementById(id);
  const form = $('survey');
  $('result-disclaimer').textContent = cfg.disclaimer;
  const sexLabels = {female:'Женщина',male:'Мужчина'};
  let snapshot = null, busy = false, sent = false;
  $('owner').textContent = 'Организатор: ' + cfg.owner;
  $('contact').textContent = cfg.contact ? 'По вопросам обработки и удаления ответов: ' + cfg.contact : '';
  const ready = Array.isArray(cfg.questions) && cfg.questions.length === 27 && cfg.questions.every(q => typeof q === 'string' && q.trim()) && cfg.options.length === 5 && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(cfg.endpoint);
  if (!ready) { $('unavailable').hidden = false; return; }
  form.hidden = false;
  cfg.questions.forEach((text,i) => {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'question'; fieldset.id = 'question-' + i;
    const legend = document.createElement('legend');
    const num = document.createElement('span'); num.textContent = String(i+1).padStart(2,'0');
    legend.append(num,document.createTextNode(text)); fieldset.append(legend);
    const choices = document.createElement('div'); choices.className = 'choices';
    cfg.options.forEach((label,j) => {
      const choice = document.createElement('label'); choice.className = 'choice';
      const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'q'+i; radio.value = j+1;
      const caption = document.createElement('span'); caption.textContent = label;
      choice.append(radio,caption); choices.append(choice);
    });
    fieldset.append(choices); $('questions').append(fieldset);
  });
  form.addEventListener('change', event => {
    if (event.target.type !== 'radio') return;
    const field = event.target.closest('fieldset'); field.classList.remove('missed');
    field.querySelector('.missed-message')?.remove();
    const n = form.querySelectorAll('input[type=radio]:checked').length;
    $('progress').value = n; $('progress-text').textContent = `Отвечено ${n} из 27`;
  });
  function fullText(data) {
    const lines = [cfg.title, 'Дата: '+new Date(data.clientDate).toLocaleString('ru-RU'), 'Имя: '+data.name, 'Возраст: '+data.age, 'Пол: '+sexLabels[data.sex], `Результат: ${data.result.total} из 135`, data.band.level, data.band.text, '', 'Ответы:'];
    cfg.questions.forEach((q,i) => lines.push(`${i+1}. ${q} — ${cfg.options[data.answers[i]-1]} (${data.answers[i]})`));
    lines.push('', cfg.disclaimer);
    return lines.join('\n');
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (busy || snapshot) return;
    if (!form.reportValidity()) return;
    $('form-message').textContent = '';
    const values = new FormData(form), answers = [], missed = [];
    cfg.questions.forEach((_,i) => {
      const answer = values.get('q'+i), field = $('question-'+i);
      field.classList.toggle('missed',!answer);
      if (!answer) {
        missed.push(field);
        if (!field.querySelector('.missed-message')) {
          const p = document.createElement('p'); p.className = 'missed-message'; p.textContent = 'Выберите один вариант ответа.'; field.querySelector('.choices').before(p);
        }
      } else answers.push(Number(answer));
    });
    if (missed.length) {
      $('form-message').textContent = `Осталось ответить на ${missed.length} из 27 утверждений.`;
      missed[0].scrollIntoView({block:'center'}); missed[0].querySelector('input').focus({preventScroll:true}); return;
    }
    const name = String(values.get('participantName')).trim();
    if (!name) { $('form-message').textContent = 'Укажите имя.'; form.elements.participantName.focus(); return; }
    const result = window.SurveyScoring.score(answers);
    snapshot = {id:crypto.randomUUID(),version:cfg.version,clientDate:new Date().toISOString(),name,age:Number(values.get('age')),sex:String(values.get('sex')),consent:true,website:String(values.get('website')||''),answers,result,band:cfg.bands[result.bandIndex]};
    snapshot.displayText = fullText(snapshot);
    $('score').textContent = result.total;
    $('result-title').textContent = snapshot.band.level;
    $('interpretation').textContent = snapshot.band.text;
    $('segments').replaceChildren(...Array.from({length:42},(_,i) => {const el = document.createElement('span');if(i<Math.round(42*result.total/135))el.className='on';return el;}));
    form.inert = true; $('result').hidden = false; $('result').focus();
    send();
  });
  async function send() {
    if (busy || sent || !snapshot) return;
    busy = true; $('again').disabled = true; $('retry').hidden = true;
    const status = $('delivery-status'); status.parentElement.classList.remove('error'); status.textContent = 'Сохраняем ответы…';
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(),30000);
    try {
      const payload = {id:snapshot.id,version:snapshot.version,clientDate:snapshot.clientDate,name:snapshot.name,age:snapshot.age,sex:snapshot.sex,consent:snapshot.consent,website:snapshot.website,answers:snapshot.answers,displayText:snapshot.displayText};
      const body = new FormData(); body.append('payload',JSON.stringify(payload));
      const response = await fetch(cfg.endpoint,{method:'POST',body,redirect:'follow',credentials:'omit',signal:controller.signal});
      if (!response.ok) throw new Error('HTTP '+response.status);
      const receipt = await response.json();
      if (receipt.ok !== true || receipt.id !== snapshot.id || receipt.total !== snapshot.result.total || receipt.bandIndex !== snapshot.result.bandIndex) throw new Error('Invalid receipt');
      sent = true; status.textContent = 'Ответы сохранены. Организатор получил вашу анкету.';
    } catch (_) {
      status.parentElement.classList.add('error');
      status.textContent = 'Не удалось подтвердить сохранение. Ваш результат рассчитан. Повторите отправку или сохраните ответы файлом.';
      $('retry').hidden = false;
    } finally {clearTimeout(timeout); busy=false; $('again').disabled=false;}
  }
  $('retry').addEventListener('click',send);
  $('copy').addEventListener('click',async () => {
    try {await navigator.clipboard.writeText(snapshot.displayText);$('copy').textContent='Скопировано';}
    catch (_) {$('copy').textContent='Не удалось скопировать — сохраните файл';}
  });
  $('download').addEventListener('click',() => {
    const blob = new Blob([snapshot.displayText],{type:'text/plain;charset=utf-8'});const url = URL.createObjectURL(blob);
    const link = document.createElement('a');link.href=url;link.download='ius-result-'+snapshot.id+'.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('again').addEventListener('click',() => {
    if(busy)return; snapshot=null;sent=false;form.inert=false;form.reset();$('result').hidden=true;$('progress').value=0;$('progress-text').textContent='Отвечено 0 из 27';$('form-message').textContent='';$('copy').textContent='Скопировать результат';form.elements.participantName.focus();
  });
})();
