const { chromium } = require('playwright'); const V=process.argv[2]; const fs=require('fs');
(async()=>{fs.mkdirSync(V+'/frames',{recursive:true});const b=await chromium.launch();const p=await b.newPage({viewport:{width:1920,height:1080}});
await p.goto('file://'+V+'/launch.html',{waitUntil:'networkidle'});
await p.evaluate(()=>Promise.all(['400','500','600','700','800'].map(w=>document.fonts.load(w+' 80px Manrope')).concat(['500','700'].map(w=>document.fonts.load(w+' 20px "JetBrains Mono"')))));
await p.evaluate(()=>document.fonts.ready);
console.log('fonts', await p.evaluate(()=>[document.fonts.check('800 80px Manrope'),document.fonts.check('700 20px "JetBrains Mono"')]));
const t0=Date.now();
for(let f=0;f<900;f++){await p.evaluate(([t,f])=>render(t,f),[f/30,f]);await p.screenshot({path:`${V}/frames/${String(f).padStart(4,'0')}.jpg`,type:'jpeg',quality:93});if(f%150===0)console.log('frame',f,((Date.now()-t0)/1000).toFixed(0)+'s')}
await b.close();console.log('done',((Date.now()-t0)/1000).toFixed(0)+'s')})();
