const assert=require('assert');
const puppeteer=require(process.cwd()+'/node_modules/puppeteer-core');

const VERSION='20260904-estbmac1';
const OP={id:'00000000-0000-4000-8000-000000000001',name:'Test Operator',role:'admin',active:true,version:1};
const VIEWS=[['desktop',1366,768]];
const CORS={
  'access-control-allow-origin':'*',
  'access-control-allow-headers':'apikey,content-type,authorization,x-client-info,prefer',
  'access-control-allow-methods':'POST,OPTIONS,GET'
};
const BARCODE=`window.JsBarcode=(selector,value,options)=>{const el=document.querySelector(selector);if(!el)throw new Error('missing barcode target');el.dataset.code=String(value);el.dataset.label=String(options?.text||'');el.setAttribute('width','320');el.setAttribute('height','90');el.innerHTML='<rect width="320" height="60"></rect>';return el;};`;
const XLSX=`window.XLSX={utils:{book_new(){return{}},json_to_sheet(rows){window.__rows=rows;return{}},book_append_sheet(){}},writeFile(){window.__xlsx=true}};`;

async function intercept(page,{offlineAuth=false}={}){
  const requests=[];
  await page.setRequestInterception(true);
  page.on('request',req=>{
    const u=req.url(); requests.push(u);
    if(u.includes('/rpc/core_list_operators_service')){
      if(req.method()==='OPTIONS')return req.respond({status:204,headers:CORS,body:''});
      if(offlineAuth)return req.respond({status:503,contentType:'application/json',headers:CORS,body:'{"ok":false}'});
      return req.respond({status:200,contentType:'application/json',headers:CORS,body:JSON.stringify({ok:true,bootstrapped:true,operators:[OP]})});
    }
    if(/^https:\/\/cdn\.jsdelivr\.net\/npm\/jsbarcode/.test(u))return req.respond({status:200,contentType:'application/javascript',headers:CORS,body:BARCODE});
    if(/^https:\/\/cdn\.jsdelivr\.net\/npm\/xlsx/.test(u))return req.respond({status:200,contentType:'application/javascript',headers:CORS,body:XLSX});
    if(u.startsWith('https://yvlayxmhcngdqribcmkh.supabase.co/')){
      if(req.method()==='OPTIONS')return req.respond({status:204,headers:CORS,body:''});
      return req.respond({status:offlineAuth?503:400,contentType:'application/json',headers:CORS,body:'{"ok":false}'});
    }
    req.continue();
  });
  return requests;
}
async function input(page,id,value,event='input'){
  await page.$eval(id,(el,p)=>{el.value=p.value;el.dispatchEvent(new Event(p.event,{bubbles:true}));},{value,event});
}

