/**
 * Eksik hizmetlere aday şablon önerisi + şüpheli atamaları gösterir (read-only).
 */
const fs = require('fs');
const path = require('path');
const auth = require('../auth');

function norm(s){let t=(s||'').toLocaleLowerCase('tr').replace(/ı/g,'i').replace(/ş/g,'s').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ö/g,'o').replace(/ç/g,'c');return t.replace(/[^a-z0-9\s]/g,' ');}
const G=new Set(['muayene','olcum','rapor','raporu','kontrol','kontrolu','periyodik','ve','form','formu','test','cihaz','cihazi','ekipman','ekipmani','projesi','proje','maruziyet','olcumu']);
function tok(s){return norm(s).split(/\s+/).filter(w=>w.length>=2&&!G.has(w));}
function skor(a,b){const ta=tok(a),tb=tok(b);if(!ta.length||!tb.length)return 0;const sb=new Set(tb);const o=ta.filter(t=>sb.has(t)).length;return o/new Set([...ta,...tb]).size;}

async function loadSablonlar(){
  let s=await auth.prisma.raporSablonu.findMany({where:{isActive:true},select:{sablonKodu:true,sablonAdi:true}});
  if(!s.length){const dir=path.join(__dirname,'..','services','templateConfigs');s=fs.readdirSync(dir).filter(f=>f.endsWith('.json')).map(f=>{try{const c=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));return{sablonKodu:c.sablonKodu,sablonAdi:c.sablonAdi};}catch{return null;}}).filter(x=>x&&x.sablonKodu);}
  return s;
}

(async()=>{
  const sablonlar=await loadSablonlar();
  const hizmetler=await auth.prisma.hizmet.findMany({where:{isActive:true},select:{ad:true,sablonKodlari:true},orderBy:{ad:'asc'}});
  const eksik=hizmetler.filter(h=>!(h.sablonKodlari||'').trim());

  console.log(`\n=== EKSİK HİZMETLER İÇİN ÖNERİLER (${eksik.length}) ===`);
  eksik.forEach(h=>{
    const adaylar=sablonlar.map(s=>({s,sk:skor(h.ad,s.sablonAdi)})).filter(x=>x.sk>0.12).sort((a,b)=>b.sk-a.sk).slice(0,3);
    console.log(`\n• ${h.ad}`);
    if(!adaylar.length){console.log('     (uygun şablon adayı bulunamadı — muhtemelen sistemde şablonu yok)');}
    else adaylar.forEach(a=>console.log(`     → ${a.s.sablonKodu} (${a.sk.toFixed(2)}) ${a.s.sablonAdi}`));
  });
  process.exit(0);
})();
