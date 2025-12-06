const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const PDFDocument = require('pdfkit');
const emailService = require('./emailService');
const auth = require('./auth-prisma');
const { generatePDF } = require('./pdfGenerator2');
const { generateSertifikaPDF } = require('./sertifikaPdfGenerator');

const app = express();
const PORT = 3001;
const DB_PATH = path.join(__dirname, 'database.json');

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Helper Functions
const readDB = () => {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Database okuma hatası:', error);
    return null;
  }
};

const writeDB = (data) => {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Database yazma hatası:', error);
    return false;
  }
};

const generateId = (items) => {
  if (!items || items.length === 0) return 1;
  const maxId = Math.max(...items.map(item => item.id || 0));
  return maxId + 1;
};

const generateSertifikaNo = (db) => {
  const year = new Date().getFullYear();
  if (!db.ayarlar) db.ayarlar = {};
  if (!db.ayarlar.sertifikaCounter) db.ayarlar.sertifikaCounter = 1;

  const counter = db.ayarlar.sertifikaCounter;
  const sertifikaNo = `SERT-${year}-${String(counter).padStart(4, '0')}`;

  db.ayarlar.sertifikaCounter = counter + 1;
  return sertifikaNo;
};

const generateTeklifNo = (teklifler) => {
  const year = new Date().getFullYear();
  const yearTeklifler = teklifler.filter(t => t.teklifNo && t.teklifNo.startsWith(year.toString()));
  const count = yearTeklifler.length + 1;
  return `${year}-${count.toString().padStart(3, '0')}`;
};

const generateIsEmriNo = (db) => {
  const year = new Date().getFullYear();
  if (!db.ayarlar) db.ayarlar = {};
  if (!db.ayarlar.isEmriCounter) db.ayarlar.isEmriCounter = 1;

  const counter = db.ayarlar.isEmriCounter;
  const isEmriNo = `IE-${year}-${String(counter).padStart(3, '0')}`;

  db.ayarlar.isEmriCounter = counter + 1;
  return isEmriNo;
};

// ============ AUTH API'LERİ ============

// Login sayfasına yönlendirme
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Login
app.post('/api/auth/login', async (req, res) => {
  console.log('POST /api/auth/login - Giriş denemesi');
  const { username, email, password } = req.body;
  const loginEmail = email || username;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Kullanıcı adı ve şifre gereklidir' });
  }
  
  const result = await auth.login(loginEmail, password);
  
  if (result.success) {
    res.json(result);
  } else {
    res.status(401).json({ error: result.error });
  }
});

// Logout
app.post('/api/auth/logout', async (req, res) => {
  console.log('POST /api/auth/logout');
  const token = req.headers['authorization']?.replace('Bearer ', '');
  
  await auth.logout(token);
  res.json({ success: true });
});

// Session doğrulama
app.get('/api/auth/verify', async (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  
  const result = await auth.verifySession(token);
  
  if (result.success) {
    res.json({ success: true, user: result.user });
  } else {
    res.status(401).json({ error: result.error });
  }
});

// Şifre değiştirme
app.post('/api/auth/change-password', auth.authMiddleware(), async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Eski ve yeni şifre gereklidir' });
  }
  
  const result = await auth.changePassword(req.user.id, oldPassword, newPassword);
  
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json({ error: result.error });
  }
});

// Kullanıcı yönetimi (sadece admin)
app.get('/api/users', auth.authMiddleware('admin'), async (req, res) => {
  const users = await auth.listUsers();
  res.json(users);
});

app.post('/api/users', auth.authMiddleware('admin'), async (req, res) => {
  const result = await auth.createUser(req.body, req.user.id);
  
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json({ error: result.error });
  }
});

app.put('/api/users/:id', auth.authMiddleware('admin'), async (req, res) => {
  const userId = parseInt(req.params.id);
  const result = await auth.updateUser(userId, req.body, req.user.id);
  
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json({ error: result.error });
  }
});

app.delete('/api/users/:id', auth.authMiddleware('admin'), async (req, res) => {
  const userId = parseInt(req.params.id);
  const result = await auth.deleteUser(userId, req.user.id);
  
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json({ error: result.error });
  }
});

// ============ MÜŞTERİ API'LERİ ============

// Tüm müşterileri listele
app.get('/api/musteriler', auth.authMiddleware(), (req, res) => {
  console.log('GET /api/musteriler - Tüm müşteriler istendi');
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }
  res.json(db.musteriler || []);
});

// Yeni müşteri ekle
app.post('/api/musteriler', auth.authMiddleware(), (req, res) => {
  console.log('POST /api/musteriler - Yeni müşteri:', req.body);
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  const { unvan, vergiNo, adres, telefon, email, yetkiliKisi, notlar } = req.body;

  // Validasyon
  if (!unvan || unvan.trim() === '') {
    return res.status(400).json({ error: 'Ünvan zorunludur' });
  }

  const yeniMusteri = {
    id: generateId(db.musteriler),
    unvan: unvan.trim(),
    vergiNo: vergiNo || '',
    adres: adres || '',
    telefon: telefon || '',
    email: email || '',
    yetkiliKisi: yetkiliKisi || '',
    notlar: notlar || '',
    olusturmaTarihi: new Date().toISOString()
  };

  db.musteriler.push(yeniMusteri);

  if (writeDB(db)) {
    console.log('Müşteri başarıyla eklendi:', yeniMusteri);
    res.json({ success: true, musteri: yeniMusteri });
  } else {
    res.status(500).json({ error: 'Müşteri kaydedilemedi' });
  }
});

// Müşteri güncelle
app.put('/api/musteriler/:id', (req, res) => {
  const id = parseInt(req.params.id);
  console.log('PUT /api/musteriler/' + id + ' - Müşteri güncelleme:', req.body);

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  const index = db.musteriler.findIndex(m => m.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Müşteri bulunamadı' });
  }

  const { unvan, vergiNo, adres, telefon, email, yetkiliKisi, notlar } = req.body;

  // Validasyon
  if (!unvan || unvan.trim() === '') {
    return res.status(400).json({ error: 'Ünvan zorunludur' });
  }

  db.musteriler[index] = {
    ...db.musteriler[index],
    unvan: unvan.trim(),
    vergiNo: vergiNo || '',
    adres: adres || '',
    telefon: telefon || '',
    email: email || '',
    yetkiliKisi: yetkiliKisi || '',
    notlar: notlar || '',
    guncellemeTarihi: new Date().toISOString()
  };

  if (writeDB(db)) {
    console.log('Müşteri başarıyla güncellendi:', db.musteriler[index]);
    res.json({ success: true, musteri: db.musteriler[index] });
  } else {
    res.status(500).json({ error: 'Müşteri güncellenemedi' });
  }
});

// Müşteri sil
app.delete('/api/musteriler/:id', (req, res) => {
  const id = parseInt(req.params.id);
  console.log('DELETE /api/musteriler/' + id + ' - Müşteri silme');

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  const index = db.musteriler.findIndex(m => m.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Müşteri bulunamadı' });
  }

  // Müşteriye ait teklif var mı kontrol et
  const musteriTeklifleri = db.teklifler.filter(t => t.musteriId === id);
  if (musteriTeklifleri.length > 0) {
    return res.status(400).json({
      error: 'Bu müşteriye ait ' + musteriTeklifleri.length + ' adet teklif var. Önce teklifleri silmelisiniz.'
    });
  }

  db.musteriler.splice(index, 1);

  if (writeDB(db)) {
    console.log('Müşteri başarıyla silindi');
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'Müşteri silinemedi' });
  }
});

// Excel'den müşteri içe aktar
app.post('/api/musteriler/excel-import', (req, res) => {
  console.log('POST /api/musteriler/excel-import - Excel içe aktarma');

  const { base64Data } = req.body;

  if (!base64Data) {
    return res.status(400).json({ error: 'Excel dosyası gönderilmedi' });
  }

  try {
    // Base64'ü buffer'a çevir
    const buffer = Buffer.from(base64Data.split(',')[1], 'base64');

    // Excel dosyasını oku
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);

    console.log('Excel verisi okundu:', data.length, 'satır');

    const db = readDB();
    if (!db) {
      return res.status(500).json({ error: 'Database okunamadı' });
    }

    let basarili = 0;
    let basarisiz = 0;
    const hatalar = [];

    data.forEach((row, index) => {
      const satir = index + 2; // Excel'de 1. satır başlık, 2. satırdan başlar

      // Ünvan ve Adres kontrolü (zorunlu alanlar)
      const unvan = row['Ünvan'] || row['unvan'] || row['ÜNVAN'];
      const adres = row['Adres'] || row['adres'] || row['ADRES'];

      if (!unvan || unvan.toString().trim() === '') {
        hatalar.push(`Satır ${satir}: Ünvan boş olamaz`);
        basarisiz++;
        return;
      }

      if (!adres || adres.toString().trim() === '') {
        hatalar.push(`Satır ${satir}: Adres boş olamaz`);
        basarisiz++;
        return;
      }

      const yeniMusteri = {
        id: generateId(db.musteriler),
        unvan: unvan.toString().trim(),
        vergiNo: (row['Vergi No'] || row['vergiNo'] || row['VERGİ NO'] || '').toString().trim(),
        adres: adres.toString().trim(),
        telefon: (row['Telefon'] || row['telefon'] || row['TELEFON'] || '').toString().trim(),
        email: (row['Email'] || row['email'] || row['EMAIL'] || '').toString().trim(),
        yetkiliKisi: (row['Yetkili Kişi'] || row['yetkiliKisi'] || row['YETKİLİ KİŞİ'] || '').toString().trim(),
        notlar: '',
        olusturmaTarihi: new Date().toISOString()
      };

      db.musteriler.push(yeniMusteri);
      basarili++;
    });

    if (writeDB(db)) {
      console.log(`Excel içe aktarma tamamlandı - Başarılı: ${basarili}, Başarısız: ${basarisiz}`);
      res.json({
        success: true,
        basarili,
        basarisiz,
        hatalar,
        message: `${basarili} müşteri başarıyla eklendi${basarisiz > 0 ? `, ${basarisiz} kayıt hatalı` : ''}`
      });
    } else {
      res.status(500).json({ error: 'Müşteriler kaydedilemedi' });
    }

  } catch (error) {
    console.error('Excel okuma hatası:', error);
    res.status(500).json({ error: 'Excel dosyası okunamadı: ' + error.message });
  }
});

