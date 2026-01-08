const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return salt + ':' + hash;
}

async function main() {
    console.log('Seed başlıyor...\n');

    // 1. KATEGORİLER
    console.log('Kategoriler oluşturuluyor...');
    const kategoriler = [
        { ad: 'İŞ HİJYENİ ÖLÇÜM (ORTAM ÖLÇÜM)', sira: 1 },
        { ad: 'ELEKTRİKSEL KONTROLLER', sira: 2 },
        { ad: 'BASINÇLI KAPLAR KONTROLLERİ', sira: 3 },
        { ad: 'KALDIRMA İLETME ARAÇLARI KONTROLLERİ', sira: 4 },
        { ad: 'DİĞER KONTROLLER', sira: 5 },
        { ad: 'MEKANİK TESİSAT KONTROLLERİ', sira: 6 }
    ];

    // Önce mevcut kategorileri sil
    await prisma.teklifDetay.deleteMany({});
    await prisma.teklif.deleteMany({});
    await prisma.hizmet.deleteMany({});
    await prisma.kategori.deleteMany({});

    const katMap = {};
    for (const kat of kategoriler) {
        const created = await prisma.kategori.create({ data: kat });
        katMap[kat.sira] = created.id;
    }
    console.log('✅ ' + kategoriler.length + ' kategori oluşturuldu\n');

    // 2. HİZMETLER
    console.log('Hizmetler oluşturuluyor...');
    const hizmetler = [
        // İŞ HİJYENİ (kategoriId: 1, akpireditasyon: true)
        { kod: 'IH001', ad: 'İç Ortam Toz Ölçümü', metodKapsam: 'MDHS 14/3 - Grav. metod ile toplam toz tayini', birim: 'Nokta', kategoriId: katMap[1], akpireditasyon: true, sira: 1 },
        { kod: 'IH002', ad: 'Kişisel Maruziyet Toz Ölçümü', metodKapsam: 'MDHS 14/3 - Grav. metod ile toplam toz tayini', birim: 'Adet', kategoriId: katMap[1], akpireditasyon: true, sira: 2 },
        { kod: 'IH003', ad: 'İç Ortam Aydınlatma Ölçümü', metodKapsam: 'COHSR-928-1-IPG-039 - İş Yerindeki Aydınlatma/Işık Şiddeti Düzeyinin Ölçümü', birim: 'Adet', kategoriId: katMap[1], akpireditasyon: true, sira: 3 },
        { kod: 'IH004', ad: 'Termal Konfor Ölçümü', metodKapsam: 'TS EN ISO 7730, TS EN ISO 7243 - Çalışan ortamında sıcaklık ve nem miktarlarının tespiti', birim: 'Nokta', kategoriId: katMap[1], akpireditasyon: true, sira: 4 },
        { kod: 'IH005', ad: 'İç Ortam Gürültü Ölçümü', metodKapsam: 'TS ISO 1996-2 - Ses Basınç Seviyelerinin Tayini', birim: 'Nokta', kategoriId: katMap[1], akpireditasyon: true, sira: 5 },
        { kod: 'IH006', ad: 'Kişisel Maruziyet Gürültü', metodKapsam: 'TS EN ISO 9612 - Çalışanın maruz kaldığı toplam gürültü miktarının tespiti', birim: 'Adet', kategoriId: katMap[1], akpireditasyon: true, sira: 6 },
        { kod: 'IH007', ad: 'Ortamda Toksik Gaz ve Buhar Tayini', metodKapsam: 'ASTM 4490-96 - Örnekleme ve Ölçüm: Dedektör Tüple Anlık Ölçüm', birim: 'Nokta', kategoriId: katMap[1], akpireditasyon: true, sira: 7 },
        { kod: 'IH008', ad: 'El-Kol Titreşim Maruziyet Ölçümü', metodKapsam: 'TS EN ISO 5349-1, TS EN ISO 5349-2 - Mekanik Titreşim Ölçümü', birim: 'Adet', kategoriId: katMap[1], akpireditasyon: true, sira: 8 },
        { kod: 'IH009', ad: 'Tüm Vücut Titreşim Maruziyet Ölçümü', metodKapsam: 'TS ISO 2631-1 - Mekanik Titreşim, Tüm vücudun titreşim maruz kalma durumu', birim: 'Adet', kategoriId: katMap[1], akpireditasyon: true, sira: 9 },

        // ELEKTRİKSEL (kategoriId: 2)
        { kod: 'EL001', ad: 'Elektrik Topraklama, Cihaz Gövde Topraklama Ölçümü', standartYonetmelik: 'Elektrik Tesislerinde Topraklamalar Yönetmeliği, TS EN 61557-1', birim: 'Adet', kategoriId: katMap[2], sira: 1 },
        { kod: 'EL002', ad: 'Elektrik Tesisatı Kontrolü', standartYonetmelik: 'Elektrik İç Tesisleri Yönetmeliği', birim: 'Adet', kategoriId: katMap[2], sira: 2 },
        { kod: 'EL003', ad: 'Paratoner Ölçümü', standartYonetmelik: 'TS EN 62305-1, TS EN 62305-3', birim: 'Adet', kategoriId: katMap[2], sira: 3 },
        { kod: 'EL004', ad: 'Kaçak Akım Rolesi Testi', standartYonetmelik: 'TS EN 61557-6', birim: 'Adet', kategoriId: katMap[2], sira: 4 },
        { kod: 'EL005', ad: 'Jeneratör Kontrolü', standartYonetmelik: 'İş Ekipmanları Yönetmeliği', birim: 'Adet', kategoriId: katMap[2], sira: 5 },

        // BASINÇLI KAPLAR (kategoriId: 3)
        { kod: 'BK001', ad: 'Buhar Kazanı', standartYonetmelik: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği', birim: 'Adet', kategoriId: katMap[3], sira: 1 },
        { kod: 'BK002', ad: 'Kalorifer Kazanı', standartYonetmelik: 'İş Ekipmanları Yönetmeliği', birim: 'Adet', kategoriId: katMap[3], sira: 2 },
        { kod: 'BK003', ad: 'Kızgın Yağ Kazanı', standartYonetmelik: 'İş Ekipmanları Yönetmeliği', birim: 'Adet', kategoriId: katMap[3], sira: 3 },
        { kod: 'BK004', ad: 'Kızgın Su Kazanı', standartYonetmelik: 'İş Ekipmanları Yönetmeliği', birim: 'Adet', kategoriId: katMap[3], sira: 4 },
        { kod: 'BK005', ad: 'Kompresör ve Hava Tankı', standartYonetmelik: 'İş Ekipmanları Yönetmeliği', birim: 'Adet', kategoriId: katMap[3], sira: 5 },
        { kod: 'BK006', ad: 'Hidrofor Tankı', standartYonetmelik: 'İş Ekipmanları Yönetmeliği', birim: 'Adet', kategoriId: katMap[3], sira: 6 },
        { kod: 'BK007', ad: 'Genleşme Tankı', standartYonetmelik: 'İş Ekipmanları Yönetmeliği', birim: 'Adet', kategoriId: katMap[3], sira: 7 },
        { kod: 'BK008', ad: 'Boyler Tankı', standartYonetmelik: 'İş Ekipmanları Yönetmeliği', birim: 'Adet', kategoriId: katMap[3], sira: 8 },

        // KALDIRMA İLETME (kategoriId: 4)
        { kod: 'KI001', ad: 'Gezer Köprülü Vinç', standartYonetmelik: 'İş Ekipmanları Yönetmeliği, TS ISO 9927-1, TS ISO 12480-1', birim: 'Adet', kategoriId: katMap[4], sira: 1 },
        { kod: 'KI002', ad: 'Portal Vinç', standartYonetmelik: 'İş Ekipmanları Yönetmeliği', birim: 'Adet', kategoriId: katMap[4], sira: 2 },
        { kod: 'KI003', ad: 'Monoray Vinç', standartYonetmelik: 'İş Ekipmanları Yönetmeliği', birim: 'Adet', kategoriId: katMap[4], sira: 3 },
        { kod: 'KI004', ad: 'Pergel Vinç', standartYonetmelik: 'İş Ekipmanları Yönetmeliği', birim: 'Adet', kategoriId: katMap[4], sira: 4 },
        { kod: 'KI005', ad: 'Gırgır Vinç', standartYonetmelik: 'İş Ekipmanları Yönetmeliği', birim: 'Adet', kategoriId: katMap[4], sira: 5 },
        { kod: 'KI006', ad: 'Kule Vinç', standartYonetmelik: 'İş Ekipmanları Yönetmeliği', birim: 'Adet', kategoriId: katMap[4], sira: 6 },
        { kod: 'KI007', ad: 'Mobil Vinç', standartYonetmelik: 'İş Ekipmanları Yönetmeliği', birim: 'Adet', kategoriId: katMap[4], sira: 7 },
        { kod: 'KI008', ad: 'Caraskal', standartYonetmelik: 'İş Ekipmanları Yönetmeliği', birim: 'Adet', kategoriId: katMap[4], sira: 8 },
        { kod: 'KI009', ad: 'Forklift', standartYonetmelik: 'TS ISO 1074, TS 10201 ISO 3184', birim: 'Adet', kategoriId: katMap[4], sira: 9 },
        { kod: 'KI010', ad: 'Transpalet', standartYonetmelik: 'İş Ekipmanları Yönetmeliği', birim: 'Adet', kategoriId: katMap[4], sira: 10 },
        { kod: 'KI011', ad: 'Araç Kaldırma Lifti', standartYonetmelik: 'TS EN 1493, TS EN 1494+A1', birim: 'Adet', kategoriId: katMap[4], sira: 11 },
        { kod: 'KI012', ad: 'Platform', standartYonetmelik: 'TS EN 280+A1', birim: 'Adet', kategoriId: katMap[4], sira: 12 },
        { kod: 'KI013', ad: 'Yük Asansörü', standartYonetmelik: 'TS EN 81-3+A1', birim: 'Adet', kategoriId: katMap[4], sira: 13 },
        { kod: 'KI014', ad: 'Sapan', standartYonetmelik: 'TS EN 818-6+A1', birim: 'Adet', kategoriId: katMap[4], sira: 14 },

        // DİĞER KONTROLLER (kategoriId: 5)
        { kod: 'DK001', ad: 'İş Makinesi', standartYonetmelik: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği', birim: 'Adet', kategoriId: katMap[5], sira: 1 },
        { kod: 'DK002', ad: 'Makine Tezgah', standartYonetmelik: 'İş Ekipmanları Yönetmeliği', birim: 'Adet', kategoriId: katMap[5], sira: 2 },
        { kod: 'DK003', ad: 'Yangın Tüpü', standartYonetmelik: 'TS 862, TS EN 3', birim: 'Adet', kategoriId: katMap[5], sira: 3 },
        { kod: 'DK004', ad: 'Skreyper', standartYonetmelik: 'İş Ekipmanları Yönetmeliği', birim: 'Adet', kategoriId: katMap[5], sira: 4 },
        { kod: 'DK005', ad: 'Endüstriyel Raf', standartYonetmelik: 'İş Ekipmanları Yönetmeliği', birim: 'Adet', kategoriId: katMap[5], sira: 5 },
        { kod: 'DK006', ad: 'Endüstriyel Kapı', standartYonetmelik: 'İş Ekipmanları Yönetmeliği', birim: 'Adet', kategoriId: katMap[5], sira: 6 },
        { kod: 'DK007', ad: 'Yangın Algılama Sistemi', standartYonetmelik: 'İş Ekipmanları Yönetmeliği', birim: 'Adet', kategoriId: katMap[5], sira: 7 },

        // MEKANİK TESİSAT (kategoriId: 6)
        { kod: 'MT001', ad: 'Yangın Tesisatı', standartYonetmelik: 'İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği', birim: 'Adet', kategoriId: katMap[6], sira: 1 },
        { kod: 'MT002', ad: 'Havalandırma Tesisatı', standartYonetmelik: 'İş Ekipmanları Yönetmeliği', birim: 'Adet', kategoriId: katMap[6], sira: 2 },
        { kod: 'MT003', ad: 'Klima Tesisatı', standartYonetmelik: 'İş Ekipmanları Yönetmeliği', birim: 'Adet', kategoriId: katMap[6], sira: 3 }
    ];

    for (const hizmet of hizmetler) {
        await prisma.hizmet.create({ data: hizmet });
    }
    console.log('✅ ' + hizmetler.length + ' hizmet oluşturuldu\n');

    // 3. ÖNDER MUAYENE FİRMA AYARLARI
    console.log('ÖNDER MUAYENE firma ayarları oluşturuluyor...');
    await prisma.firmaAyarlari.upsert({
        where: { id: 1 },
        update: {},
        create: {
            name: 'ÖNDER MUAYENE',
            yetkili: 'ABDULVAHAP ÖNDER',
            yetkiliUnvan: 'ŞİRKET MÜDÜRÜ',
            adres: 'Fetih Mahallesi Aslanlı Kışla Caddesi No:144S/1 Karatay/KONYA',
            telefon: '0332 300 00 20',
            email: 'info@ondermuayene.com.tr',
            vergiNo: '1234567890',
            vergiDairesi: 'Meram',
            bankaAdi: 'Ziraat Bankası',
            bankaSube: 'Buğday Pazarı / Konya',
            iban: 'TR80 0001 0025 2894 1001 5650 01',
            mahkemeYeri: 'Konya Mahkemeleri',
            muhur: '/images/muhur.png',
            imza: '/images/imza.png',
            logo: '/images/logo.png',
            genelSartlar: `1. Teklifte belirtilen fiyatlar KDV hariçtir.
2. Teklif geçerlilik süresi 30 gündür.
3. Ödeme, muayene sonrası 15 gün içinde yapılacaktır.
4. Muayene raporları yasal süreler içinde teslim edilecektir.
5. Muayene sırasında ekipmanın çalışır durumda olması gerekmektedir.`,
            teklifUstYazi: `Sayın Firma Yetkilisi;

Tarafımızdan talep etmiş olduğunuz ölçümlere ait fiyat teklifimiz ve ölçümlerde kullanılacak metotlar ekte bilginize sunulmuştur.

Firmamıza göstermiş olduğunuz ilgi ve güvene teşekkür eder, teklifimizin uygun bulunacağını umar, iyi çalışmalar dileriz.

Akredite kapsamında yapılan ölçümler, İŞ HİJYENİ(ORTAM ÖLÇÜMÜ) parametreleri ile yapılan ölçümlerdir.

                                                                                                                                                         Saygılarımızla
                                                                                                                                                    ABDULVAHAP ÖNDER
                                                                                                                                                      ŞİRKET MÜDÜRÜ`
        }
    });
    console.log('✅ ÖNDER MUAYENE firma ayarları oluşturuldu\n');

    // 4. KULLANICILAR
    console.log('Kullanıcılar oluşturuluyor...');

    await prisma.user.upsert({
        where: { email: 'admin@ondermuayene.com.tr' },
        update: {},
        create: {
            email: 'admin@ondermuayene.com.tr',
            password: hashPassword('Onder123'),
            plainPassword: 'Onder123',
            name: 'Abdulvahap Önder',
            role: 'admin',
            isActive: true,
            emailVerified: true
        }
    });
    console.log('✅ Admin: admin@ondermuayene.com.tr / Onder123');

    await prisma.user.upsert({
        where: { email: 'tekniker@ondermuayene.com.tr' },
        update: {},
        create: {
            email: 'tekniker@ondermuayene.com.tr',
            password: hashPassword('Tekniker123'),
            plainPassword: 'Tekniker123',
            name: 'Ahmet Yılmaz',
            role: 'tekniker',
            isActive: true,
            emailVerified: true
        }
    });
    console.log('✅ Tekniker: tekniker@ondermuayene.com.tr / Tekniker123');

    // 5. ÖRNEK MÜŞTERİLER
    console.log('\nÖrnek müşteriler oluşturuluyor...');
    const musteriler = [
        { unvan: 'PEMA KOLEJİ', vergiNo: '1234567890', adres: 'KONYA', telefon: '-', email: '-', yetkili: '-' },
        { unvan: 'ABC Makina San. Tic. Ltd. Şti.', vergiNo: '9876543210', adres: 'OSB 1. Cadde No:15 Konya', telefon: '0332 111 22 33', email: 'info@abcmakina.com', yetkili: 'Mehmet Demir' },
        { unvan: 'XYZ Metal Sanayi A.Ş.', vergiNo: '5555666677', adres: 'Organize Sanayi Bölgesi Konya', telefon: '0332 222 33 44', email: 'info@xyzmetal.com', yetkili: 'Ali Yıldız' },
    ];

    for (const musteri of musteriler) {
        const existing = await prisma.customer.findFirst({ where: { unvan: musteri.unvan } });
        if (!existing) {
            await prisma.customer.create({ data: musteri });
        }
    }
    console.log('✅ Müşteriler oluşturuldu');

    console.log('\n========================================');
    console.log('SEED TAMAMLANDI!');
    console.log('========================================');
    console.log('\nGiriş Bilgileri:');
    console.log('----------------------------------------');
    console.log('Admin: admin@ondermuayene.com.tr / Onder123');
    console.log('Tekniker: tekniker@ondermuayene.com.tr / Tekniker123');
    console.log('----------------------------------------\n');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
