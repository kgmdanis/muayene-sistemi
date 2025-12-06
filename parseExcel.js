const xlsx = require('xlsx');
const fs = require('fs');

// Excel dosyasını oku
const workbook = xlsx.readFile('/home/wsl-kgmkadir/FRM.01 Test ve Ölçüm Talep Teklif Formu-PEMA.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Hücre değerlerini direkt oku
const range = xlsx.utils.decode_range(worksheet['!ref']);
console.log(`Excel aralığı: ${worksheet['!ref']}`);

// Kategoriler ve hizmetler için objeler
const kategoriler = {};
let currentCategory = null;
let hizmetId = 16; // Mevcut database'de 15 hizmet var

// Excel'i satır satır oku
for (let row = 0; row <= range.e.r; row++) {
  let rowData = [];
  let hasData = false;
  
  // Her sütunu oku
  for (let col = 0; col <= range.e.c; col++) {
    const cellAddress = xlsx.utils.encode_cell({r: row, c: col});
    const cell = worksheet[cellAddress];
    const value = cell ? (cell.v || '').toString().trim() : '';
    rowData.push(value);
    if (value) hasData = true;
  }
  
  if (!hasData) continue;
  
  // Satırı analiz et
  const firstCell = rowData[0];
  
  // Kategori başlıklarını bul
  if (firstCell && (
    firstCell.includes('İŞ HİJYENİ ÖLÇÜM') ||
    firstCell.includes('ELEKTRİKSEL KONTROLLER') ||
    firstCell.includes('BASINÇLI KAPLAR KONTROLLERİ') ||
    firstCell.includes('KALDIRMA İLETME ARAÇLARI KONTROLLERİ') ||
    firstCell.includes('DİĞER KONTROLLER') ||
    firstCell.includes('MEKANİK TESİSAT KONTROLLERİ')
  )) {
    currentCategory = firstCell.trim();
    kategoriler[currentCategory] = [];
    console.log(`\nKATEGORİ BULUNDU: ${currentCategory}`);
    continue;
  }
  
  // Başlık satırlarını atla
  if (firstCell && (
    firstCell.includes('Ölçüm Paremetresi') || 
    firstCell.includes('Standart') ||
    firstCell === 'TOPLAM' ||
    firstCell.includes('SÖZLEŞME')
  )) {
    continue;
  }
  
  // Hizmet satırı
  if (currentCategory && firstCell && firstCell.length > 2) {
    // Metod genelde 2. sütunda
    const metod = rowData[1] || 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği';
    
    // Birim ve fiyat bilgisini bulmaya çalış
    let birim = 'Adet';
    let fiyat = 0;
    
    // Farklı sütunlarda olabilir
    for (let i = 2; i < rowData.length; i++) {
      if (rowData[i]) {
        if (rowData[i] === 'Nokta' || rowData[i] === 'Adet') {
          birim = rowData[i];
        } else if (!isNaN(parseFloat(rowData[i])) && parseFloat(rowData[i]) > 10) {
          // 10'dan büyük sayıları fiyat olarak kabul et
          fiyat = parseFloat(rowData[i]);
        }
      }
    }
    
    const hizmet = {
      id: hizmetId++,
      ad: firstCell,
      metod: metod,
      birim: birim,
      fiyat: fiyat
    };
    
    kategoriler[currentCategory].push(hizmet);
    console.log(`  Hizmet: ${hizmet.ad} (${hizmet.birim}, ₺${hizmet.fiyat})`);
  }
}

// Mevcut database'i oku
const db = JSON.parse(fs.readFileSync('database.json', 'utf8'));

// Yeni hizmet kategorilerini hazırla
const yeniHizmetler = [];

Object.keys(kategoriler).forEach(kategoriAdi => {
  if (kategoriler[kategoriAdi].length > 0) {
    yeniHizmetler.push({
      kategori: kategoriAdi,
      items: kategoriler[kategoriAdi]
    });
  }
});

// Database'i güncelle
db.hizmetler = yeniHizmetler;

// Dosyayı kaydet
fs.writeFileSync('database.json', JSON.stringify(db, null, 2));

console.log('\n\n=== ÖZET ===');
console.log(`Toplam ${Object.keys(kategoriler).length} kategori bulundu`);
Object.keys(kategoriler).forEach(kat => {
  console.log(`- ${kat}: ${kategoriler[kat].length} hizmet`);
});

console.log('\nDatabase güncellendi!');