// ============ TEKLİF API'LERİ ============

// Tüm teklifleri listele
app.get('/api/teklifler', (req, res) => {
  console.log('GET /api/teklifler - Tüm teklifler istendi');
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }
  res.json(db.teklifler || []);
});

// Yeni teklif oluştur
app.post('/api/teklifler', (req, res) => {
  console.log('POST /api/teklifler - Yeni teklif:', req.body);
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  const { musteriId, teklifTarihi, gecerlilik, konu, hizmetler, araToplam, kdv, genelToplam, durum } = req.body;

  // Validasyon
  if (!musteriId) {
    return res.status(400).json({ error: 'Müşteri seçilmedi' });
  }

  if (!hizmetler || hizmetler.length === 0) {
    return res.status(400).json({ error: 'En az bir hizmet seçilmelidir' });
  }

  const yeniTeklif = {
    id: generateId(db.teklifler),
    teklifNo: generateTeklifNo(db.teklifler),
    musteriId: parseInt(musteriId),
    teklifTarihi: teklifTarihi || new Date().toISOString().split('T')[0],
    gecerlilik: gecerlilik || 14,
    konu: konu || 'Periyodik Kontrol ve İş Hijyeni Ölçüm Fiyat Teklifi',
    hizmetler: hizmetler,
    araToplam: araToplam,
    kdv: kdv,
    genelToplam: genelToplam,
    durum: durum || 'Bekleyen',
    olusturmaTarihi: new Date().toISOString()
  };

  db.teklifler.push(yeniTeklif);

  if (writeDB(db)) {
    console.log('Teklif başarıyla oluşturuldu:', yeniTeklif);
    
    // E-posta gönderimi (opsiyonel - hata olsa bile teklif oluşturma başarılı)
    const musteri = db.musteriler.find(m => m.id === yeniTeklif.musteriId);
    if (musteri && musteri.email) {
      const emailTemplate = emailService.emailTemplates.teklifOlusturuldu(yeniTeklif, musteri);
      emailService.queueEmail(musteri.email, emailTemplate);
    }
    
    res.json({ success: true, teklif: yeniTeklif });
  } else {
    res.status(500).json({ error: 'Teklif kaydedilemedi' });
  }
});

// Teklif güncelle
app.put('/api/teklifler/:id', (req, res) => {
  const id = parseInt(req.params.id);
  console.log('PUT /api/teklifler/' + id + ' - Teklif güncelleme:', req.body);

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  const index = db.teklifler.findIndex(t => t.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Teklif bulunamadı' });
  }

  const { musteriId, teklifTarihi, gecerlilik, konu, hizmetler, araToplam, kdv, genelToplam, durum } = req.body;

  const eskiDurum = db.teklifler[index].durum;
  const yeniDurum = durum || eskiDurum;

  db.teklifler[index] = {
    ...db.teklifler[index],
    musteriId: musteriId || db.teklifler[index].musteriId,
    teklifTarihi: teklifTarihi || db.teklifler[index].teklifTarihi,
    gecerlilik: gecerlilik || db.teklifler[index].gecerlilik,
    konu: konu || db.teklifler[index].konu,
    hizmetler: hizmetler || db.teklifler[index].hizmetler,
    araToplam: araToplam || db.teklifler[index].araToplam,
    kdv: kdv || db.teklifler[index].kdv,
    genelToplam: genelToplam || db.teklifler[index].genelToplam,
    durum: yeniDurum,
    guncellemeTarihi: new Date().toISOString()
  };

  // Teklif onaylandığında otomatik iş emri oluştur
  let yeniIsEmri = null;
  if (yeniDurum === 'Onaylandı' && eskiDurum !== 'Onaylandı' && !db.teklifler[index].isEmriId) {
    console.log('Teklif onaylandı - İş emri oluşturuluyor...');

    if (!db.isEmirleri) {
      db.isEmirleri = [];
    }

    yeniIsEmri = {
      id: Date.now(),
      isEmriNo: generateIsEmriNo(db),
      teklifId: id,
      teklifNo: db.teklifler[index].teklifNo,
      musteriId: db.teklifler[index].musteriId,
      durum: 'Beklemede',
      kalemler: db.teklifler[index].hizmetler.map(h => ({
        hizmetAdi: h.ad,
        aciklama: h.metod || '',
        miktar: h.miktar,
        birim: h.birim
      })),
      notlar: '',
      olusturmaTarihi: new Date().toISOString(),
      guncellemeTarihi: new Date().toISOString()
    };

    db.isEmirleri.push(yeniIsEmri);
    db.teklifler[index].isEmriId = yeniIsEmri.id;

    console.log(`✅ İş emri otomatik oluşturuldu. No: ${yeniIsEmri.isEmriNo}`);
  }

  if (writeDB(db)) {
    console.log('Teklif başarıyla güncellendi:', db.teklifler[index]);
    res.json({ success: true, teklif: db.teklifler[index], isEmri: yeniIsEmri });
  } else {
    res.status(500).json({ error: 'Teklif güncellenemedi' });
  }
});

// Teklif durum güncelle
app.put('/api/teklifler/:id/durum', (req, res) => {
  const id = parseInt(req.params.id);
  const { durum, not } = req.body;

  console.log('PUT /api/teklifler/' + id + '/durum - Durum güncelleme:', req.body);

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  const index = db.teklifler.findIndex(t => t.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Teklif bulunamadı' });
  }

  const eskiDurum = db.teklifler[index].durum;

  // Durum geçmişini ekle
  if (!db.teklifler[index].durumGecmisi) {
    db.teklifler[index].durumGecmisi = [];
  }

  db.teklifler[index].durumGecmisi.push({
    eskiDurum: eskiDurum,
    yeniDurum: durum,
    tarih: new Date().toISOString(),
    not: not || ''
  });

  db.teklifler[index].durum = durum;
  db.teklifler[index].guncellemeTarihi = new Date().toISOString();

  // Teklif onaylandığında otomatik olarak iş emri oluştur
  let yeniIsEmri = null;
  if (durum === 'Onaylandı' && !db.teklifler[index].isEmriId) {
    console.log('Teklif onaylandı - İş emri oluşturuluyor...');

    if (!db.isEmirleri) {
      db.isEmirleri = [];
    }

    yeniIsEmri = {
      id: Date.now(),
      isEmriNo: generateIsEmriNo(db),
      teklifId: id,
      teklifNo: db.teklifler[index].teklifNo,
      musteriId: db.teklifler[index].musteriId,
      durum: 'Beklemede', // Beklemede, Devam Ediyor, Tamamlandı
      kalemler: db.teklifler[index].hizmetler.map(h => ({
        hizmetAdi: h.ad,
        aciklama: h.metod || '',
        miktar: h.miktar,
        birim: h.birim
        // FİYAT YOK - İş emrinde fiyat bilgisi bulunmaz
      })),
      notlar: '',
      olusturmaTarihi: new Date().toISOString(),
      guncellemeTarihi: new Date().toISOString()
    };

    db.isEmirleri.push(yeniIsEmri);
    db.teklifler[index].isEmriId = yeniIsEmri.id;

    console.log(`✅ İş emri otomatik oluşturuldu. No: ${yeniIsEmri.isEmriNo}`);
  }

  if (writeDB(db)) {
    console.log('Teklif durumu güncellendi:', durum);

    // E-posta gönderimi
    const musteri = db.musteriler.find(m => m.id === db.teklifler[index].musteriId);
    if (musteri && musteri.email) {
      const emailTemplate = emailService.emailTemplates.durumDegisti(
        db.teklifler[index],
        musteri,
        eskiDurum,
        durum,
        not
      );
      emailService.queueEmail(musteri.email, emailTemplate);
    }

    res.json({
      success: true,
      teklif: db.teklifler[index],
      muayene: yeniMuayene // Oluşturulan muayene bilgisini de döndür
    });
  } else {
    res.status(500).json({ error: 'Teklif durumu güncellenemedi' });
  }
});

// Teklif sil
app.delete('/api/teklifler/:id', (req, res) => {
  const id = parseInt(req.params.id);
  console.log('DELETE /api/teklifler/' + id + ' - Teklif silme');

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  const index = db.teklifler.findIndex(t => t.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Teklif bulunamadı' });
  }

  db.teklifler.splice(index, 1);

  if (writeDB(db)) {
    console.log('Teklif başarıyla silindi');
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'Teklif silinemedi' });
  }
});

