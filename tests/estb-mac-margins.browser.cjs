const assert = require('assert');
const puppeteer = require(process.cwd() + '/node_modules/puppeteer-core');

const VERSION='20260904-estbmac1';
const operator={id:'00000000-0000-4000-8000-000000000001',name:'Operador Prueba',role:'admin',active:true,version:1};
const viewports=[
  {name:'desktop',width:1366,height:768},
  {name:'tablet',width:768,height:1024},
  {name:'mobile',width:390,height:844}
];
const cors={
  'access-control-allow-origin':'*',
  'access-control-allow-headers':'apikey,content-type,authorization,x-client-info,prefer',
  'access-control-allow-methods':'POST,OPTIONS,GET'
};

const jsBarcodeStub=`
  window.JsBarcode=function(selector,value,options){
    const el=document.querySelector(selector);
    if(!el) throw new Error('Missing barcode target '+selector);
    el.setAttribute('data-code',String(value));
    el.setAttribute('data-label',String(options&&options.text||''));
    el.setAttribute('width','320');
    el.setAttribute('height','90');
    el.innerHTML='<rect width="320" height="60" fill="white"></rect><rect x="10" y="0" width="6" height="55" fill="black"></rect>';
    return el;
  };
`;
const xlsxStub=`
  window.XLSX={
    utils:{
      book_new(){return {};},
      json_to_sheet(rows){window.__xlsxRows=rows;return {};},
      book_append_sheet(){}
    },
    writeFile(){window.__xlsxWrite=true;}
  };
`;

async function dispatchInput(page,id,value,event='input'){
  await page.$eval(id,(el,payload)=>{
    el.value=payload.value;
    el.dispatchEvent(new Event(payload.event,{bubbles:true}));
  },{value,event});
}

