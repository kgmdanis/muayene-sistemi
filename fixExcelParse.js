const xlsx = require('xlsx');
const fs = require('fs');

// Excel dosyasını oku
const workbook = xlsx.readFile('/home/wsl-kgmkadir/FRM.01 Test ve Ölçüm Talep Teklif Formu-PEMA.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Mevcut database'i oku
const db = JSON.parse(fs.readFileSync('database.json', 'utf8'));

// Excel'den metodları ve fiyatları al
const excelMetodlar = {
  // İŞ HİJYENİ ÖLÇÜM
  'İç Ortam Toz  Ölçümü': {
    metod: 'MDHS 14/3 - Grav. metod ile toplam toz tayini',
    fiyat: 500
  },
  'Kişisel Maruziyet Toz Ölçümü': {
    metod: 'MDHS 14/3 - Grav. metod ile toplam toz tayini',
    fiyat: 600
  },
  'İç Ortam Aydınlatma Ölçümü': {
    metod: 'COHSR-928-1-IPG-039 - İş Yerindeki Aydınlatma/Işık Şiddeti Düzeyinin Ölçümü',
    fiyat: 400
  },
  'Termal Konfor  Ölçümü': {
    metod: 'TS EN ISO 7730, TS EN ISO 7243',
    fiyat: 550
  },
  'İç Ortam Gürültü Ölçümü': {
    metod: 'TS ISO 1996-2 - Ses Basınç Seviyelerinin Tayini',
    fiyat: 450
  },
  'Kişisel Maruziyet Gürültü': {
    metod: 'TS EN ISO 9612',
    fiyat: 650
  },
  'Ortamda Toksik Gaz ve Buhar Tayini': {
    metod: 'ASTM 4490-96 - Örnekleme ve Ölçüm: Dedektör Tüple Anlık Ölçüm',
    fiyat: 500
  },
  'El-Kol Titreşim Maruziyet Ölçümü': {
    metod: 'TS EN ISO 5349-1, TS EN ISO 5349-2',
    fiyat: 700
  },
  'Tüm Vücut Titreşim Maruziyet Ölçümü': {
    metod: 'TS ISO 2631-1 (TS EN 1032+A1 ile birlikte)',
    fiyat: 700
  },
  
  // ELEKTRİKSEL KONTROLLER
  'Elektrik Topraklama,Cihaz Gövde Topaklama Ölçümü': {
    metod: 'Elektrik Tesislerinde Topraklamalar Yönetmeliği, TS EN 61557-1',
    fiyat: 2500
  },
  'Elektrik İç Tesisat Kontrolü': {
    metod: 'Elektrik İç Tesisleri Yönetmeliği',
    fiyat: 2500
  },
  'Yangın Algılama ve Alarm Sistemi': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 1500
  },
  'Jeneratör  Kontrolü': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 750
  },
  'Paratoner Kontrolü': {
    metod: 'TS EN 62305-1',
    fiyat: 750
  },
  
  // BASINÇLI KAPLAR
  'Buhar Kazanı': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 600
  },
  'Kalorifer Kazanı': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 525
  },
  'Chiller Tankı': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 500
  },
  'Kızgın Su Kazanı': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 600
  },
  'Kompresör ve Hava Tankı': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 400
  },
  'Hidrofor Tankı': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 400
  },
  'Genleşme Tankı': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 400
  },
  'Basınçlı Kap': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 400
  },
  
  // KALDIRMA İLETME ARAÇLARI
  'Gezer Köprülü Vinç': {
    metod: 'TS ISO 11662-1, TS ISO 8566-5, TS EN 818-6+A1',
    fiyat: 1000
  },
  'Portal Vinç': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 1000
  },
  'Monoray Vinç': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 800
  },
  'Pergel Vinç': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 800
  },
  'Gırgır Vinç': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 700
  },
  'Kule Vinç': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 1500
  },
  'Mobil Vinç': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 1200
  },
  'Caraskal': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 600
  },
  'Forklift': {
    metod: 'TS EN ISO 3691-5',
    fiyat: 750
  },
  'Transpalet': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 500
  },
  'Araç Kaldırma Lifti': {
    metod: 'TS EN 1493',
    fiyat: 800
  },
  'Manlift': {
    metod: 'TS EN 280+A1',
    fiyat: 900
  },
  'Yük Asansörü': {
    metod: 'TS EN 81-3+A1',
    fiyat: 1000
  },
  'Konveyör Bant': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 800
  },
  
  // DİĞER KONTROLLER
  'İş Makinesi': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 750
  },
  'Makine Tezgah': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 600
  },
  'Yangın Tüpü': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 60
  },
  'Skreyper': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 500
  },
  'Endüstriyel Kapı': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 400
  },
  'Endüstriyel Raf': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 350
  },
  
  // MEKANİK TESİSAT
  'Yangın Tesisatı': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 3000
  },
  'Havalandırma Tesisatı': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 2500
  },
  'Otomatik Yangın Söndürme Sist.': {
    metod: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği',
    fiyat: 3500
  }
};

// Database'deki hizmetleri güncelle
db.hizmetler.forEach(kategori => {
  kategori.items.forEach(hizmet => {
    // FİRMA ONAYI gibi gereksiz kayıtları sil
    if (hizmet.ad.includes('FİRMA ONAYI')) {
      kategori.items = kategori.items.filter(h => h.id !== hizmet.id);
      return;
    }
    
    // Excel'den metot ve fiyat bilgisini al
    const excelBilgi = excelMetodlar[hizmet.ad];
    if (excelBilgi) {
      hizmet.metod = excelBilgi.metod;
      hizmet.fiyat = excelBilgi.fiyat;
    }
  });
});

// Boş kategorileri temizle
db.hizmetler = db.hizmetler.filter(kat => kat.items.length > 0);

// Dosyayı kaydet
fs.writeFileSync('database.json', JSON.stringify(db, null, 2));

console.log('Database güncellendi!');
console.log('\nÖzet:');
db.hizmetler.forEach(kat => {
  console.log(`\n${kat.kategori}:`);
  kat.items.forEach(h => {
    console.log(`  - ${h.ad}: ₺${h.fiyat}`);
  });
});