// ============ HİZMET API'LERİ ============

// Tüm hizmetleri listele
app.get('/api/hizmetler', (req, res) => {
  console.log('GET /api/hizmetler - Tüm hizmetler istendi');
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }
  res.json(db.hizmetler || []);
});

// Yeni hizmet ekle
app.post('/api/hizmetler', (req, res) => {
  console.log('POST /api/hizmetler - Yeni hizmet ekleme:', req.body);
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  const { kategori, ad, metod, birim, fiyat } = req.body;

  // Validasyon
  if (!kategori || !ad || !metod || !birim || fiyat === undefined) {
    return res.status(400).json({ error: 'Tüm alanlar zorunludur' });
  }

  // Yeni hizmet ID'si oluştur
  let maxId = 0;
  db.hizmetler.forEach(kat => {
    kat.items.forEach(hizmet => {
      if (hizmet.id > maxId) maxId = hizmet.id;
    });
  });

  const yeniHizmet = {
    id: maxId + 1,
    ad: ad.trim(),
    metod: metod.trim(),
    birim: birim.trim(),
    fiyat: parseFloat(fiyat)
  };

  // Kategoriyi bul veya oluştur
  let kategoriObj = db.hizmetler.find(k => k.kategori === kategori);
  if (!kategoriObj) {
    // Yeni kategori oluştur
    kategoriObj = {
      kategori: kategori.trim(),
      items: []
    };
    db.hizmetler.push(kategoriObj);
  }

  // Hizmeti kategoriye ekle
  kategoriObj.items.push(yeniHizmet);

  if (writeDB(db)) {
    console.log(`Yeni hizmet eklendi: ${yeniHizmet.ad} (ID: ${yeniHizmet.id})`);
    res.json({ success: true, hizmet: yeniHizmet });
  } else {
    res.status(500).json({ error: 'Hizmet kaydedilemedi' });
  }
});

// Hizmet sil
app.delete('/api/hizmetler/:id', (req, res) => {
  const id = parseInt(req.params.id);
  console.log(`DELETE /api/hizmetler/${id} - Hizmet silme`);
  
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  let hizmetBulundu = false;
  
  db.hizmetler.forEach(kategori => {
    const index = kategori.items.findIndex(h => h.id === id);
    if (index !== -1) {
      kategori.items.splice(index, 1);
      hizmetBulundu = true;
      
      // Eğer kategoride hiç hizmet kalmadıysa kategoriyi de sil
      if (kategori.items.length === 0) {
        const katIndex = db.hizmetler.indexOf(kategori);
        db.hizmetler.splice(katIndex, 1);
      }
    }
  });

  if (hizmetBulundu) {
    if (writeDB(db)) {
      console.log(`Hizmet silindi: ID ${id}`);
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Değişiklikler kaydedilemedi' });
    }
  } else {
    res.status(404).json({ error: 'Hizmet bulunamadı' });
  }
});

// ============ FİRMA BİLGİ API'LERİ ============

// Firma bilgilerini getir
app.get('/api/firma-bilgi', (req, res) => {
  console.log('GET /api/firma-bilgi - Firma bilgileri istendi');
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }
  res.json(db.firmaBilgi || {});
});

// ============ DASHBOARD API'LERİ ============

// Dashboard istatistikleri
app.get('/api/dashboard/stats', (req, res) => {
  console.log('GET /api/dashboard/stats - Dashboard istatistikleri istendi');
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const tekliflerBuAy = db.teklifler.filter(t => {
    const teklifDate = new Date(t.teklifTarihi);
    return teklifDate.getMonth() === thisMonth && teklifDate.getFullYear() === thisYear;
  });

  const stats = {
    toplamMusteri: db.musteriler.length,
    buAyTeklifSayisi: tekliflerBuAy.length,
    bekleyenTeklifler: db.teklifler.filter(t => t.durum === 'Bekleyen').length,
    buAyToplamTutar: tekliflerBuAy.reduce((sum, t) => sum + (t.genelToplam || 0), 0)
  };

  res.json(stats);
});

// Son teklifler
app.get('/api/dashboard/son-teklifler', (req, res) => {
  console.log('GET /api/dashboard/son-teklifler - Son teklifler istendi');
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  // Son 10 teklifi tarihe göre sırala
  const sonTeklifler = [...db.teklifler]
    .sort((a, b) => new Date(b.teklifTarihi) - new Date(a.teklifTarihi))
    .slice(0, 10);

  res.json(sonTeklifler);
});

// Teklif PDF oluştur - Yeni basit versiyon
app.get('/api/teklifler/:id/pdf', auth.authMiddleware(), async (req, res) => {
  console.log('GET /api/teklifler/:id/pdf - PDF oluştur');
  const id = parseInt(req.params.id);
  
  try {
    const db = readDB();
    
    if (!db) {
      return res.status(500).json({ error: 'Database okunamadı' });
    }
    
    const teklif = db.teklifler.find(t => t.id === id);
    if (!teklif) {
      return res.status(404).json({ error: 'Teklif bulunamadı' });
    }
    
    const musteri = db.musteriler.find(m => m.id === teklif.musteriId);
    if (!musteri) {
      return res.status(404).json({ error: 'Müşteri bulunamadı' });
    }
    
    // PDF'i oluştur
    const pdfBuffer = await generatePDF(teklif, musteri, db);
    
    // Response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Teklif_${teklif.teklifNo}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    
    // PDF'i gönder
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('PDF oluşturma hatası:', error);
    res.status(500).json({ error: 'PDF oluşturulamadı' });
  }
});

// Teklif Excel dışa aktarma
app.get('/api/teklifler/:id/excel', auth.authMiddleware(), (req, res) => {
  console.log('GET /api/teklifler/:id/excel - Excel export istendi');
  const id = parseInt(req.params.id);
  const db = readDB();
  
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }
  
  const teklif = db.teklifler.find(t => t.id === id);
  if (!teklif) {
    return res.status(404).json({ error: 'Teklif bulunamadı' });
  }
  
  const musteri = db.musteriler.find(m => m.id === teklif.musteriId);
  if (!musteri) {
    return res.status(404).json({ error: 'Müşteri bulunamadı' });
  }
  
  // Excel formatında veri hazırla
  const excelData = [];
  
  // Başlık bilgileri
  excelData.push({
    'A': 'TEST VE ÖLÇÜM TALEP TEKLİF FORMU',
    'B': '',
    'C': '',
    'D': '',
    'E': '',
    'F': ''
  });
  
  excelData.push({});
  
  // Firma bilgileri
  excelData.push({
    'A': 'FİRMA BİLGİLERİ',
    'B': '',
    'C': '',
    'D': '',
    'E': '',
    'F': ''
  });
  
  excelData.push({
    'A': 'Firma Adı:',
    'B': db.firmaBilgi.unvan,
    'C': '',
    'D': 'Teklif No:',
    'E': teklif.teklifNo
  });
  
  excelData.push({
    'A': 'Adres:',
    'B': db.firmaBilgi.adres,
    'C': '',
    'D': 'Tarih:',
    'E': new Date(teklif.teklifTarihi).toLocaleDateString('tr-TR')
  });
  
  excelData.push({
    'A': 'Telefon:',
    'B': db.firmaBilgi.telefon,
    'C': '',
    'D': 'Geçerlilik:',
    'E': `${teklif.gecerlilik} gün`
  });
  
  excelData.push({
    'A': 'Email:',
    'B': db.firmaBilgi.email,
    'C': '',
    'D': '',
    'E': ''
  });
  
  excelData.push({});
  
  // Müşteri bilgileri
  excelData.push({
    'A': 'MÜŞTERİ BİLGİLERİ',
    'B': '',
    'C': '',
    'D': '',
    'E': '',
    'F': ''
  });
  
  excelData.push({
    'A': 'Firma Adı:',
    'B': musteri.unvan,
    'C': '',
    'D': 'Vergi No:',
    'E': musteri.vergiNo
  });
  
  excelData.push({
    'A': 'Adres:',
    'B': musteri.adres,
    'C': '',
    'D': '',
    'E': ''
  });
  
  excelData.push({
    'A': 'Telefon:',
    'B': musteri.telefon,
    'C': '',
    'D': 'Email:',
    'E': musteri.email
  });
  
  excelData.push({
    'A': 'Yetkili:',
    'B': musteri.yetkiliKisi,
    'C': '',
    'D': '',
    'E': ''
  });
  
  excelData.push({});
  
  // Konu
  excelData.push({
    'A': 'KONU:',
    'B': teklif.konu,
    'C': '',
    'D': '',
    'E': '',
    'F': ''
  });
  
  excelData.push({});
  
  // Hizmet başlıkları
  excelData.push({
    'A': 'HİZMET ADI',
    'B': 'METOD',
    'C': 'BİRİM',
    'D': 'MİKTAR',
    'E': 'BİRİM FİYAT',
    'F': 'TOPLAM'
  });
  
  // Hizmetleri kategoriye göre grupla
  let kategoriler = {};
  teklif.hizmetler.forEach(hizmet => {
    if (!kategoriler[hizmet.kategori]) {
      kategoriler[hizmet.kategori] = [];
    }
    kategoriler[hizmet.kategori].push(hizmet);
  });
  
  // Her kategori için
  Object.keys(kategoriler).forEach(kategori => {
    // Kategori başlığı
    excelData.push({
      'A': kategori,
      'B': '',
      'C': '',
      'D': '',
      'E': '',
      'F': ''
    });
    
    // Kategorideki hizmetler
    kategoriler[kategori].forEach(hizmet => {
      excelData.push({
        'A': hizmet.ad,
        'B': hizmet.metod,
        'C': hizmet.birim,
        'D': hizmet.miktar,
        'E': hizmet.fiyat,
        'F': hizmet.toplam
      });
    });
  });
  
  excelData.push({});
  
  // Toplam bilgileri
  excelData.push({
    'A': '',
    'B': '',
    'C': '',
    'D': 'ARA TOPLAM:',
    'E': '',
    'F': teklif.araToplam
  });
  
  excelData.push({
    'A': '',
    'B': '',
    'C': '',
    'D': 'KDV (%20):',
    'E': '',
    'F': teklif.kdv
  });
  
  excelData.push({
    'A': '',
    'B': '',
    'C': '',
    'D': 'GENEL TOPLAM:',
    'E': '',
    'F': teklif.genelToplam
  });
  
  excelData.push({});
  excelData.push({});
  
  // İmza alanları
  excelData.push({
    'A': 'HAZIRLAYAN',
    'B': '',
    'C': '',
    'D': 'ONAYLAYAN',
    'E': ''
  });
  
  // Excel oluştur
  const worksheet = xlsx.utils.json_to_sheet(excelData, { skipHeader: true });
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Teklif');
  
  // Sütun genişliklerini ayarla
  worksheet['!cols'] = [
    { wch: 20 },
    { wch: 35 },
    { wch: 10 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 }
  ];
  
  // Excel dosyasını buffer olarak oluştur
  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  
  // Dosya adı
  const fileName = `Teklif_${teklif.teklifNo}_${musteri.unvan.replace(/[^a-z0-9]/gi, '_')}.xlsx`;
  
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(buffer);
});