async function run(browser,viewport){
  const page=await browser.newPage();
  await page.setViewport({width:viewport.width,height:viewport.height,deviceScaleFactor:1});
  const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  page.on('dialog',d=>d.dismiss());

  await page.setRequestInterception(true);
  page.on('request',request=>{
    const url=request.url();
    requests.push(url);
    if(url.includes('/rpc/core_list_operators_service')){
      if(request.method()==='OPTIONS') return request.respond({status:204,headers:cors,body:''});
      return request.respond({status:200,contentType:'application/json',headers:cors,body:JSON.stringify({ok:true,bootstrapped:true,operators:[operator]})});
    }
    if(/^https:\/\/cdn\.jsdelivr\.net\/npm\/jsbarcode/.test(url)){
      return request.respond({status:200,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body:jsBarcodeStub});
    }
    if(/^https:\/\/cdn\.jsdelivr\.net\/npm\/xlsx/.test(url)){
      return request.respond({status:200,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body:xlsxStub});
    }
    if(url.startsWith('https://yvlayxmhcngdqribcmkh.supabase.co/')){
      if(request.method()==='OPTIONS') return request.respond({status:204,headers:cors,body:''});
      return request.respond({status:400,contentType:'application/json',headers:cors,body:'{"ok":false}'});
    }
    request.continue();
  });

  await page.goto(`http://127.0.0.1:4177/?estb=${viewport.name}`,{waitUntil:'domcontentloaded',timeout:15000});
  await page.waitForSelector('#pdtAuthOverlay',{visible:true,timeout:5000});
  await page.waitForFunction(()=>window.__PDT_CLOUD_AUTH_READY__===true,{timeout:5000});

  const auth=await page.evaluate(()=>({
    marker:document.documentElement.dataset.estbMacVersion,
    shellLocked:document.querySelector('.app-shell')?.getAttribute('aria-hidden')==='true'&&document.querySelector('.app-shell')?.inert===true,
    overlayInteractive:document.querySelector('#pdtAuthOverlay')?.inert===false&&getComputedStyle(document.querySelector('#pdtAuthOverlay')).pointerEvents!=='none',
    auxExists:!!document.querySelector('#text-aux-id'),
    printAuxExists:!!document.querySelector('#print-aux-id'),
    displayAuxExists:!!document.querySelector('#display-aux-id'),
    operatorOptions:document.querySelector('#pdtAuthOperator')?.options.length||0,
    selectedOperator:document.querySelector('#pdtAuthOperator')?.selectedOptions?.[0]?.textContent||''
  }));
  assert.deepStrictEqual(auth,{marker:VERSION,shellLocked:true,overlayInteractive:true,auxExists:true,printAuxExists:true,displayAuxExists:true,operatorOptions:1,selectedOperator:'Operador Prueba · Admin'});

  await page.evaluate(()=>{
    document.querySelector('#pdtAuthOverlay')?.remove();
    const shell=document.querySelector('.app-shell');
    if(shell){shell.inert=false;shell.removeAttribute('aria-hidden');}
    localStorage.removeItem('zebra_pestanas_datos');
  });

  const field=await page.$eval('#text-aux-id',el=>({maxLength:el.maxLength,placeholder:el.placeholder,label:document.querySelector('label[for="text-aux-id"]')?.textContent}));
  assert.strictEqual(field.maxLength,12);
  assert.strictEqual(field.placeholder,'Ej: D01234567890');
  assert.ok(field.label.includes('NO debe empezar con M'));

  await dispatchInput(page,'#text-aux-id','m12345678901');
  let auxState=await page.evaluate(()=>({value:document.querySelector('#text-aux-id').value,error:document.querySelector('#aux-id-error').textContent,invalid:document.querySelector('#text-aux-id').classList.contains('invalid')}));
  assert.deepStrictEqual(auxState,{value:'M12345678901',error:'ERROR: El eSTB MAC NO puede empezar por la letra M.',invalid:true});
  await dispatchInput(page,'#text-aux-id','M12345678901','change');
  auxState=await page.evaluate(()=>({value:document.querySelector('#text-aux-id').value,error:document.querySelector('#aux-id-error').textContent}));
  assert.deepStrictEqual(auxState,{value:'',error:'Dato inválido borrado: debe tener ÚNICAMENTE 12 caracteres y NO iniciar con M.'});

  // eSTB MAC opcional: SN + UA deben guardar sin tercer identificador.
  await dispatchInput(page,'#text-sn','M12345678901');
  await dispatchInput(page,'#text-aux-id','');
  await dispatchInput(page,'#text-ua','0000000000000001');
  await page.waitForFunction(()=>document.querySelectorAll('#history-list .history-item').length===1,{timeout:3000});
  let firstText=await page.$eval('#history-list .history-item',el=>el.textContent);
  assert.ok(firstText.includes('M12345678901'));
  assert.ok(!firstText.includes('eSTB MAC:'));
  let count=await page.$$eval('#history-list .history-item',els=>els.length);
  assert.strictEqual(count,1);

  // Con eSTB MAC válido se guarda, renderiza y restaura como tercer identificador.
  await dispatchInput(page,'#text-sn','M12345678902');
  await dispatchInput(page,'#text-aux-id','d01234567890');
  await dispatchInput(page,'#text-ua','0000000000000002');
  await page.waitForFunction(()=>document.querySelectorAll('#history-list .history-item').length===2,{timeout:3000});
  firstText=await page.$eval('#history-list .history-item',el=>el.textContent);
  assert.ok(firstText.includes('eSTB MAC: D01234567890'));
  const render=await page.evaluate(()=>({
    count:document.querySelector('#print-barcode-content').dataset.barcodeCount,
    displayHidden:document.querySelector('#display-aux-id').hidden,
    printHidden:document.querySelector('#print-aux-id').hidden,
    displayCode:document.querySelector('#display-aux-id').getAttribute('data-code'),
    printCode:document.querySelector('#print-aux-id').getAttribute('data-code')
  }));
  assert.deepStrictEqual(render,{count:'3',displayHidden:false,printHidden:false,displayCode:'D01234567890',printCode:'D01234567890'});

  await page.click('#history-list .history-item');
  const restored=await page.evaluate(()=>({
    sn:document.querySelector('#text-sn').value,
    aux:document.querySelector('#text-aux-id').value,
    ua:document.querySelector('#text-ua').value
  }));
  assert.deepStrictEqual(restored,{sn:'M12345678902',aux:'D01234567890',ua:'000-00000-00000-002'});

  // Duplicado por eSTB MAC debe bloquear un tercer registro.
  await dispatchInput(page,'#text-sn','M12345678903');
  await dispatchInput(page,'#text-aux-id','D01234567890');
  await dispatchInput(page,'#text-ua','0000000000000003');
  await new Promise(r=>setTimeout(r,150));
  count=await page.$$eval('#history-list .history-item',els=>els.length);
  assert.strictEqual(count,2);

  // Excel conserva la nueva columna.
  await page.evaluate(()=>exportExcel());
  const xlsxRows=await page.evaluate(()=>window.__xlsxRows);
  assert.ok(Array.isArray(xlsxRows)&&xlsxRows.length===2);
  assert.ok(Object.prototype.hasOwnProperty.call(xlsxRows[0],'eSTB MAC'));
  assert.ok(xlsxRows.some(r=>r['eSTB MAC']==='D01234567890'));

  // El historial de texto existente sigue operativo.
  await page.evaluate(()=>{
    document.querySelector('#text-label-input').value='PRUEBA DE TEXTO';
    document.querySelector('#text-label-input').dispatchEvent(new Event('input',{bubbles:true}));
    saveTextHistory(true);
  });
  const textHistory=await page.evaluate(()=>JSON.parse(localStorage.getItem('zebra_text_history_v1')||'[]').map(x=>x.texto));
  assert.ok(textHistory.includes('PRUEBA DE TEXTO'));

  // Márgenes estáticos y dinámicos: 2 mm arriba, 2.5 mm laterales, 3 mm abajo.
  const margins=await page.evaluate(()=>{
    printStyle(2.5,1);
    return {
      dynamic:document.querySelector('#dynamic-print-style')?.textContent||'',
      staticCss:document.querySelector('#estb-mac-margin-styles')?.textContent||'',
      badge:document.querySelector('.margin-badge')?.textContent||'',
      note:document.querySelector('.text-print-note')?.textContent||'',
      profile:document.querySelector('#printer-profile-tag')?.textContent||''
    };
  });
  for(const css of [margins.dynamic,margins.staticCss]){
    assert.ok(css.includes('2.5mm'));
    assert.ok(css.includes('2mm'));
    assert.ok(css.includes('3mm'));
  }
  assert.ok(margins.badge.includes('2.5 mm'));
  assert.ok(margins.note.includes('2.5 mm'));
  assert.ok(margins.profile.includes('2.5mm'));
  assert.ok(margins.profile.includes('1200 DPI'));

  // Cache bust: solo los runtimes nuevos de app/print-fix.
  assert.ok(requests.some(u=>u.includes(`app.js?v=${VERSION}`)));
  assert.ok(requests.some(u=>u.includes(`print-fix.js?v=${VERSION}`)));
  assert.ok(!requests.some(u=>u.includes('app.js?v=20260830-stable1')));
  assert.ok(!requests.some(u=>u.includes('print-fix.js?v=20260828-3')));

  const geom=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
  assert.ok(geom.scroll<=geom.width+1,`${viewport.name}: horizontal overflow ${geom.scroll}/${geom.width}`);

  await page.setOfflineMode(true);
  const responsive=await Promise.race([
    page.evaluate(()=>new Promise(resolve=>setTimeout(()=>resolve('ok'),100))),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error(`${viewport.name}: event loop blocked`)),2000))
  ]);
  assert.strictEqual(responsive,'ok');
  assert.strictEqual(await page.$eval('#text-aux-id',el=>el.maxLength),12);
  await page.setOfflineMode(false);

  assert.deepStrictEqual(errors,[],`${viewport.name}: console/page errors ${JSON.stringify(errors)}`);
  console.log(`ESTB_MAC_${viewport.name.toUpperCase()}_OK optional=yes duplicate=yes margins=2.5mm offline=responsive`);
  await page.close();
}

