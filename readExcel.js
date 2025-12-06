const xlsx = require('xlsx');
const fs = require('fs');

// Excel dosyasını oku
const workbook = xlsx.readFile('/home/wsl-kgmkadir/FRM.01 Test ve Ölçüm Talep Teklif Formu-PEMA.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet, {header: 1});

console.log('Excel dosyası okunuyor...\n');

// Hizmetleri saklamak için array
const hizmetler = [];
let currentCategory = '';
let hizmetId = 16; // Mevcut database'de 15 hizmet var

// Her satırı incele
data.forEach((row, index) => {
  if (!row || row.length === 0) return;
  
  // Satırı göster
  console.log(`Satır ${index + 1}: ${row.filter(cell => cell).join(' | ')}`);
  
  // Kategori başlığı mı kontrol et (genelde büyük harfle yazılır)
  if (row[0] && typeof row[0] === 'string' && row[0] === row[0].toUpperCase() && !row[1]) {
    currentCategory = row[0];
    console.log(`\n>>> YENİ KATEGORİ: ${currentCategory}\n`);
  }
  // Hizmet satırı mı kontrol et
  else if (row[0] && row[1] && currentCategory) {
    const hizmet = {
      id: hizmetId++,
      ad: row[0],
      metod: row[1] || '',
      birim: row[2] || 'Adet',
      fiyat: parseFloat(row[3]) || 0
    };
    
    if (!hizmetler[currentCategory]) {
      hizmetler[currentCategory] = [];
    }
    
    hizmetler[currentCategory].push(hizmet);
    console.log(`Hizmet eklendi: ${hizmet.ad}`);
  }
});

// Sonuçları göster
console.log('\n\n=== BULUNAN HİZMETLER ===\n');
Object.keys(hizmetler).forEach(kategori => {
  console.log(`\n${kategori} (${hizmetler[kategori].length} hizmet):`);
  hizmetler[kategori].forEach(h => {
    console.log(`  - ${h.ad} | ${h.metod} | ${h.birim} | ₺${h.fiyat}`);
  });
});

// JSON formatında kaydet
const output = {
  kategoriler: Object.keys(hizmetler).map(kategori => ({
    kategori: kategori,
    items: hizmetler[kategori]
  }))
};

fs.writeFileSync('excel-hizmetler.json', JSON.stringify(output, null, 2));
console.log('\n\nHizmetler excel-hizmetler.json dosyasına kaydedildi.');