// ============ E-POSTA API'LERİ ============

// E-posta ayarlarını getir
app.get('/api/email-ayarlar', (req, res) => {
  console.log('GET /api/email-ayarlar - E-posta ayarları istendi');
  
  // Güvenlik için şifreyi gizle
  const config = {
    host: emailService.emailConfig?.host || '',
    port: emailService.emailConfig?.port || 587,
    secure: emailService.emailConfig?.secure || false,
    user: emailService.emailConfig?.auth?.user || '',
    configured: !!(emailService.emailConfig?.auth?.user && emailService.emailConfig?.auth?.pass)
  };
  
  res.json(config);
});

// E-posta ayarlarını güncelle
app.post('/api/email-ayarlar', async (req, res) => {
  console.log('POST /api/email-ayarlar - E-posta ayarları güncelleme');
  
  const { host, port, secure, user, pass } = req.body;
  
  if (!host || !user || !pass) {
    return res.status(400).json({ error: 'Tüm alanlar doldurulmalıdır' });
  }
  
  const newConfig = {
    host,
    port: parseInt(port) || 587,
    secure: secure || false,
    auth: {
      user,
      pass
    }
  };
  
  const result = await emailService.updateEmailConfig(newConfig);
  
  if (result.success) {
    res.json({ success: true, message: 'E-posta ayarları güncellendi' });
  } else {
    res.status(500).json({ error: 'E-posta ayarları güncellenemedi: ' + result.error });
  }
});