async function runRestoredOfflineSession(browser){
  const page=await browser.newPage();
  await page.setViewport({width:390,height:844,deviceScaleFactor:1});
  const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.evaluateOnNewDocument(op=>{
    localStorage.setItem('generadorPDT.cloudOperatorCache.v1',JSON.stringify({version:1,operators:[op]}));
    sessionStorage.setItem('generadorPDT.cloudOperatorSession.v1',JSON.stringify({operator:op,offline:true,savedAt:new Date().toISOString()}));
  },operator);
  await page.setRequestInterception(true);
  page.on('request',request=>{
    const url=request.url(); requests.push(url);
    if(/^https:\/\/cdn\.jsdelivr\.net\/npm\/jsbarcode/.test(url)){
      return request.respond({status:200,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body:jsBarcodeStub});
    }
    if(/^https:\/\/cdn\.jsdelivr\.net\/npm\/xlsx/.test(url)){
      return request.respond({status:200,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body:xlsxStub});
    }
    if(url.startsWith('https://yvlayxmhcngdqribcmkh.supabase.co/')){
      return request.respond({status:503,contentType:'application/json',headers:cors,body:'{"ok":false}'});
    }
    request.continue();
  });
  await page.goto('http://127.0.0.1:4177/?estb=restored-offline',{waitUntil:'domcontentloaded',timeout:15000});
  await page.waitForFunction(()=>window.__PDT_CLOUD_AUTH_READY__===true&&window.OperatorSession?.getCurrentOperator()?.id,{timeout:5000});
  const state=await page.evaluate(()=>({
    operator:window.OperatorSession.getCurrentOperator(),
    overlay:!!document.querySelector('#pdtAuthOverlay'),
    shellInert:document.querySelector('.app-shell')?.inert===true,
    shellHidden:document.querySelector('.app-shell')?.getAttribute('aria-hidden'),
    chip:document.querySelector('#pdtOperatorChip')?.textContent||'',
    marker:document.documentElement.dataset.estbMacVersion,
    auxMax:document.querySelector('#text-aux-id')?.maxLength
  }));
  assert.deepStrictEqual(state.operator,{id:operator.id,name:operator.name,role:'admin'});
  assert.strictEqual(state.overlay,false);
  assert.strictEqual(state.shellInert,false);
  assert.strictEqual(state.shellHidden,null);
  assert.ok(state.chip.includes('Operador Prueba'));
  assert.strictEqual(state.marker,VERSION);
  assert.strictEqual(state.auxMax,12);
  assert.ok(requests.some(u=>u.includes(`app.js?v=${VERSION}`)));
  assert.ok(requests.some(u=>u.includes(`print-fix.js?v=${VERSION}`)));
  assert.deepStrictEqual(errors,[]);
  console.log('ESTB_MAC_RESTORED_OFFLINE_OK session=restored supabase=unavailable app=responsive');
  await page.close();
}

(async()=>{
  const browser=await puppeteer.launch({
    headless:true,
    executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
    args:['--no-sandbox','--disable-setuid-sandbox']
  });
  for(const viewport of viewports) await run(browser,viewport);
  await runRestoredOfflineSession(browser);
  await browser.close();
  console.log('ESTB_MAC_MARGINS_BROWSER_GATE_OK');
})().catch(e=>{console.error(e);process.exit(1)});
