/**
 * Hizmet ↔ Rapor Şablonu DENETİMİ (read-only).
 * Mevcut atamaları tarar; eksik, geçersiz (olmayan kod) ve şüpheli (isim uyuşmayan) atamaları listeler.
 */
const fs = require('fs');
const path = require('path');
const auth = require('../auth');

function norm(s) {
    let t = (s || '').toLocaleLowerCase('tr')
        .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
        .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
    return t.replace(/[^a-z0-9\s]/g, ' ');
}
const GURULTU = new Set(['muayene','olcum','rapor','raporu','kontrol','kontrolu','periyodik','ve','form','formu','test','cihaz','cihazi','ekipman','ekipmani','projesi','proje']);
function tokens(s) { return norm(s).split(/\s+/).filter(w => w.length >= 2 && !GURULTU.has(w)); }
function ortakSkor(a, b) {
    const ta = tokens(a), tb = tokens(b);
    if (!ta.length || !tb.length) return 0;
    const sb = new Set(tb);
    const ortak = ta.filter(t => sb.has(t)).length;
    return ortak / new Set([...ta, ...tb]).size;
}

async function loadSablonlar() {
    let s = await auth.prisma.raporSablonu.findMany({ where: { isActive: true }, select: { sablonKodu: true, sablonAdi: true } });
    if (s.length === 0) {
        const dir = path.join(__dirname, '..', 'services', 'templateConfigs');
        s = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
            try { const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); return { sablonKodu: c.sablonKodu, sablonAdi: c.sablonAdi }; }
            catch { return null; }
        }).filter(x => x && x.sablonKodu);
    }
    return s;
}

(async () => {
    const sablonlar = await loadSablonlar();
    const sablonMap = {};
    sablonlar.forEach(s => { sablonMap[s.sablonKodu] = s.sablonAdi; });

    const hizmetler = await auth.prisma.hizmet.findMany({
        where: { isActive: true },
        select: { id: true, ad: true, sablonKodlari: true, kategori: { select: { ad: true } } },
        orderBy: { ad: 'asc' }
    });

    const eksik = [];        // şablon atanmamış
    const gecersiz = [];     // atanan kod sistemde yok
    const supheli = [];      // atanmış ama isim benzerliği düşük
    const saglam = [];       // iyi eşleşme

    for (const h of hizmetler) {
        const kodlar = (h.sablonKodlari || '').split(',').map(k => k.trim()).filter(Boolean);
        if (kodlar.length === 0) { eksik.push(h); continue; }

        const yokOlanlar = kodlar.filter(k => !sablonMap[k]);
        if (yokOlanlar.length) { gecersiz.push({ h, kodlar, yokOlanlar }); continue; }

        // En iyi isim benzerliği
        const skorlar = kodlar.map(k => ({ k, ad: sablonMap[k], sk: ortakSkor(h.ad, sablonMap[k]) }));
        const enIyi = Math.max(...skorlar.map(x => x.sk));
        if (enIyi < 0.30) supheli.push({ h, skorlar });
        else saglam.push({ h, skorlar });
    }

    const toplam = hizmetler.length;
    console.log(`\n📊 TOPLAM AKTİF HİZMET: ${toplam} | Şablon sayısı: ${sablonlar.length}`);
    console.log(`   ✅ Sağlam: ${saglam.length}  |  ⚠️ Şüpheli: ${supheli.length}  |  ⛔ Eksik: ${eksik.length}  |  ❌ Geçersiz kod: ${gecersiz.length}`);

    console.log(`\n⛔ EKSİK — şablon atanmamış (${eksik.length}):`);
    eksik.forEach(h => console.log(`   • ${h.ad}  [${h.kategori?.ad || '-'}]`));

    console.log(`\n❌ GEÇERSİZ — atanan kod sistemde yok (${gecersiz.length}):`);
    gecersiz.forEach(x => console.log(`   • ${x.h.ad} → ${x.kodlar.join(',')} (yok: ${x.yokOlanlar.join(',')})`));

    console.log(`\n⚠️ ŞÜPHELİ — atanmış ama isim uyuşmuyor olabilir (${supheli.length}):`);
    supheli.forEach(x => {
        console.log(`   • ${x.h.ad}`);
        x.skorlar.forEach(s => console.log(`        → ${s.k} (${s.sk.toFixed(2)}) ${s.ad}`));
    });

    console.log(`\n✅ SAĞLAM atamalar (${saglam.length}):`);
    saglam.forEach(x => console.log(`   • ${x.h.ad} → ${x.skorlar.map(s => s.k).join(',')}`));

    process.exit(0);
})();
