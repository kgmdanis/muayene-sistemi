const fs = require('fs');
const path = require('path');

// Database dosyasını oku
const dbPath = path.join(__dirname, 'database.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

// Şablon klasörü
const sablonKlasoru = '/mnt/c/Users/kadir/Desktop/1- MUAYENE ÖLÇÜM RAPORLARI';

// Kategori eşleştirmeleri
const kategoriMap = {
  '1. Kaldırma İletme': 'Kaldırma ve İletme',
  '2. Basınçlı Kaplar': 'Basınçlı Kaplar',
  '3. İş Makinesi': 'İş Makinesi',
  '4. Elektrik': 'Elektrik',
  '5. Tesisat Kontrolü': 'Tesisat Kontrolü',
  '6- Makine Tezgahlar': 'Makine Tezgahları',
  '7. Endüstriyel Raf ve Kapılar': 'Endüstriyel Raf ve Kapılar'
};

// Dosya adından şablon adını temizle
function temizleSablonAdi(dosyaAdi) {
  return dosyaAdi
    .replace(/\.(docx?|pdf)$/i, '') // Uzantıyı kaldır
    .replace(/^FR\d+\.\d+\s+/, '') // Form numaralarını kaldır (FR7.2.36 gibi)
    .replace(/\s+-\s*\d*$/, '') // Sondaki tire ve sayıları kaldır
    .replace(/\s+-\s*Kopya.*$/i, '') // "Kopya" ifadelerini kaldır
    .replace(/\s+/g, ' ') // Çoklu boşlukları tek boşluğa indir
    .replace(/^\.\s*/, '') // Başlangıçtaki nokta ve boşlukları kaldır
    .trim();
}

// Kategori bazında örnek teknik ve test alanları
const kategoriOzellikler = {
  'Kaldırma ve İletme': {
    teknikAlanlar: ['Kapasite', 'Yükseklik', 'Motor Gücü', 'Kanca Tipi', 'Seri No'],
    testAlanlar: ['Yük Testi', 'Emniyet Tertibatı Kontrolü', 'Tel Kontrolü', 'Elektrik Kontrolü']
  },
  'Basınçlı Kaplar': {
    teknikAlanlar: ['Kapasite', 'Basınç Değeri', 'İmalat Yılı', 'Seri No', 'İmal Eden'],
    testAlanlar: ['Hidrostatik Basınç Testi', 'Emniyet Valfi Kontrolü', 'Manometre Kontrolü']
  },
  'İş Makinesi': {
    teknikAlanlar: ['Marka/Model', 'Motor Gücü', 'Kapasite', 'Seri No', 'İmalat Yılı'],
    testAlanlar: ['Fren Sistemi', 'Hidrolik Sistem', 'Emniyet Sistemleri', 'Görsel Kontrol']
  },
  'Elektrik': {
    teknikAlanlar: ['Güç', 'Gerilim', 'Topraklama Değeri', 'Kesit'],
    testAlanlar: ['Topraklama Ölçümü', 'İzolasyon Testi', 'Kaçak Akım Testi', 'Paratoner Testi']
  },
  'Tesisat Kontrolü': {
    teknikAlanlar: ['Tesisat Tipi', 'Kapasite', 'Basınç', 'Malzeme'],
    testAlanlar: ['Sızdırmazlık Kontrolü', 'Basınç Testi', 'Vana Kontrolü', 'Boru Muayenesi']
  },
  'Makine Tezgahları': {
    teknikAlanlar: ['Marka/Model', 'Güç', 'Kapasite', 'Seri No', 'İmalat Yılı'],
    testAlanlar: ['Emniyet Tertibatları', 'Koruyucu Donanım', 'Elektrik Kontrolü', 'Mekanik Kontrol']
  },
  'Endüstriyel Raf ve Kapılar': {
    teknikAlanlar: ['Kapasite', 'Yükseklik', 'Genişlik', 'Malzeme'],
    testAlanlar: ['Stabilite Kontrolü', 'Bağlantı Elemanları', 'Yük Testi', 'Korozyon Kontrolü']
  }
};

// Recursive dosya arama fonksiyonu
function dosyalariBul(dizin) {
  let sonuclar = [];
  const icerik = fs.readdirSync(dizin);

  icerik.forEach(item => {
    const tamYol = path.join(dizin, item);
    const stat = fs.statSync(tamYol);

    if (stat.isDirectory()) {
      // Alt klasöre in
      sonuclar = sonuclar.concat(dosyalariBul(tamYol));
    } else if (item.match(/\.docx?$/i) && !item.startsWith('._') && !item.startsWith('~$')) {
      sonuclar.push(tamYol);
    }
  });

  return sonuclar;
}

console.log('🔍 Şablon dosyaları taranıyor...\n');

let toplamSablon = 0;
const yeniSablonlar = [];

// Her kategoriyi tara
Object.keys(kategoriMap).forEach(klasorAdi => {
  const kategori = kategoriMap[klasorAdi];
  const klasorYolu = path.join(sablonKlasoru, klasorAdi);

  if (!fs.existsSync(klasorYolu)) {
    console.log(`⚠️  Klasör bulunamadı: ${klasorAdi}`);
    return;
  }

  // Klasördeki tüm dosyaları recursive oku
  const dosyalar = dosyalariBul(klasorYolu);

  console.log(`📁 ${kategori}: ${dosyalar.length} şablon bulundu`);

  dosyalar.forEach(dosyaYolu => {
    const dosya = path.basename(dosyaYolu);
    const sablonAdi = temizleSablonAdi(dosya);

    // Boş veya çok kısa adları atla
    if (!sablonAdi || sablonAdi.length < 5) return;

    const sablon = {
      id: Date.now() + toplamSablon,
      ad: sablonAdi,
      kategori: kategori,
      aciklama: `${kategori} kategorisine ait muayene ve ölçüm raporu`,
      teknikAlanlar: kategoriOzellikler[kategori]?.teknikAlanlar || [],
      testAlanlar: kategoriOzellikler[kategori]?.testAlanlar || [],
      aktif: true,
      dosyaYolu: dosyaYolu.replace(sablonKlasoru + '/', ''),
      olusturmaTarihi: new Date().toISOString(),
      guncellemeTarihi: new Date().toISOString()
    };

    yeniSablonlar.push(sablon);
    toplamSablon++;
  });
});

console.log(`\n✅ Toplam ${toplamSablon} şablon hazırlandı\n`);

// Database'e ekle
if (!db.sertifikaSablonlari) {
  db.sertifikaSablonlari = [];
}

// Mevcut şablonları temizle (isteğe bağlı)
console.log('📝 Önceki şablonlar: ' + db.sertifikaSablonlari.length);
db.sertifikaSablonlari = yeniSablonlar;

// Database'e kaydet
fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');

console.log('✅ Database güncellendi!');
console.log(`📊 Yeni şablon sayısı: ${db.sertifikaSablonlari.length}\n`);

// Özet
console.log('📋 Kategori Özeti:');
const kategoriler = {};
db.sertifikaSablonlari.forEach(s => {
  kategoriler[s.kategori] = (kategoriler[s.kategori] || 0) + 1;
});
Object.entries(kategoriler).forEach(([kat, adet]) => {
  console.log(`   ${kat}: ${adet} şablon`);
});

console.log('\n🎉 İşlem tamamlandı!');