// Test e-postası gönder
app.post('/api/email-test', async (req, res) => {
  console.log('POST /api/email-test - Test e-postası gönderimi');
  
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'E-posta adresi gereklidir' });
  }
  
  const testTemplate = {
    subject: 'Test E-postası - ÖNDER MUAYENE',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #2C5F8D; color: white; padding: 20px; text-align: center;">
          <h1>ÖNDER MUAYENE KURULUŞU</h1>
        </div>
        <div style="padding: 30px;">
          <h2>Test E-postası</h2>
          <p>Bu bir test e-postasıdır. E-posta ayarlarınız doğru şekilde yapılandırılmıştır.</p>
          <p>Sistem şu anda e-posta gönderebilir durumda.</p>
          <p>Tarih: ${new Date().toLocaleString('tr-TR')}</p>
        </div>
        <div style="background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666;">
          <p>Konya, Türkiye | Tel: 0332 123 4567 | info@ondermuayene.com</p>
        </div>
      </div>
    `
  };
  
  const result = await emailService.sendEmail(email, testTemplate);
  
  if (result.success) {
    res.json({ success: true, message: 'Test e-postası gönderildi' });
  } else {
    res.status(500).json({ error: 'E-posta gönderilemedi: ' + result.error });
  }
});

// ============ MUAYENE API'LERİ ============

// Tüm muayeneleri listele
app.get('/api/muayeneler', auth.authMiddleware(), (req, res) => {
  console.log('GET /api/muayeneler - Tüm muayeneler istendi');
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }
  res.json(db.muayeneler || []);
});

// Yeni muayene oluştur (Onaylanan tekliften - Manuel)
app.post('/api/muayeneler', auth.authMiddleware(), (req, res) => {
  console.log('POST /api/muayeneler - Yeni muayene oluştur');
  const { teklifId, sozlesmeNo, atananPersonel } = req.body;

  if (!teklifId) {
    return res.status(400).json({ error: 'Teklif ID gereklidir' });
  }

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  const teklif = db.teklifler.find(t => t.id === teklifId);
  if (!teklif) {
    return res.status(404).json({ error: 'Teklif bulunamadı' });
  }

  if (teklif.durum !== 'Onaylandı') {
    return res.status(400).json({ error: 'Sadece onaylanan tekliflerden muayene oluşturulabilir' });
  }

  // Muayene oluştur
  const yeniMuayene = {
    id: Date.now(),
    teklifId: teklifId,
    teklifNo: teklif.teklifNo,
    musteriId: teklif.musteriId,
    sozlesmeNo: sozlesmeNo || null, // Sözleşme numarası
    atananPersonel: atananPersonel || [], // Personel atama listesi
    durum: 'Bekliyor', // Bekliyor, Devam Ediyor, Tamamlandı
    hizmetler: teklif.hizmetler.map(h => ({
      ...h,
      muayeneDurumu: 'Bekliyor',
      muayeneTarihi: null,
      atananPersonel: null,
      sertifikaNo: null
    })),
    olusturmaTarihi: new Date().toISOString(),
    guncellemeTarihi: new Date().toISOString(),
    notlar: [],
    sertifikalar: []
  };

  // Database'e ekle
  if (!db.muayeneler) {
    db.muayeneler = [];
  }
  db.muayeneler.push(yeniMuayene);

  // Teklifin durumunu güncelle
  teklif.muayeneId = yeniMuayene.id;

  const dbYazildi = writeDB(db);
  if (!dbYazildi) {
    return res.status(500).json({ error: 'Database yazılamadı' });
  }

  console.log(`✅ Muayene oluşturuldu. ID: ${yeniMuayene.id}, Teklif: ${teklif.teklifNo}`);
  res.status(201).json(yeniMuayene);
});

// Muayene detayını getir
app.get('/api/muayeneler/:id', auth.authMiddleware(), (req, res) => {
  const id = parseInt(req.params.id);
  const db = readDB();
  
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }
  
  const muayene = db.muayeneler.find(m => m.id === id);
  if (!muayene) {
    return res.status(404).json({ error: 'Muayene bulunamadı' });
  }
  
  // Müşteri bilgilerini ekle
  const musteri = db.musteriler.find(m => m.id === muayene.musteriId);
  
  res.json({ ...muayene, musteri });
});

// Muayene güncelle (Sözleşme No, Personel Atama, durum, notlar)
app.put('/api/muayeneler/:id', auth.authMiddleware(), (req, res) => {
  const id = parseInt(req.params.id);
  const { sozlesmeNo, atananPersonel, durum, not, hizmetGuncelleme } = req.body;

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  const muayeneIndex = db.muayeneler.findIndex(m => m.id === id);
  if (muayeneIndex === -1) {
    return res.status(404).json({ error: 'Muayene bulunamadı' });
  }

  const muayene = db.muayeneler[muayeneIndex];

  // Sözleşme no güncelle
  if (sozlesmeNo !== undefined) {
    muayene.sozlesmeNo = sozlesmeNo;
    if (sozlesmeNo && muayene.durum === 'Bekliyor') {
      muayene.durum = 'Devam Ediyor';
    }
  }

  // Personel atama güncelle
  if (atananPersonel !== undefined) {
    muayene.atananPersonel = atananPersonel;
  }

  // Durum güncelle
  if (durum) {
    muayene.durum = durum;
  }

  // Not ekle
  if (not) {
    if (!muayene.notlar) muayene.notlar = [];
    muayene.notlar.push({
      id: Date.now(),
      metin: not,
      tarih: new Date().toISOString(),
      kullanici: req.user.name
    });
  }

  // Hizmet durumu güncelle
  if (hizmetGuncelleme) {
    const hizmet = muayene.hizmetler.find(h => h.id === hizmetGuncelleme.hizmetId);
    if (hizmet) {
      if (hizmetGuncelleme.muayeneDurumu) {
        hizmet.muayeneDurumu = hizmetGuncelleme.muayeneDurumu;
      }
      if (hizmetGuncelleme.muayeneTarihi) {
        hizmet.muayeneTarihi = hizmetGuncelleme.muayeneTarihi;
      }
      if (hizmetGuncelleme.atananPersonel !== undefined) {
        hizmet.atananPersonel = hizmetGuncelleme.atananPersonel;
      }
      if (hizmetGuncelleme.sertifikaNo) {
        hizmet.sertifikaNo = hizmetGuncelleme.sertifikaNo;
      }
    }
  }

  // Tüm hizmetler tamamlandıysa muayeneyi tamamla
  const tamamlananHizmetler = muayene.hizmetler.filter(h => h.muayeneDurumu === 'Tamamlandı').length;
  if (tamamlananHizmetler === muayene.hizmetler.length && muayene.durum !== 'Tamamlandı') {
    muayene.durum = 'Tamamlandı';
    muayene.tamamlanmaTarihi = new Date().toISOString();
  }

  muayene.guncellemeTarihi = new Date().toISOString();

  const dbYazildi = writeDB(db);
  if (!dbYazildi) {
    return res.status(500).json({ error: 'Database yazılamadı' });
  }

  res.json(muayene);
});

// Muayene sil
app.delete('/api/muayeneler/:id', auth.authMiddleware(), (req, res) => {
  const id = parseInt(req.params.id);

  console.log('DELETE /api/muayeneler/' + id + ' - Muayene siliniyor');

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  const muayeneIndex = db.muayeneler.findIndex(m => m.id === id);
  if (muayeneIndex === -1) {
    return res.status(404).json({ error: 'Muayene bulunamadı' });
  }

  const muayene = db.muayeneler[muayeneIndex];

  // İlgili tekliften muayeneId'yi temizle
  const teklifIndex = db.teklifler.findIndex(t => t.muayeneId === id);
  if (teklifIndex !== -1) {
    db.teklifler[teklifIndex].muayeneId = null;
    console.log(`Teklif ${db.teklifler[teklifIndex].teklifNo} üzerindeki muayeneId temizlendi`);
  }

  // İlgili sertifikaları da sil
  const silinecekSertifikalar = db.sertifikalar.filter(s => s.muayeneId === id);
  if (silinecekSertifikalar.length > 0) {
    db.sertifikalar = db.sertifikalar.filter(s => s.muayeneId !== id);
    console.log(`${silinecekSertifikalar.length} adet ilgili sertifika silindi`);
  }

  // Muayeneyi sil
  db.muayeneler.splice(muayeneIndex, 1);

  if (writeDB(db)) {
    console.log('✅ Muayene başarıyla silindi:', muayene.teklifNo);
    res.json({
      success: true,
      message: 'Muayene başarıyla silindi',
      silinenSertifikaSayisi: silinecekSertifikalar.length
    });
  } else {
    res.status(500).json({ error: 'Muayene silinemedi' });
  }
});

// ============ SERTİFİKA API'LERİ ============

// Tüm sertifikaları listele
app.get('/api/sertifikalar', auth.authMiddleware(), (req, res) => {
  console.log('GET /api/sertifikalar - Tüm sertifikalar istendi');
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }
  res.json(db.sertifikalar || []);
});

// Sertifika detayını getir
app.get('/api/sertifikalar/:id', auth.authMiddleware(), (req, res) => {
  const id = parseInt(req.params.id);
  const db = readDB();

  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  const sertifika = db.sertifikalar.find(s => s.id === id);
  if (!sertifika) {
    return res.status(404).json({ error: 'Sertifika bulunamadı' });
  }

  // İlişkili verileri ekle
  const muayene = db.muayeneler.find(m => m.id === sertifika.muayeneId);
  const musteri = muayene ? db.musteriler.find(m => m.id === muayene.musteriId) : null;

  res.json({ ...sertifika, muayene, musteri });
});

// Yeni sertifika oluştur
app.post('/api/sertifikalar', auth.authMiddleware(), (req, res) => {
  console.log('POST /api/sertifikalar - Yeni sertifika oluştur');
  const { muayeneId, hizmetId, sertifikaNo, sertifikaTipi, teknikOzellikler, testSonuclari, durum } = req.body;

  if (!muayeneId || !hizmetId) {
    return res.status(400).json({ error: 'Muayene ID ve Hizmet ID gereklidir' });
  }

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  const muayene = db.muayeneler.find(m => m.id === muayeneId);
  if (!muayene) {
    return res.status(404).json({ error: 'Muayene bulunamadı' });
  }

  const hizmet = muayene.hizmetler.find(h => h.id === hizmetId);
  if (!hizmet) {
    return res.status(404).json({ error: 'Hizmet bulunamadı' });
  }

  const yeniSertifika = {
    id: Date.now(),
    muayeneId: muayeneId,
    hizmetId: hizmetId,
    teklifNo: muayene.teklifNo,
    musteriId: muayene.musteriId,
    sertifikaNo: sertifikaNo || generateSertifikaNo(db),
    sertifikaTipi: sertifikaTipi || hizmet.kategori,
    hizmetAdi: hizmet.ad,
    teknikOzellikler: teknikOzellikler || {},
    testSonuclari: testSonuclari || {},
    durum: durum || 'Taslak', // Taslak, Onaylandı, Teslim Edildi
    olusturanKullanici: req.user.name,
    olusturmaTarihi: new Date().toISOString(),
    guncellemeTarihi: new Date().toISOString()
  };

  if (!db.sertifikalar) {
    db.sertifikalar = [];
  }
  db.sertifikalar.push(yeniSertifika);

  // Hizmete sertifika no'yu ekle
  hizmet.sertifikaNo = yeniSertifika.sertifikaNo;

  const dbYazildi = writeDB(db);
  if (!dbYazildi) {
    return res.status(500).json({ error: 'Database yazılamadı' });
  }

  console.log(`✅ Sertifika oluşturuldu. ID: ${yeniSertifika.id}, No: ${yeniSertifika.sertifikaNo}`);
  res.status(201).json(yeniSertifika);
});

// Şablon ile sertifika oluştur ve Word dosyasını doldur
app.post('/api/sertifikalar/sablon-ile-olustur', auth.authMiddleware(), async (req, res) => {
  console.log('POST /api/sertifikalar/sablon-ile-olustur - Şablon ile sertifika oluştur');
  const { muayeneId, hizmetId, sablonId, teknikOzellikler, testSonuclari } = req.body;

  if (!muayeneId || !hizmetId || !sablonId) {
    return res.status(400).json({ error: 'Muayene ID, Hizmet ID ve Şablon ID gereklidir' });
  }

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  const muayene = db.muayeneler.find(m => m.id === muayeneId);
  if (!muayene) {
    return res.status(404).json({ error: 'Muayene bulunamadı' });
  }

  const hizmet = muayene.hizmetler.find(h => h.id === hizmetId);
  if (!hizmet) {
    return res.status(404).json({ error: 'Hizmet bulunamadı' });
  }

  const sablon = db.sertifikaSablonlari.find(s => s.id === sablonId);
  if (!sablon) {
    return res.status(404).json({ error: 'Şablon bulunamadı' });
  }

  const musteri = db.musteriler.find(m => m.id === muayene.musteriId);
  const teklif = db.teklifler.find(t => t.id === muayene.teklifId);
  const firmaBilgi = db.ayarlar?.firmaBilgi || {};

  // Sertifika kaydı oluştur
  const sertifikaNo = generateSertifikaNo(db);
  const yeniSertifika = {
    id: Date.now(),
    muayeneId: muayeneId,
    hizmetId: hizmetId,
    sablonId: sablonId,
    teklifNo: muayene.teklifNo,
    musteriId: muayene.musteriId,
    sertifikaNo: sertifikaNo,
    sertifikaTipi: sablon.kategori,
    hizmetAdi: hizmet.ad,
    sablonAdi: sablon.ad,
    teknikOzellikler: teknikOzellikler || {},
    testSonuclari: testSonuclari || {},
    durum: 'Onaylandı',
    olusturanKullanici: req.user.name,
    olusturmaTarihi: new Date().toISOString(),
    guncellemeTarihi: new Date().toISOString()
  };

  if (!db.sertifikalar) {
    db.sertifikalar = [];
  }
  db.sertifikalar.push(yeniSertifika);

  // Hizmete sertifika no'yu ekle
  hizmet.sertifikaNo = yeniSertifika.sertifikaNo;

  const dbYazildi = writeDB(db);
  if (!dbYazildi) {
    return res.status(500).json({ error: 'Database yazılamadı' });
  }

  console.log(`✅ Sertifika oluşturuldu. ID: ${yeniSertifika.id}, No: ${sertifikaNo}`);

  res.status(201).json({
    sertifika: yeniSertifika,
    mesaj: 'Sertifika başarıyla oluşturuldu. PDF olarak indirebilirsiniz.'
  })
});

// Sertifika güncelle
app.put('/api/sertifikalar/:id', auth.authMiddleware(), (req, res) => {
  const id = parseInt(req.params.id);
  const { sertifikaNo, teknikOzellikler, testSonuclari, durum } = req.body;

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  const sertifikaIndex = db.sertifikalar.findIndex(s => s.id === id);
  if (sertifikaIndex === -1) {
    return res.status(404).json({ error: 'Sertifika bulunamadı' });
  }

  const sertifika = db.sertifikalar[sertifikaIndex];

  if (sertifikaNo !== undefined) sertifika.sertifikaNo = sertifikaNo;
  if (teknikOzellikler !== undefined) sertifika.teknikOzellikler = teknikOzellikler;
  if (testSonuclari !== undefined) sertifika.testSonuclari = testSonuclari;
  if (durum !== undefined) sertifika.durum = durum;

  sertifika.guncellemeTarihi = new Date().toISOString();

  const dbYazildi = writeDB(db);
  if (!dbYazildi) {
    return res.status(500).json({ error: 'Database yazılamadı' });
  }

  res.json(sertifika);
});

// Sertifika sil
app.delete('/api/sertifikalar/:id', auth.authMiddleware(), (req, res) => {
  const id = parseInt(req.params.id);

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  const sertifikaIndex = db.sertifikalar.findIndex(s => s.id === id);
  if (sertifikaIndex === -1) {
    return res.status(404).json({ error: 'Sertifika bulunamadı' });
  }

  db.sertifikalar.splice(sertifikaIndex, 1);

  const dbYazildi = writeDB(db);
  if (!dbYazildi) {
    return res.status(500).json({ error: 'Sertifika silinemedi' });
  }

  console.log('Sertifika başarıyla silindi');
  res.json({ success: true });
});

// Muayeneye ait sertifikaları listele
app.get('/api/muayeneler/:id/sertifikalar', auth.authMiddleware(), (req, res) => {
  const muayeneId = parseInt(req.params.id);

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  const sertifikalar = db.sertifikalar.filter(s => s.muayeneId === muayeneId);
  res.json(sertifikalar);
});

// Sertifika PDF oluştur ve indir
app.get('/api/sertifikalar/:id/pdf', auth.authMiddleware(), async (req, res) => {
  const id = parseInt(req.params.id);
  console.log('GET /api/sertifikalar/' + id + '/pdf - PDF oluştur');

  try {
    const db = readDB();
    if (!db) {
      return res.status(500).json({ error: 'Database okunamadı' });
    }

    const sertifika = db.sertifikalar.find(s => s.id === id);
    if (!sertifika) {
      return res.status(404).json({ error: 'Sertifika bulunamadı' });
    }

    const muayene = db.muayeneler.find(m => m.id === sertifika.muayeneId);
    if (!muayene) {
      return res.status(404).json({ error: 'Muayene bulunamadı' });
    }

    const musteri = db.musteriler.find(m => m.id === sertifika.musteriId);
    if (!musteri) {
      return res.status(404).json({ error: 'Müşteri bulunamadı' });
    }

    const firmaBilgi = db.firmaBilgi || {};

    // PDF'i oluştur
    const pdfBuffer = await generateSertifikaPDF(sertifika, muayene, musteri, firmaBilgi);

    // Response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Sertifika_${sertifika.sertifikaNo}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    // PDF'i gönder
    res.send(pdfBuffer);
    console.log(`✅ PDF oluşturuldu: ${sertifika.sertifikaNo}`);

  } catch (error) {
    console.error('PDF oluşturma hatası:', error);
    res.status(500).json({ error: 'PDF oluşturulamadı: ' + error.message });
  }
});

// Word sertifikasını indir
app.get('/api/sertifikalar/:id/word', auth.authMiddleware(), (req, res) => {
  const id = parseInt(req.params.id);
  console.log(`GET /api/sertifikalar/${id}/word - Word dosyası indiriliyor`);

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  const sertifika = db.sertifikalar.find(s => s.id === id);
  if (!sertifika) {
    return res.status(404).json({ error: 'Sertifika bulunamadı' });
  }

  if (!sertifika.wordDosyaYolu) {
    return res.status(404).json({ error: 'Bu sertifika için Word dosyası oluşturulmamış' });
  }

  const fs = require('fs');
  const path = require('path');
  const wordDosyaYolu = path.join(__dirname, 'output', sertifika.wordDosyaYolu);

  if (!fs.existsSync(wordDosyaYolu)) {
    return res.status(404).json({ error: 'Word dosyası bulunamadı' });
  }

  // Dosyayı indir
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${sertifika.wordDosyaYolu}"`);

  const wordBuffer = fs.readFileSync(wordDosyaYolu);
  res.send(wordBuffer);

  console.log(`✅ Word dosyası indirildi: ${sertifika.wordDosyaYolu}`);
});