async function runView(browser,name,width,height){
  const page=await browser.newPage();
  await page.setViewport({width,height,deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  page.on('dialog',d=>d.dismiss());
  const requests=await intercept(page);
  await page.evaluateOnNewDocument(()=>{localStorage.removeItem('zebra_pestanas_datos');localStorage.removeItem('zebra_tab_activa_id');localStorage.removeItem('zebra_text_history_v1');sessionStorage.clear();});
  await page.goto(`http://127.0.0.1:4177/?estb=${name}`,{waitUntil:'domcontentloaded',timeout:15000});
  await page.waitForSelector('#pdtAuthOverlay',{visible:true,timeout:5000});
  await page.waitForFunction(()=>window.__PDT_CLOUD_AUTH_READY__===true,{timeout:5000});
  const auth=await page.evaluate(()=>({
    marker:document.documentElement.dataset.estbMacVersion,
    locked:document.querySelector('.app-shell')?.inert===true&&document.querySelector('.app-shell')?.getAttribute('aria-hidden')==='true',
    overlay:document.querySelector('#pdtAuthOverlay')?.inert===false&&getComputedStyle(document.querySelector('#pdtAuthOverlay')).pointerEvents!=='none',
    operators:document.querySelector('#pdtAuthOperator')?.options.length||0,
    aux:!!document.querySelector('#text-aux-id'),
    displayAux:!!document.querySelector('#display-aux-id'),
    printAux:!!document.querySelector('#print-aux-id')
  }));
  assert.deepStrictEqual(auth,{marker:VERSION,locked:true,overlay:true,operators:1,aux:true,displayAux:true,printAux:true});

  await page.evaluate(()=>{document.querySelector('#pdtAuthOverlay')?.remove();const s=document.querySelector('.app-shell');s.inert=false;s.removeAttribute('aria-hidden');});
  assert.strictEqual(await page.$eval('#text-aux-id',el=>el.maxLength),12);

  await input(page,'#text-aux-id','m12345678901');
  let state=await page.evaluate(()=>({v:document.querySelector('#text-aux-id').value,e:document.querySelector('#aux-id-error').textContent,invalid:document.querySelector('#text-aux-id').classList.contains('invalid')}));
  assert.strictEqual(state.v,'M12345678901'); assert.ok(state.e.startsWith('ERROR:')); assert.strictEqual(state.invalid,true);
  await input(page,'#text-aux-id','M12345678901','change');
  state=await page.evaluate(()=>({v:document.querySelector('#text-aux-id').value,e:document.querySelector('#aux-id-error').textContent}));
  assert.strictEqual(state.v,''); assert.ok(state.e.includes('NO iniciar con M.'));

  await input(page,'#text-sn','M12345678901');
  await input(page,'#text-aux-id','');
  await input(page,'#text-ua','0000000000000001');
  await page.waitForFunction(()=>document.querySelectorAll('#history-list .history-item').length===1,{timeout:3000});
  let render=await page.evaluate(()=>({count:document.querySelector('#print-barcode-content').dataset.barcodeCount,hidden:document.querySelector('#print-aux-id').hidden}));
  assert.deepStrictEqual(render,{count:'2',hidden:true});

  await input(page,'#text-sn','M12345678902');
  await input(page,'#text-aux-id','d01234567890');
  await input(page,'#text-ua','0000000000000002');
  await page.waitForFunction(()=>document.querySelectorAll('#history-list .history-item').length===2,{timeout:3000});
  render=await page.evaluate(()=>({count:document.querySelector('#print-barcode-content').dataset.barcodeCount,hidden:document.querySelector('#print-aux-id').hidden,code:document.querySelector('#print-aux-id').dataset.code,text:document.querySelector('#history-list .history-item').textContent}));
  assert.strictEqual(render.count,'3'); assert.strictEqual(render.hidden,false); assert.strictEqual(render.code,'D01234567890'); assert.ok(render.text.includes('eSTB MAC: D01234567890'));

  await input(page,'#text-sn','M12345678903');
  await input(page,'#text-aux-id','D01234567890');
  await input(page,'#text-ua','0000000000000003');
  await new Promise(r=>setTimeout(r,150));
  assert.strictEqual(await page.$$eval('#history-list .history-item',x=>x.length),2);

  await page.evaluate(()=>exportExcel());
  const rows=await page.evaluate(()=>window.__rows);
  assert.ok(rows.length===2&&rows.some(r=>r['eSTB MAC']==='D01234567890'));

  await page.evaluate(()=>{document.querySelector('#text-label-input').value='TEXT HISTORY CHECK';document.querySelector('#text-label-input').dispatchEvent(new Event('input',{bubbles:true}));saveTextHistory(true);});
  assert.ok((await page.evaluate(()=>JSON.parse(localStorage.getItem('zebra_text_history_v1')||'[]').map(x=>x.texto))).includes('TEXT HISTORY CHECK'));

  const margins=await page.evaluate(()=>{printStyle(2.5,1);return{dynamic:document.querySelector('#dynamic-print-style').textContent,staticCss:document.querySelector('#estb-mac-margin-styles').textContent,badge:document.querySelector('.margin-badge').textContent,profile:document.querySelector('#printer-profile-tag').textContent};});
  for(const css of [margins.dynamic,margins.staticCss]){assert.ok(css.includes('2.5mm')&&css.includes('2mm')&&css.includes('3mm'));}
  assert.ok(margins.badge.includes('2.5 mm')); assert.ok(margins.profile.includes('1200 DPI'));
  assert.ok(requests.some(u=>u.includes(`app.js?v=${VERSION}`))&&requests.some(u=>u.includes(`print-fix.js?v=${VERSION}`)));
  assert.ok(!requests.some(u=>u.includes('app.js?v=20260830-stable1'))&&!requests.some(u=>u.includes('print-fix.js?v=20260828-3')));

  const geom=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
  assert.ok(geom.scroll<=geom.width+1,`${name}: overflow ${geom.scroll}/${geom.width}`);
  await page.setOfflineMode(true);
  assert.strictEqual(await Promise.race([page.evaluate(()=>new Promise(r=>setTimeout(()=>r('ok'),100))),new Promise((_,rej)=>setTimeout(()=>rej(new Error(`${name}: event loop blocked`)),2000))]),'ok');
  await page.setOfflineMode(false);
  assert.deepStrictEqual(errors,[],`${name}: ${JSON.stringify(errors)}`);
  console.log(`ESTB_${name.toUpperCase()}_OK optional=yes duplicate=yes margins=2.5mm offline=yes`);
  await page.close();
}

async function runRestoredOffline(browser){
  const page=await browser.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(String(e))); page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.evaluateOnNewDocument(op=>{localStorage.setItem('generadorPDT.cloudOperatorCache.v1',JSON.stringify({version:1,operators:[op]}));sessionStorage.setItem('generadorPDT.cloudOperatorSession.v1',JSON.stringify({operator:op,offline:true,savedAt:new Date().toISOString()}));},OP);
  const requests=await intercept(page,{offlineAuth:true});
  await page.goto('http://127.0.0.1:4177/?estb=restored-offline',{waitUntil:'domcontentloaded',timeout:15000});
  await page.waitForFunction(()=>window.__PDT_CLOUD_AUTH_READY__===true&&window.OperatorSession?.getCurrentOperator()?.id,{timeout:5000});
  const s=await page.evaluate(()=>({op:window.OperatorSession.getCurrentOperator(),overlay:!!document.querySelector('#pdtAuthOverlay'),inert:document.querySelector('.app-shell').inert,hidden:document.querySelector('.app-shell').getAttribute('aria-hidden'),chip:document.querySelector('#pdtOperatorChip')?.textContent||'',marker:document.documentElement.dataset.estbMacVersion}));
  assert.deepStrictEqual(s.op,{id:OP.id,name:OP.name,role:'admin'}); assert.strictEqual(s.overlay,false); assert.strictEqual(s.inert,false); assert.strictEqual(s.hidden,null); assert.ok(s.chip.includes('Test Operator')); assert.strictEqual(s.marker,VERSION);
  assert.ok(requests.some(u=>u.includes(`app.js?v=${VERSION}`))); assert.deepStrictEqual(errors,[]);
  console.log('ESTB_RESTORED_OFFLINE_OK');
  await page.close();
}

(async()=>{
  const browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-setuid-sandbox']});
  for(const [n,w,h] of VIEWS)await runView(browser,n,w,h);
  await runRestoredOffline(browser);
  await browser.close();
  console.log('ESTB_MAC_MARGINS_BROWSER_GATE_OK');
})().catch(e=>{console.error(e);process.exit(1)});
