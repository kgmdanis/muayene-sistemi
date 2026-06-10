/**
 * Hizmet -> Rapor Şablonu otomatik ön-eşleştirme (item 9).
 * Hizmet adını şablon adıyla normalize edip eşleştirir, Hizmet.sablonKodlari'nı doldurur.
 *
 * Kullanım:
 *   node scripts/hizmet-sablon-eslestir.js          # dry-run (sadece raporlar, yazmaz)
 *   node scripts/hizmet-sablon-eslestir.js --apply  # eşleşmeleri DB'ye yazar
 *
 * Not: SADECE sablonKodlari boş olan hizmetlere dokunur. Belirsiz/eşleşmeyenler raporlanır,
 * hizmet düzenleme ekranından manuel atanabilir.
 */
const fs = require('fs');
const path = require('path');
const auth = require('../auth');

const APPLY = process.argv.includes('--apply');

// Türkçe karakterleri sadeleştir + gürültü kelimelerini at
function norm(s) {
    let t = (s || '').toLocaleLowerCase('tr')
        .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
        .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
    t = t.replace(/[^a-z0-9\s]/g, ' ');
    return t;
}
const GURULTU = new Set([
    'muayene', 'olcum', 'rapor', 'raporu', 'kontrol', 'kontrolu', 'periyodik',
    've', 'form', 'formu', 'test', 'cihaz', 'cihazi', 'ekipman', 'ekipmani'
]);
function tokens(s) {
    return norm(s).split(/\s+/).filter(w => w.length >= 2 && !GURULTU.has(w));
}

async function loadSablonlar() {
    let sablonlar = await auth.prisma.raporSablonu.findMany({
        where: { isActive: true },
        select: { sablonKodu: true, sablonAdi: true }
    });
    if (sablonlar.length === 0) {
        const dir = path.join(__dirname, '..', 'services', 'templateConfigs');
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
        sablonlar = files.map(f => {
            try {
                const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
                return { sablonKodu: c.sablonKodu, sablonAdi: c.sablonAdi };
            } catch { return null; }
        }).filter(s => s && s.sablonKodu && s.sablonAdi);
    }
    return sablonlar;
}

function skor(hTokens, sTokens) {
    if (!hTokens.length || !sTokens.length) return 0;
    const sSet = new Set(sTokens);
    const ortak = hTokens.filter(t => sSet.has(t)).length;
    // Jaccard benzeri: ortak / (benzersiz birleşim)
    const birlesim = new Set([...hTokens, ...sTokens]).size;
    return ortak / birlesim + ortak * 0.01; // ortak sayısı küçük tie-breaker
}

(async () => {
    const sablonlar = await loadSablonlar();
    const sablonTok = sablonlar.map(s => ({ ...s, tok: tokens(s.sablonAdi) }));

    const hizmetler = await auth.prisma.hizmet.findMany({
        select: { id: true, ad: true, sablonKodlari: true }
    });

    const eslesenler = [];
    const belirsizler = [];
    const eslesmeyenler = [];

    for (const h of hizmetler) {
        if (h.sablonKodlari && h.sablonKodlari.trim()) continue; // zaten atanmış
        const hTok = tokens(h.ad);
        if (!hTok.length) { eslesmeyenler.push(h); continue; }

        const skorlu = sablonTok
            .map(s => ({ s, sk: skor(hTok, s.tok) }))
            .filter(x => x.sk > 0)
            .sort((a, b) => b.sk - a.sk);

        if (!skorlu.length) { eslesmeyenler.push(h); continue; }

        const en = skorlu[0];
        const ikinci = skorlu[1];

        // Güçlü ve net eşleşme: skor yeterli ve runner-up'tan belirgin farklı
        const net = en.sk >= 0.34 && (!ikinci || en.sk - ikinci.sk >= 0.08);
        if (net) {
            eslesenler.push({ h, kod: en.s.sablonKodu, ad: en.s.sablonAdi, sk: en.sk.toFixed(2) });
        } else {
            belirsizler.push({
                h,
                adaylar: skorlu.slice(0, 3).map(x => `${x.s.sablonKodu}(${x.sk.toFixed(2)}) ${x.s.sablonAdi}`)
            });
        }
    }

    console.log(`\n=== EŞLEŞENLER (${eslesenler.length}) ===`);
    eslesenler.forEach(e => console.log(`  ✅ [${e.sk}] ${e.h.ad}  →  ${e.kod} (${e.ad})`));

    console.log(`\n=== BELİRSİZ - manuel atama gerek (${belirsizler.length}) ===`);
    belirsizler.forEach(b => {
        console.log(`  ❓ ${b.h.ad}`);
        b.adaylar.forEach(a => console.log(`        - ${a}`));
    });

    console.log(`\n=== EŞLEŞMEYEN (${eslesmeyenler.length}) ===`);
    eslesmeyenler.forEach(h => console.log(`  ⛔ ${h.ad}`));

    if (APPLY) {
        for (const e of eslesenler) {
            await auth.prisma.hizmet.update({
                where: { id: e.h.id },
                data: { sablonKodlari: e.kod }
            });
        }
        console.log(`\n💾 ${eslesenler.length} hizmete sablonKodlari yazıldı.`);
    } else {
        console.log(`\n(DRY-RUN) Yazmak için: node scripts/hizmet-sablon-eslestir.js --apply`);
    }
    process.exit(0);
})();