// ============ PERSONEL API'LERİ ============

// Tüm personelleri listele
app.get('/api/personeller', auth.authMiddleware(), (req, res) => {
  console.log('GET /api/personeller - Personel listesi istendi');
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }
  if (!db.personeller) {
    db.personeller = [];
    writeDB(db);
  }
  res.json(db.personeller);
});

// Yeni personel ekle
app.post('/api/personeller', auth.authMiddleware(), (req, res) => {
  console.log('POST /api/personeller - Yeni personel ekleniyor');
  const { adSoyad, unvan, sertifikaNo, telefon, email } = req.body;

  if (!adSoyad || !unvan) {
    return res.status(400).json({ error: 'Ad Soyad ve Ünvan zorunludur' });
  }

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  if (!db.personeller) {
    db.personeller = [];
  }

  const yeniPersonel = {
    id: Date.now(),
    adSoyad,
    unvan,
    sertifikaNo: sertifikaNo || '',
    telefon: telefon || '',
    email: email || '',
    aktif: true,
    olusturmaTarihi: new Date().toISOString(),
    guncellemeTarihi: new Date().toISOString()
  };

  db.personeller.push(yeniPersonel);

  if (writeDB(db)) {
    console.log('✅ Personel eklendi:', yeniPersonel.adSoyad);
    res.status(201).json(yeniPersonel);
  } else {
    res.status(500).json({ error: 'Personel eklenemedi' });
  }
});

// Personel güncelle
app.put('/api/personeller/:id', auth.authMiddleware(), (req, res) => {
  const id = parseInt(req.params.id);
  const { adSoyad, unvan, sertifikaNo, telefon, email, aktif } = req.body;

  console.log('PUT /api/personeller/' + id + ' - Personel güncelleniyor');

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  if (!db.personeller) {
    return res.status(404).json({ error: 'Personel bulunamadı' });
  }

  const personelIndex = db.personeller.findIndex(p => p.id === id);
  if (personelIndex === -1) {
    return res.status(404).json({ error: 'Personel bulunamadı' });
  }

  db.personeller[personelIndex] = {
    ...db.personeller[personelIndex],
    adSoyad: adSoyad || db.personeller[personelIndex].adSoyad,
    unvan: unvan || db.personeller[personelIndex].unvan,
    sertifikaNo: sertifikaNo !== undefined ? sertifikaNo : db.personeller[personelIndex].sertifikaNo,
    telefon: telefon !== undefined ? telefon : db.personeller[personelIndex].telefon,
    email: email !== undefined ? email : db.personeller[personelIndex].email,
    aktif: aktif !== undefined ? aktif : db.personeller[personelIndex].aktif,
    guncellemeTarihi: new Date().toISOString()
  };

  if (writeDB(db)) {
    console.log('✅ Personel güncellendi:', db.personeller[personelIndex].adSoyad);
    res.json(db.personeller[personelIndex]);
  } else {
    res.status(500).json({ error: 'Personel güncellenemedi' });
  }
});

// Personel sil
app.delete('/api/personeller/:id', auth.authMiddleware(), (req, res) => {
  const id = parseInt(req.params.id);

  console.log('DELETE /api/personeller/' + id + ' - Personel siliniyor');

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  if (!db.personeller) {
    return res.status(404).json({ error: 'Personel bulunamadı' });
  }

  const personelIndex = db.personeller.findIndex(p => p.id === id);
  if (personelIndex === -1) {
    return res.status(404).json({ error: 'Personel bulunamadı' });
  }

  const silinen = db.personeller[personelIndex];
  db.personeller.splice(personelIndex, 1);

  if (writeDB(db)) {
    console.log('✅ Personel silindi:', silinen.adSoyad);
    res.json({ success: true, message: 'Personel silindi' });
  } else {
    res.status(500).json({ error: 'Personel silinemedi' });
  }
});

// ============ SERTİFİKA ŞABLON API'LERİ ============

// Tüm sertifika şablonlarını listele
app.get('/api/sertifika-sablonlari', auth.authMiddleware(), (req, res) => {
  console.log('GET /api/sertifika-sablonlari - Şablonlar istendi');
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }
  if (!db.sertifikaSablonlari) {
    db.sertifikaSablonlari = [];
    writeDB(db);
  }
  res.json(db.sertifikaSablonlari);
});

// Yeni sertifika şablonu oluştur
app.post('/api/sertifika-sablonlari', auth.authMiddleware(), (req, res) => {
  console.log('POST /api/sertifika-sablonlari - Yeni şablon oluşturuluyor');
  const { ad, kategori, aciklama, teknikAlanlar, testAlanlar, aktif } = req.body;

  if (!ad || !kategori) {
    return res.status(400).json({ error: 'Şablon adı ve kategori zorunludur' });
  }

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  if (!db.sertifikaSablonlari) {
    db.sertifikaSablonlari = [];
  }

  const yeniSablon = {
    id: Date.now(),
    ad,
    kategori,
    aciklama: aciklama || '',
    teknikAlanlar: teknikAlanlar || [],
    testAlanlar: testAlanlar || [],
    aktif: aktif !== false,
    olusturmaTarihi: new Date().toISOString(),
    guncellemeTarihi: new Date().toISOString()
  };

  db.sertifikaSablonlari.push(yeniSablon);

  if (writeDB(db)) {
    console.log('✅ Sertifika şablonu oluşturuldu:', yeniSablon.ad);
    res.json(yeniSablon);
  } else {
    res.status(500).json({ error: 'Şablon kaydedilemedi' });
  }
});

