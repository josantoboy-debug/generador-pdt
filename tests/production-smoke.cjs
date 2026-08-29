const puppeteer=require(process.cwd()+'/node_modules/puppeteer-core');
const assert=require('assert');

async function main(){
  const browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-setuid-sandbox','--autoplay-policy=no-user-gesture-required']});
  const viewports=[{name:'desktop',width:1366,height:768},{name:'tablet',width:1024,height:768},{name:'mobile',width:390,height:844}];
  for(const vp of viewports){
    const page=await browser.newPage();
    await page.setViewport({width:vp.width,height:vp.height});
    await page.evaluateOnNewDocument(()=>{
      window.__spoken=[];
      class U{constructor(text){this.text=String(text||'');this.lang='';this.voice=null;this.rate=1;this.pitch=1;this.volume=1;this.onend=null;this.onerror=null;}}
      const synth={getVoices:()=>[{name:'Mock Panama',lang:'es-PA',default:true}],speak:u=>{window.__spoken.push(u.text);setTimeout(()=>u.onend&&u.onend(),5)},cancel:()=>{},addEventListener:()=>{}};
      Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:U});
      Object.defineProperty(window,'speechSynthesis',{configurable:true,get:()=>synth});
    });
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    await page.goto('http://127.0.0.1:4173/?ci=1',{waitUntil:'domcontentloaded',timeout:20000});
    await page.waitForFunction(()=>window.ProductionCore?.ValidationService,{timeout:10000});
    const state=await page.evaluate(()=>({
      hostOk:ProductionCore.ValidationService.isValidHost('M12345678901'),
      hostBad:ProductionCore.ValidationService.isValidHost('X12345678901'),
      uaOk:ProductionCore.ValidationService.isValidUA('0000123456789012'),
      uaBad:ProductionCore.ValidationService.isValidUA('1234123456789012'),
      zero:ProductionCore.ValidationService.normalizeUA('0000-1234-5678-9012'),
      sizes:[...document.querySelectorAll('#select-size option')].map(x=>x.value),
      textSizes:[...document.querySelectorAll('#text-select-size option')].map(x=>x.value),
      marginText:document.body.textContent.includes('3 mm a la izquierda y 3 mm a la derecha'),
      manifest:!!document.querySelector('link[rel="manifest"]'),
      status:!!document.querySelector('#productionStatus'),
      printArea:!!document.querySelector('#print-area')
    }));
    assert.strictEqual(state.hostOk,true);assert.strictEqual(state.hostBad,false);assert.strictEqual(state.uaOk,true);assert.strictEqual(state.uaBad,false);assert.strictEqual(state.zero,'0000123456789012');
    assert.deepStrictEqual(state.sizes,['2.5x1.0','2.5x2.0','4.0x6.0']);assert.deepStrictEqual(state.textSizes,['2.5x1.0','2.5x2.0','4.0x6.0']);assert.ok(state.marginText&&state.manifest&&state.status&&state.printArea);
    await page.evaluate(()=>document.dispatchEvent(new CustomEvent('operator:login',{detail:{id:'ci',name:'Operador CI',role:'operator'}})));
    await page.keyboard.press('Tab');
    await page.waitForFunction(()=>window.__spoken.some(x=>x.includes('Operador CI')),{timeout:3000});
    const queueId=await page.evaluate(()=>ProductionCore.SyncService.enqueue('audit',{operator_id:'00000000-0000-0000-0000-000000000000',action:'ci',app_name:'generador-pdt',app_version:'1.0.0'}));
    const queued=await page.evaluate(()=>ProductionCore.StorageCache.getAll('syncQueue'));
    assert.ok(queued.some(x=>x.id===queueId));
    await page.evaluate(id=>ProductionCore.StorageCache.delete('syncQueue',id),queueId);
    assert.strictEqual(errors.length,0,`${vp.name}: ${errors.join(' | ')}`);
    console.log('VIEWPORT_OK',vp.name,state);
    await page.close();
  }
  await browser.close();
}
main().catch(e=>{console.error(e);process.exit(1)});
