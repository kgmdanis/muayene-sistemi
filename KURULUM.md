# 🚀 PERİYODİK MUAYENE YÖNETİM SİSTEMİ - KURULUM REHBERİ

## 📋 İÇİNDEKİLER
1. [Sistem Gereksinimleri](#sistem-gereksinimleri)
2. [Kurulum Adımları](#kurulum-adımları)
3. [İlk Çalıştırma](#ilk-çalıştırma)
4. [Ağ Üzerinden Erişim](#ağ-üzerinden-erişim)
5. [Sorun Giderme](#sorun-giderme)

---

## 📌 SİSTEM GEREKSİNİMLERİ

### Zorunlu:
- ✅ **Windows 10/11** veya **macOS** veya **Linux**
- ✅ **Node.js** (v18 veya üzeri)
- ✅ **4 GB RAM** (minimum)
- ✅ **500 MB Disk Alanı**
- ✅ **Modern Web Tarayıcı** (Chrome, Firefox, Edge)

### Opsiyonel:
- 📧 SMTP e-posta sunucusu (e-posta göndermek için)
- 🌐 Sabit IP adresi (ağ üzerinden erişim için)

---

## 🔧 KURULUM ADIMLARI

### 1️⃣ Node.js Kurulumu

#### **Windows:**
1. https://nodejs.org/tr adresine gidin
2. **LTS (Önerilen)** sürümü indirin
3. İndirilen dosyayı çalıştırın ve kurulumu tamamlayın
4. Kurulum tamamlandığında **CMD** veya **PowerShell** açın
5. Şu komutu çalıştırarak kontrol edin:
   ```bash
   node --version
   npm --version
   ```

#### **macOS:**
```bash
# Homebrew ile kurulum
brew install node
```

#### **Linux (Ubuntu/Debian):**
```bash
# NodeSource deposundan kurulum
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

---

### 2️⃣ Proje Dosyalarını Kopyalama

#### **Yöntem 1: USB ile Kopyalama**
1. Bu klasörü (`periyodik-muayene`) **USB belleğe** kopyalayın
2. USB'yi hedef bilgisayara takın
3. Klasörü istediğiniz konuma yapıştırın (örn: `C:\Projeler\periyodik-muayene`)

#### **Yöntem 2: Ağ Üzerinden Kopyalama**
```bash
# Windows'ta paylaşımlı klasör oluşturun
# Hedef bilgisayardan ağ konumuna gidin ve kopyalayın
```

#### **Yöntem 3: Git ile (Eğer Git repository varsa)**
```bash
git clone [repository-url]
cd periyodik-muayene
```

---

### 3️⃣ Bağımlılıkların Yüklenmesi

1. **Komut İstemi** (CMD) veya **Terminal** açın
2. Proje klasörüne gidin:
   ```bash
   cd C:\Projeler\periyodik-muayene
   ```
3. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```
4. Kurulum tamamlanana kadar bekleyin (yaklaşık 2-3 dakika)

---

## 🚀 İLK ÇALIŞTIRMA

### Windows'ta Çalıştırma:

#### **Yöntem 1: Çift tıklama ile (Kolay)**
1. `basla.bat` dosyasına çift tıklayın
2. Siyah bir pencere açılacak
3. "Server çalışıyor" mesajını görene kadar bekleyin
4. Tarayıcınızda şu adresi açın: **http://localhost:3001**

#### **Yöntem 2: Komut satırı ile**
```bash
cd C:\Projeler\periyodik-muayene
node server.js
```

### macOS / Linux'ta Çalıştırma:
```bash
cd /path/to/periyodik-muayene
npm start
```

---

## 🌐 AĞ ÜZERİNDEN ERİŞİM

### Aynı Ağdaki Diğer Bilgisayarlardan Erişim:

1. **Sunucu bilgisayarın IP adresini öğrenin:**

   **Windows:**
   ```bash
   ipconfig
   ```
   "IPv4 Adresi" yazan yere bakın (örn: `192.168.1.100`)

   **macOS / Linux:**
   ```bash
   ifconfig
   # veya
   ip addr show
   ```

2. **Server başladığında IP adresini göreceksiniz:**
   ```
   🚀 PERİYODİK MUAYENE YÖNETİM SİSTEMİ
   ===========================================
   ✅ Server çalışıyor:
      📍 Yerel: http://localhost:3001
      📍 Ağ: http://192.168.1.100:3001
   ```

3. **Diğer bilgisayarlardan erişim:**
   - Aynı ağdaki başka bir bilgisayardan tarayıcıyı açın
   - Ağ adresini girin: `http://192.168.1.100:3001`
   - Giriş bilgileri:
     - **Kullanıcı Adı:** `admin`
     - **Şifre:** `admin123`

### Güvenlik Duvarı Ayarları (Windows):

Eğer başka bilgisayarlardan erişim sağlanamıyorsa:

1. **Başlat** menüsünde "Windows Defender Güvenlik Duvarı" yazın
2. "Gelişmiş ayarlar"a tıklayın
3. Sol tarafta "Gelen Kurallar"a tıklayın
4. Sağ tarafta "Yeni Kural..."a tıklayın
5. "Bağlantı noktası" seçin, İleri
6. "TCP" seçin, "Belirli yerel bağlantı noktaları" seçin, `3001` yazın
7. "Bağlantıya izin ver" seçin
8. Tüm profiller için işaretleyin (Etki Alanı, Özel, Genel)
9. Kural adı: `Periyodik Muayene Sistemi`
10. Bitir

---

## 🔐 GİRİŞ BİLGİLERİ

**Varsayılan Kullanıcı Bilgileri:**
- **Kullanıcı Adı:** `admin`
- **Şifre:** `admin123`

⚠️ **Önemli:** İlk girişten sonra şifreyi değiştirin!

---

## 📁 DOSYA YAPISI

```
periyodik-muayene/
│
├── server.js              # Ana sunucu dosyası ⭐
├── database.json          # Veritabanı (TÜM VERİLER) 💾
├── package.json           # NPM bağımlılıkları
├── basla.bat             # Windows başlatma scripti
│
├── public/
│   ├── index.html        # Ana HTML sayfası
│   ├── app.js            # Frontend JavaScript
│   └── style.css         # Tasarım dosyası
│
├── auth.js               # Kimlik doğrulama
├── emailService.js       # E-posta servisi
└── node_modules/         # Yüklü paketler
```

---

## 🛠️ SORUN GİDERME

### ❌ "node komutu tanınmıyor" hatası:
**Çözüm:** Node.js'i yükleyin ve bilgisayarı yeniden başlatın.

### ❌ "Port 3001 zaten kullanımda" hatası:
**Çözüm 1:** Çalışan server'ı kapatın:
```bash
# Windows
taskkill /F /IM node.exe

# macOS / Linux
killall node
```

**Çözüm 2:** Farklı port kullanın (server.js'de PORT değişkenini değiştirin)

### ❌ "ENOENT: database.json bulunamadı" hatası:
**Çözüm:** `database.json` dosyasının proje klasöründe olduğundan emin olun.

### ❌ Başka bilgisayardan erişim sağlanamıyor:
1. Güvenlik duvarı ayarlarını kontrol edin
2. Her iki bilgisayar aynı ağda mı kontrol edin
3. IP adresini doğru girdiğinizden emin olun
4. Server çalışıyor mu kontrol edin

### ❌ "npm install" hatası:
**Çözüm:**
```bash
# Cache'i temizleyin
npm cache clean --force
# Tekrar deneyin
npm install
```

---

## 📱 MOBİL CİHAZLARDAN ERİŞİM

Aynı Wi-Fi ağındaki **telefon veya tablet**'lerden de erişebilirsiniz:

1. Sunucu bilgisayarın IP adresini öğrenin
2. Telefon/tablet'inizin tarayıcısını açın
3. Adresi girin: `http://192.168.1.100:3001`
4. Giriş yapın ve kullanın

---

## 💾 YEDEKLERİ KORUMA

### Önemli Dosyalar (Yedeklenmeli):
- ✅ **database.json** - TÜM VERİLERİNİZ BURADA!
- ✅ **auth.json** - Kullanıcı bilgileri
- ✅ **output/** klasörü - Oluşturulan PDF dosyaları

### Yedekleme Önerisi:
Her gün sonunda `database.json` dosyasını başka bir konuma kopyalayın:
```bash
# Windows
copy database.json C:\Yedekler\database-%date%.json

# macOS / Linux
cp database.json ~/Yedekler/database-$(date +%Y%m%d).json
```

---

## 🎯 SONRAKI ADIMLAR

1. ✅ Sistemi başlatın
2. ✅ `http://localhost:3001` adresine gidin
3. ✅ `admin` / `admin123` ile giriş yapın
4. ✅ Firma bilgilerini güncelleyin (Ayarlar > Firma Bilgileri)
5. ✅ Personel bilgilerini ekleyin (Ayarlar > Personel Yönetimi)
6. ✅ Müşterilerinizi ekleyin
7. ✅ İlk teklifi oluşturun!

---

## 📞 DESTEK

Sorun yaşarsanız:
1. Server loglarını kontrol edin: `server.log` dosyasını açın
2. Tarayıcı Console'unu açın (F12 tuşu)
3. Hata mesajlarını kaydedin

---

## ⚡ HIZLI BAŞLATMA (ÖZET)

```bash
# 1. Proje klasörüne git
cd periyodik-muayene

# 2. İlk seferinde bağımlılıkları yükle
npm install

# 3. Server'ı başlat
node server.js

# 4. Tarayıcıda aç
# http://localhost:3001

# 5. Giriş yap
# Kullanıcı: admin
# Şifre: admin123
```

---

**✅ Sistem Hazır! Başarılar dileriz!** 🎉