// Sertifika şablonunu güncelle
app.put('/api/sertifika-sablonlari/:id', auth.authMiddleware(), (req, res) => {
  const id = parseInt(req.params.id);
  const { ad, kategori, aciklama, teknikAlanlar, testAlanlar, aktif } = req.body;

  console.log('PUT /api/sertifika-sablonlari/' + id + ' - Şablon güncelleniyor');

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  if (!db.sertifikaSablonlari) {
    db.sertifikaSablonlari = [];
  }

  const sablonIndex = db.sertifikaSablonlari.findIndex(s => s.id === id);
  if (sablonIndex === -1) {
    return res.status(404).json({ error: 'Şablon bulunamadı' });
  }

  // Şablonu güncelle
  db.sertifikaSablonlari[sablonIndex] = {
    ...db.sertifikaSablonlari[sablonIndex],
    ad: ad || db.sertifikaSablonlari[sablonIndex].ad,
    kategori: kategori || db.sertifikaSablonlari[sablonIndex].kategori,
    aciklama: aciklama !== undefined ? aciklama : db.sertifikaSablonlari[sablonIndex].aciklama,
    teknikAlanlar: teknikAlanlar !== undefined ? teknikAlanlar : db.sertifikaSablonlari[sablonIndex].teknikAlanlar,
    testAlanlar: testAlanlar !== undefined ? testAlanlar : db.sertifikaSablonlari[sablonIndex].testAlanlar,
    aktif: aktif !== undefined ? aktif : db.sertifikaSablonlari[sablonIndex].aktif,
    guncellemeTarihi: new Date().toISOString()
  };

  if (writeDB(db)) {
    console.log('✅ Sertifika şablonu güncellendi:', db.sertifikaSablonlari[sablonIndex].ad);
    res.json(db.sertifikaSablonlari[sablonIndex]);
  } else {
    res.status(500).json({ error: 'Şablon güncellenemedi' });
  }
});

// Sertifika şablonunu sil
app.delete('/api/sertifika-sablonlari/:id', auth.authMiddleware(), (req, res) => {
  const id = parseInt(req.params.id);

  console.log('DELETE /api/sertifika-sablonlari/' + id + ' - Şablon siliniyor');

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  if (!db.sertifikaSablonlari) {
    return res.status(404).json({ error: 'Şablon bulunamadı' });
  }

  const sablonIndex = db.sertifikaSablonlari.findIndex(s => s.id === id);
  if (sablonIndex === -1) {
    return res.status(404).json({ error: 'Şablon bulunamadı' });
  }

  const silinen = db.sertifikaSablonlari[sablonIndex];
  db.sertifikaSablonlari.splice(sablonIndex, 1);

  if (writeDB(db)) {
    console.log('✅ Sertifika şablonu silindi:', silinen.ad);
    res.json({ success: true, message: 'Şablon silindi' });
  } else {
    res.status(500).json({ error: 'Şablon silinemedi' });
  }
});

// Başlangıçta e-posta ayarlarını yükle
emailService.loadEmailConfig();

// Server başlat
// ============ İŞ EMRİ API'LERİ ============

// Tüm iş emirlerini listele
app.get('/api/is-emirleri', auth.authMiddleware(), (req, res) => {
  console.log('GET /api/is-emirleri - İş emirleri istendi');
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }
  if (!db.isEmirleri) {
    db.isEmirleri = [];
    writeDB(db);
  }
  res.json(db.isEmirleri);
});

// Tek iş emrini detaylı getir
app.get('/api/is-emirleri/:id', auth.authMiddleware(), (req, res) => {
  const id = parseInt(req.params.id);
  console.log('GET /api/is-emirleri/' + id + ' - İş emri detayı istendi');

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  const isEmri = db.isEmirleri?.find(ie => ie.id === id);
  if (!isEmri) {
    return res.status(404).json({ error: 'İş emri bulunamadı' });
  }

  // İlgili verileri ekle
  const teklif = db.teklifler?.find(t => t.id === isEmri.teklifId);
  const musteri = db.musteriler?.find(m => m.id === isEmri.musteriId);

  // Personel atamalarını getir
  const personelAtamalari = db.personelAtamalari?.filter(pa => pa.isEmriId === id) || [];
  const atananPersoneller = personelAtamalari.map(pa => {
    const personel = db.personeller?.find(p => p.id === pa.personelId);
    return {
      ...pa,
      personel: personel || null
    };
  });

  res.json({
    ...isEmri,
    teklif,
    musteri,
    personelAtamalari: atananPersoneller
  });
});

// Yeni iş emri oluştur (manuel)
app.post('/api/is-emirleri', auth.authMiddleware(), (req, res) => {
  console.log('POST /api/is-emirleri - Yeni iş emri oluşturuluyor');
  const { teklifId, musteriId, kalemler, notlar } = req.body;

  if (!teklifId || !musteriId) {
    return res.status(400).json({ error: 'Teklif ID ve Müşteri ID zorunludur' });
  }

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  if (!db.isEmirleri) {
    db.isEmirleri = [];
  }

  // Teklif bilgilerini al
  const teklif = db.teklifler?.find(t => t.id === teklifId);
  if (!teklif) {
    return res.status(404).json({ error: 'Teklif bulunamadı' });
  }

  const yeniIsEmri = {
    id: Date.now(),
    isEmriNo: generateIsEmriNo(db),
    teklifId,
    teklifNo: teklif.teklifNo,
    musteriId,
    durum: 'Beklemede',
    kalemler: kalemler || teklif.hizmetler?.map(h => ({
      hizmetAdi: h.ad,
      aciklama: h.metod || '',
      miktar: h.miktar,
      birim: h.birim
    })) || [],
    notlar: notlar || '',
    olusturmaTarihi: new Date().toISOString(),
    guncellemeTarihi: new Date().toISOString()
  };

  db.isEmirleri.push(yeniIsEmri);

  if (writeDB(db)) {
    console.log('✅ İş emri oluşturuldu:', yeniIsEmri.isEmriNo);
    res.status(201).json(yeniIsEmri);
  } else {
    res.status(500).json({ error: 'İş emri oluşturulamadı' });
  }
});

// İş emri güncelle
app.put('/api/is-emirleri/:id', auth.authMiddleware(), (req, res) => {
  const id = parseInt(req.params.id);
  const { durum, notlar, kalemler } = req.body;

  console.log('PUT /api/is-emirleri/' + id + ' - İş emri güncelleniyor');

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  if (!db.isEmirleri) {
    return res.status(404).json({ error: 'İş emri bulunamadı' });
  }

  const isEmriIndex = db.isEmirleri.findIndex(ie => ie.id === id);
  if (isEmriIndex === -1) {
    return res.status(404).json({ error: 'İş emri bulunamadı' });
  }

  db.isEmirleri[isEmriIndex] = {
    ...db.isEmirleri[isEmriIndex],
    durum: durum || db.isEmirleri[isEmriIndex].durum,
    notlar: notlar !== undefined ? notlar : db.isEmirleri[isEmriIndex].notlar,
    kalemler: kalemler || db.isEmirleri[isEmriIndex].kalemler,
    guncellemeTarihi: new Date().toISOString()
  };

  if (writeDB(db)) {
    console.log('✅ İş emri güncellendi:', db.isEmirleri[isEmriIndex].isEmriNo);
    res.json(db.isEmirleri[isEmriIndex]);
  } else {
    res.status(500).json({ error: 'İş emri güncellenemedi' });
  }
});

// İş emri sil
app.delete('/api/is-emirleri/:id', auth.authMiddleware(), (req, res) => {
  const id = parseInt(req.params.id);

  console.log('DELETE /api/is-emirleri/' + id + ' - İş emri siliniyor');

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  if (!db.isEmirleri) {
    return res.status(404).json({ error: 'İş emri bulunamadı' });
  }

  const isEmriIndex = db.isEmirleri.findIndex(ie => ie.id === id);
  if (isEmriIndex === -1) {
    return res.status(404).json({ error: 'İş emri bulunamadı' });
  }

  const silinen = db.isEmirleri[isEmriIndex];
  db.isEmirleri.splice(isEmriIndex, 1);

  if (writeDB(db)) {
    console.log('✅ İş emri silindi:', silinen.isEmriNo);
    res.json({ success: true, message: 'İş emri silindi' });
  } else {
    res.status(500).json({ error: 'İş emri silinemedi' });
  }
});

// ============ PERSONEL ATAMA API'LERİ ============

