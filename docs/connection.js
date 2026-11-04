(() => {
  const button = document.getElementById('test-connection');
  const status = document.getElementById('test-status');
  button.addEventListener('click', async () => {
    button.disabled = true;
    const payload = {id:crypto.randomUUID(),version:'ius-27-v1',clientDate:new Date().toISOString(),name:'ТЕСТ ПОДКЛЮЧЕНИЯ',age:30,sex:'unspecified',consent:true,website:'',answers:Array(27).fill(3),displayText:'Техническая проверка. Вымышленные данные. 27 ответов по 3 балла, сумма 81, средний диапазон. Повторная отправка с тем же ID не должна создать вторую строку.'};
    status.textContent = 'Отправляем тестовую анкету…\nID: ' + payload.id;
    try {
      for (let attempt=1; attempt<=2; attempt++) {
        const body = new FormData(); body.append('payload', JSON.stringify(payload));
        const response = await fetch(window.SURVEY_CONFIG.endpoint, {method:'POST',body,credentials:'omit',redirect:'follow',signal:AbortSignal.timeout(30000)});
        if (!response.ok) throw new Error('HTTP ' + response.status + ', ' + response.url + '\n' + (await response.text()).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').slice(0,1200));
        const receipt = await response.json();
        if(receipt.ok!==true || receipt.id!==payload.id || receipt.total!==81 || receipt.bandIndex!==1) throw new Error('Сервер не подтвердил ожидаемый результат.');
        status.textContent += '\nПопытка '+attempt+': сервер подтвердил запись, 81 из 135, средний диапазон.';
      }
      status.textContent += '\nОтправка и повтор работают. Проверьте: в таблице одна строка с указанным ID.';
    } catch (error) {status.textContent += '\nНе удалось подтвердить отправку: '+error.message+'. Запись могла состояться — проверьте таблицу по ID.';}
    finally {button.disabled=false;}
  });
})();

