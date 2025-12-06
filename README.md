# 🏭 Periyodik Muayene Yönetim Sistemi

**ÖNDER MUAYENE KURULUŞU** için geliştirilmiş, müşteri ve teklif yönetimi modülü içeren web tabanlı yönetim sistemi.

## 📋 İçindekiler

- [Özellikler](#özellikler)
- [Teknoloji Stack](#teknoloji-stack)
- [Kurulum](#kurulum)
- [Kullanım](#kullanım)
- [API Dokümantasyonu](#api-dokümantasyonu)
- [Proje Yapısı](#proje-yapısı)
- [Ekran Görüntüleri](#ekran-görüntüleri)

## ✨ Özellikler

### 📊 Dashboard
- Toplam müşteri sayısı
- Aylık teklif istatistikleri
- Bekleyen teklifler
- Aylık teklif tutarı
- Son 10 teklif listesi

### 👥 Müşteri Yönetimi
- ✅ Müşteri ekleme/düzenleme/silme
- 📤 Excel'den toplu müşteri içe aktarma
- 🔍 Müşteri arama (ünvan, vergi no, telefon)
- 📥 Excel şablon indirme
- 📋 Müşteri detay görüntüleme

### 📄 Teklif Yönetimi
- ✅ Teklif oluşturma/düzenleme/silme
- 🎯 Kategorilere göre hizmet seçimi
- 💰 Otomatik fiyat hesaplama (KDV dahil)
- 👁️ Teklif önizleme
- 📄 PDF oluşturma (yazdırma)
- 📧 Email gönderme
- 🏷️ Durum takibi (Bekleyen/Onaylandı/Reddedildi)
- 🔢 Otomatik teklif numarası (YYYY-NNN formatı)

### 🎨 Tasarım Özellikleri
- Modern ve profesyonel arayüz
- Responsive tasarım (masaüstü ve tablet uyumlu)
- Endüstriyel renk paleti (Mavi, Turuncu, Gri)
- Toast bildirimleri
- Modal pencereler
- Loading göstergeleri

## 🛠 Teknoloji Stack

### Backend
- **Node.js** - JavaScript runtime
- **Express** - Web framework
- **CORS** - Cross-origin resource sharing
- **body-parser** - Request body parsing
- **xlsx** - Excel dosya işlemleri

### Frontend
- **HTML5** - Yapı
- **CSS3** - Stil (Grid, Flexbox)
- **Vanilla JavaScript** - İnteraksiyon
- **Fetch API** - HTTP istekleri

### Database
- **JSON File Based** - Basit ve taşınabilir veri saklama

## 📥 Kurulum

### Gereksinimler
- Node.js (v14 veya üzeri)
- npm veya yarn

### Adımlar

1. **Projeyi klonlayın veya indirin**
```bash
cd periyodik-muayene
```

2. **Bağımlılıkları yükleyin**
```bash
npm install
```

3. **Sunucuyu başlatın**
```bash
npm start
```

4. **Tarayıcıda açın**
```
http://localhost:3001
```

## 🚀 Kullanım

### Müşteri Ekleme

1. Sol menüden **Müşteriler** sayfasına gidin
2. **Yeni Müşteri** butonuna tıklayın
3. Formu doldurun (Ünvan zorunludur)
4. **Kaydet** butonuna tıklayın

### Excel'den Müşteri İçe Aktarma

1. **Excel İçe Aktar** butonuna tıklayın
2. Excel dosyasını seçin
3. Sistem otomatik olarak müşterileri içe aktaracak
4. Sonuç bildirimi gösterilecek

**Excel Formatı:**
```
Ünvan | Adres | Vergi No | Telefon | Email | Yetkili Kişi
```

### Teklif Oluşturma

1. Sol menüden **Teklifler** sayfasına gidin
2. **Yeni Teklif** butonuna tıklayın
3. Müşteri seçin
4. Hizmetleri seçin ve miktarları girin
5. Otomatik hesaplanan fiyatı kontrol edin
6. **Önizle** ile teklifi görüntüleyin (opsiyonel)
7. **Kaydet** ile teklifi kaydedin

### Teklif İşlemleri

- **Görüntüle (👁️)**: Teklif önizlemesini açar
- **Düzenle (✏️)**: Teklifi düzenleme moduna alır
- **PDF (📄)**: Teklifi PDF olarak görüntüler
- **Sil (🗑️)**: Teklifi siler (onay gerektirir)

## 📡 API Dokümantasyonu

### Müşteri API'leri

#### Tüm müşterileri listele
```http
GET /api/musteriler
```

#### Yeni müşteri ekle
```http
POST /api/musteriler
Content-Type: application/json

{
  "unvan": "Firma Adı",
  "vergiNo": "1234567890",
  "adres": "Adres bilgisi",
  "telefon": "0332 123 4567",
  "email": "info@firma.com",
  "yetkiliKisi": "Yetkili Adı",
  "notlar": "Notlar"
}
```

#### Müşteri güncelle
```http
PUT /api/musteriler/:id
Content-Type: application/json

{
  "unvan": "Güncel Firma Adı",
  ...
}
```

#### Müşteri sil
```http
DELETE /api/musteriler/:id
```

#### Excel'den içe aktar
```http
POST /api/musteriler/excel-import
Content-Type: application/json

{
  "base64Data": "data:application/vnd.ms-excel;base64,..."
}
```

### Teklif API'leri

#### Tüm teklifleri listele
```http
GET /api/teklifler
```

#### Yeni teklif oluştur
```http
POST /api/teklifler
Content-Type: application/json

{
  "musteriId": 1,
  "teklifTarihi": "2025-01-26",
  "gecerlilik": 14,
  "konu": "Teklif konusu",
  "hizmetler": [...],
  "araToplam": 5000,
  "kdv": 1000,
  "genelToplam": 6000,
  "durum": "Bekleyen"
}
```

#### Teklif güncelle
```http
PUT /api/teklifler/:id
```

#### Teklif sil
```http
DELETE /api/teklifler/:id
```

### Hizmet API'leri

#### Tüm hizmetleri listele
```http
GET /api/hizmetler
```

### Dashboard API'leri

#### Dashboard istatistikleri
```http
GET /api/dashboard/stats
```

#### Son teklifler
```http
GET /api/dashboard/son-teklifler
```

## 📁 Proje Yapısı

```
periyodik-muayene/
├── server.js               # Express server ve API'ler
├── database.json           # JSON veritabanı
├── package.json            # Proje bağımlılıkları
├── README.md              # Dökümantasyon
└── public/                # Frontend dosyaları
    ├── index.html         # Ana HTML sayfası
    ├── style.css          # CSS stilleri
    └── app.js             # JavaScript mantığı
```

## 🎯 Hizmet Kategorileri

Sistem şu hizmet kategorilerini içerir:

1. **İş Hijyeni Ölçüm**
   - İç Ortam Toz Ölçümü
   - Kişisel Maruziyet Toz Ölçümü
   - İç Ortam Aydınlatma Ölçümü
   - Termal Konfor Ölçümü
   - İç Ortam Gürültü Ölçümü
   - Kişisel Maruziyet Gürültü

2. **Elektriksel Kontroller**
   - Elektrik Topraklama Ölçümü
   - Elektrik İç Tesisat Kontrolü
   - Jeneratör Kontrolü
   - Paratoner Kontrolü

3. **Basınçlı Kaplar Kontrolleri**
   - Kalorifer Kazanı
   - Hidrofor Tankı
   - Genleşme Tankı

4. **Diğer Kontroller**
   - Yangın Tüpü

5. **Mekanik Tesisat Kontrolleri**
   - Yangın Tesisatı

## 💾 Veritabanı Yapısı

### database.json
```json
{
  "firmaBilgi": {
    "ad": "ÖNDER MUAYENE KURULUŞU",
    "adres": "Konya, Türkiye",
    "telefon": "0332 123 4567",
    "email": "info@ondermuayene.com"
  },
  "musteriler": [...],
  "teklifler": [...],
  "hizmetler": [...]
}
```

## 🔐 Güvenlik Notları

- Şu anda authentication sistemi bulunmamaktadır
- Üretim ortamı için authentication eklenmeli
- HTTPS kullanılmalı
- Database için gerçek bir veritabanı (PostgreSQL, MongoDB) kullanılmalı
- Rate limiting eklenmeli

## 🐛 Bilinen Sorunlar ve Sınırlamalar

- Authentication/Authorization yok
- PDF oluşturma basit yazdırma özelliği ile sınırlı
- Dosya yükleme boyutu 50MB ile sınırlı
- Tek kullanıcılı sistem (multi-tenancy yok)

## 🔄 Gelecek Özellikler (Roadmap)

- [ ] Kullanıcı giriş sistemi
- [ ] Rol bazlı yetkilendirme
- [ ] Sözleşme yönetimi
- [ ] Muayene raporu modülü
- [ ] Ödeme takibi
- [ ] Email bildirimleri
- [ ] Gerçek PDF oluşturma (PDFKit)
- [ ] Grafik ve raporlama
- [ ] Mobil uygulama

## 📞 Destek

Sorularınız için:
- Email: info@ondermuayene.com
- Telefon: 0332 123 4567

## 📄 Lisans

Bu proje ÖNDER MUAYENE KURULUŞU için özel olarak geliştirilmiştir.

---

**v1.0.0** - 26 Ekim 2025

Geliştirici: Claude Code