// İş emrine personel ata
app.post('/api/is-emirleri/:id/personel', auth.authMiddleware(), (req, res) => {
  const isEmriId = parseInt(req.params.id);
  const { personelId, gorev } = req.body;

  console.log('POST /api/is-emirleri/' + isEmriId + '/personel - Personel atanıyor');

  if (!personelId) {
    return res.status(400).json({ error: 'Personel ID zorunludur' });
  }

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  // İş emrini kontrol et
  const isEmri = db.isEmirleri?.find(ie => ie.id === isEmriId);
  if (!isEmri) {
    return res.status(404).json({ error: 'İş emri bulunamadı' });
  }

  // Personeli kontrol et
  const personel = db.personeller?.find(p => p.id === personelId);
  if (!personel) {
    return res.status(404).json({ error: 'Personel bulunamadı' });
  }

  if (!db.personelAtamalari) {
    db.personelAtamalari = [];
  }

  // Aynı personel zaten atanmış mı kontrol et
  const mevcutAtama = db.personelAtamalari.find(
    pa => pa.isEmriId === isEmriId && pa.personelId === personelId
  );

  if (mevcutAtama) {
    return res.status(400).json({ error: 'Bu personel zaten atanmış' });
  }

  const yeniAtama = {
    id: Date.now(),
    isEmriId,
    personelId,
    gorev: gorev || '',
    atamaTarihi: new Date().toISOString()
  };

  db.personelAtamalari.push(yeniAtama);

  if (writeDB(db)) {
    console.log('✅ Personel atandı:', personel.adSoyad);
    res.status(201).json({
      ...yeniAtama,
      personel
    });
  } else {
    res.status(500).json({ error: 'Personel ataması yapılamadı' });
  }
});

// Personel atamasını sil
app.delete('/api/personel-atamalari/:id', auth.authMiddleware(), (req, res) => {
  const id = parseInt(req.params.id);

  console.log('DELETE /api/personel-atamalari/' + id + ' - Personel ataması kaldırılıyor');

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  if (!db.personelAtamalari) {
    return res.status(404).json({ error: 'Atama bulunamadı' });
  }

  const atamaIndex = db.personelAtamalari.findIndex(pa => pa.id === id);
  if (atamaIndex === -1) {
    return res.status(404).json({ error: 'Atama bulunamadı' });
  }

  const silinen = db.personelAtamalari[atamaIndex];
  db.personelAtamalari.splice(atamaIndex, 1);

  if (writeDB(db)) {
    console.log('✅ Personel ataması kaldırıldı');
    res.json({ success: true, message: 'Personel ataması kaldırıldı' });
  } else {
    res.status(500).json({ error: 'Personel ataması kaldırılamadı' });
  }
});

// ============ KALEM BAZINDA PERSONEL ATAMA API'LERİ ============

// Kaleme personel ata
app.put('/api/is-emirleri/:id/kalemler/:kalemIndex/personel', auth.authMiddleware(), (req, res) => {
  const isEmriId = parseInt(req.params.id);
  const kalemIndex = parseInt(req.params.kalemIndex);
  const { personelId } = req.body;

  console.log(`PUT /api/is-emirleri/${isEmriId}/kalemler/${kalemIndex}/personel - Kaleme personel atanıyor`);

  if (!personelId) {
    return res.status(400).json({ error: 'Personel ID zorunludur' });
  }

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  // İş emrini bul
  const isEmri = db.isEmirleri?.find(ie => ie.id === isEmriId);
  if (!isEmri) {
    return res.status(404).json({ error: 'İş emri bulunamadı' });
  }

  // Kalemi kontrol et
  if (!isEmri.kalemler || !isEmri.kalemler[kalemIndex]) {
    return res.status(404).json({ error: 'Kalem bulunamadı' });
  }

  // Personeli kontrol et
  const personel = db.personeller?.find(p => p.id === personelId);
  if (!personel) {
    return res.status(404).json({ error: 'Personel bulunamadı' });
  }

  // Kalem yapısını güncelle
  if (!isEmri.kalemler[kalemIndex].atananPersoneller) {
    isEmri.kalemler[kalemIndex].atananPersoneller = [];
  }

  if (!isEmri.kalemler[kalemIndex].durum) {
    isEmri.kalemler[kalemIndex].durum = 'Beklemede';
  }

  // Personel zaten atanmış mı kontrol et
  if (isEmri.kalemler[kalemIndex].atananPersoneller.includes(personelId)) {
    return res.status(400).json({ error: 'Bu personel zaten bu kaleme atanmış' });
  }

  // Personeli ekle
  isEmri.kalemler[kalemIndex].atananPersoneller.push(personelId);
  isEmri.guncellemeTarihi = new Date().toISOString();

  if (writeDB(db)) {
    console.log(`✅ Personel kaleme atandı: ${personel.adSoyad}`);
    res.json({
      success: true,
      kalem: isEmri.kalemler[kalemIndex],
      personel
    });
  } else {
    res.status(500).json({ error: 'Personel ataması yapılamadı' });
  }
});

// Kalemden personel kaldır
app.delete('/api/is-emirleri/:id/kalemler/:kalemIndex/personel/:personelId', auth.authMiddleware(), (req, res) => {
  const isEmriId = parseInt(req.params.id);
  const kalemIndex = parseInt(req.params.kalemIndex);
  const personelId = parseInt(req.params.personelId);

  console.log(`DELETE /api/is-emirleri/${isEmriId}/kalemler/${kalemIndex}/personel/${personelId} - Personel kaldırılıyor`);

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  const isEmri = db.isEmirleri?.find(ie => ie.id === isEmriId);
  if (!isEmri) {
    return res.status(404).json({ error: 'İş emri bulunamadı' });
  }

  if (!isEmri.kalemler || !isEmri.kalemler[kalemIndex]) {
    return res.status(404).json({ error: 'Kalem bulunamadı' });
  }

  if (!isEmri.kalemler[kalemIndex].atananPersoneller) {
    return res.status(404).json({ error: 'Bu kalemde personel ataması yok' });
  }

  // Personeli bul ve kaldır
  const personelIndex = isEmri.kalemler[kalemIndex].atananPersoneller.indexOf(personelId);
  if (personelIndex === -1) {
    return res.status(404).json({ error: 'Bu personel bu kaleme atanmamış' });
  }

  isEmri.kalemler[kalemIndex].atananPersoneller.splice(personelIndex, 1);
  isEmri.guncellemeTarihi = new Date().toISOString();

  if (writeDB(db)) {
    console.log('✅ Personel kalemden kaldırıldı');
    res.json({ success: true, message: 'Personel kaldırıldı' });
  } else {
    res.status(500).json({ error: 'Personel kaldırılamadı' });
  }
});

// Kalem durumunu güncelle
app.put('/api/is-emirleri/:id/kalemler/:kalemIndex/durum', auth.authMiddleware(), (req, res) => {
  const isEmriId = parseInt(req.params.id);
  const kalemIndex = parseInt(req.params.kalemIndex);
  const { durum } = req.body;

  console.log(`PUT /api/is-emirleri/${isEmriId}/kalemler/${kalemIndex}/durum - Kalem durumu güncelleniyor: ${durum}`);

  if (!durum) {
    return res.status(400).json({ error: 'Durum zorunludur' });
  }

  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'Database okunamadı' });
  }

  const isEmri = db.isEmirleri?.find(ie => ie.id === isEmriId);
  if (!isEmri) {
    return res.status(404).json({ error: 'İş emri bulunamadı' });
  }

  if (!isEmri.kalemler || !isEmri.kalemler[kalemIndex]) {
    return res.status(404).json({ error: 'Kalem bulunamadı' });
  }

  // Kalem durumunu güncelle
  isEmri.kalemler[kalemIndex].durum = durum;

  if (durum === 'Tamamlandı') {
    isEmri.kalemler[kalemIndex].tamamlanmaTarihi = new Date().toISOString();
  }

  // İş emrinin genel durumunu otomatik güncelle
  const tamamlananKalemSayisi = isEmri.kalemler.filter(k => k.durum === 'Tamamlandı').length;
  const toplamKalemSayisi = isEmri.kalemler.length;

  if (tamamlananKalemSayisi === 0) {
    isEmri.durum = 'Beklemede';
  } else if (tamamlananKalemSayisi === toplamKalemSayisi) {
    isEmri.durum = 'Tamamlandı';
  } else {
    isEmri.durum = 'Devam Ediyor';
  }

  isEmri.guncellemeTarihi = new Date().toISOString();

  if (writeDB(db)) {
    console.log(`✅ Kalem durumu güncellendi: ${durum}`);
    console.log(`✅ İş emri durumu otomatik güncellendi: ${isEmri.durum}`);
    res.json({
      success: true,
      kalem: isEmri.kalemler[kalemIndex],
      isEmriDurum: isEmri.durum
    });
  } else {
    res.status(500).json({ error: 'Durum güncellenemedi' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  let ipAddress = 'localhost';
  
  // IP adresini bul
  Object.keys(networkInterfaces).forEach(interface => {
    networkInterfaces[interface].forEach(network => {
      if (network.family === 'IPv4' && !network.internal) {
        ipAddress = network.address;
      }
    });
  });
  
  console.log('===========================================');
  console.log('🚀 PERİYODİK MUAYENE YÖNETİM SİSTEMİ');
  console.log('===========================================');
  console.log(`✅ Server çalışıyor:`);
  console.log(`   📍 Yerel: http://localhost:${PORT}`);
  console.log(`   📍 Ağ: http://${ipAddress}:${PORT}`);
  console.log(`📁 Database: ${DB_PATH}`);
  console.log('⏰ Başlatma zamanı:', new Date().toLocaleString('tr-TR'));
  console.log('===========================================');
  console.log('🌐 Aynı ağdaki diğer cihazlar yukarıdaki "Ağ" adresini kullanabilir');
  console.log('===========================================');
});
