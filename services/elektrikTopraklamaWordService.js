/**
 * Elektrik Topraklama Raporu Word Oluşturma Servisi
 * Etiket bazlı akıllı değiştirme + CHECKBOX DESTEĞİ
 *
 * @version 2.0 - Checkbox entegrasyonu eklendi
 */

const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, '../templates/elektrik/FR7.2.36 Elektrik Topraklama Ölçüm Raporu şablon.docx');

// ============ YARDIMCI FONKSİYONLAR ============

/**
 * Tarihi Türkçe formata çevir
 */
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Tarih ve saat formatı
 */
function formatDateTime(dateStr, time = '09:00') {
    if (!dateStr) return '-';
    return `${formatDate(dateStr)} / ${time}`;
}

/**
 * Bir sonraki yıl tarihini hesapla
 */
function getNextYearDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    date.setFullYear(date.getFullYear() + 1);
    return formatDate(date);
}

/**
 * XML için özel karakterleri escape et
 */
function escapeXml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// ============ HÜCRE İŞLEMLERİ ============

/**
 * Hücreye metin yaz - mevcut içeriği değiştirerek
 */
function writeToCell(cellXml, newText) {
    const escapedText = escapeXml(newText || '-');

    if (!/<w:t[ >]/.test(cellXml)) {
        if (/<w:pPr>[\s\S]*?<\/w:pPr>/.test(cellXml)) {
            return cellXml.replace(
                /(<\/w:pPr>)/,
                `$1<w:r><w:t xml:space="preserve">${escapedText}</w:t></w:r>`
            );
        }
        return cellXml.replace(
            /(<\/w:p>)/,
            `<w:r><w:t xml:space="preserve">${escapedText}</w:t></w:r>$1`
        );
    }

    let firstReplaced = false;
    return cellXml.replace(/<w:t([^>]*)>([^<]*)<\/w:t>/g, (match, attrs, oldText) => {
        if (!firstReplaced) {
            firstReplaced = true;
            return `<w:t xml:space="preserve">${escapedText}</w:t>`;
        }
        return '<w:t></w:t>';
    });
}

/**
 * Satırdaki tüm metni birleştir
 */
function getRowText(rowXml) {
    const matches = rowXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
    return matches.map(t => t.replace(/<[^>]+>/g, '')).join('').trim();
}

/**
 * Hücredeki metni al
 */
function getCellText(cellXml) {
    const matches = cellXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
    return matches.map(t => t.replace(/<[^>]+>/g, '')).join('').trim();
}

// ============ ETİKET BAZLI DEĞİŞTİRME ============

/**
 * Belirli bir etiketin yanındaki (sağındaki) hücreye değer yaz
 */
function setValueByLabel(xml, labelText, newValue) {
    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    const rows = xml.match(rowRegex) || [];
    let result = xml;

    for (const row of rows) {
        const rowText = getRowText(row);

        if (!rowText.includes(labelText)) continue;

        const cellRegex = /<w:tc[^>]*>[\s\S]*?<\/w:tc>/g;
        const cells = row.match(cellRegex) || [];

        for (let i = 0; i < cells.length; i++) {
            const cellText = getCellText(cells[i]).trim();

            if (cellText.includes(labelText)) {
                if (i + 1 < cells.length) {
                    const newCell = writeToCell(cells[i + 1], newValue);
                    const newRow = row.replace(cells[i + 1], newCell);
                    result = result.replace(row, newRow);
                    return result;
                }
            }
        }
    }

    return result;
}

// ============ CHECKBOX FONKSİYONLARI ============

/**
 * Checkbox'ı işaretle veya işareti kaldır
 * Label'a göre doğru checkbox'ı bulur - HIZLI VERSİYON
 * NOT: Word'de hem w:default hem w:checked gerekli!
 */
function setCheckboxByLabel(xml, label, checked = true) {
    // Label'ı bul
    const labelIndex = xml.indexOf(label);
    if (labelIndex === -1) return xml;

    // Label'dan geriye doğru en yakın checkbox'ı bul (max 2000 karakter)
    const searchStart = Math.max(0, labelIndex - 2000);
    const searchArea = xml.substring(searchStart, labelIndex);

    // Son <w:checkBox> bloğunu bul
    const checkboxPattern = /<w:checkBox>[\s\S]*?<\/w:checkBox>/g;
    let lastMatch = null;
    let match;

    while ((match = checkboxPattern.exec(searchArea)) !== null) {
        lastMatch = match;
    }

    if (!lastMatch) return xml;

    const absolutePos = searchStart + lastMatch.index;
    const oldCheckbox = lastMatch[0];

    // Yeni checkbox oluştur
    let newCheckbox;
    if (checked) {
        // İşaretli: w:checked ekle ve w:default="1" yap
        newCheckbox = oldCheckbox
            .replace(/<w:default w:val="[01]"/, '<w:default w:val="1"')
            .replace(/<\/w:checkBox>/, '<w:checked/></w:checkBox>');

        // Eğer zaten w:checked varsa duplike etme
        if (oldCheckbox.includes('<w:checked')) {
            newCheckbox = oldCheckbox.replace(/<w:default w:val="[01]"/, '<w:default w:val="1"');
        }
    } else {
        // İşaretsiz: w:checked kaldır ve w:default="0" yap
        newCheckbox = oldCheckbox
            .replace(/<w:default w:val="[01]"/, '<w:default w:val="0"')
            .replace(/<w:checked\s*\/?>/g, '');
    }

    return xml.substring(0, absolutePos) + newCheckbox + xml.substring(absolutePos + oldCheckbox.length);
}

/**
 * Context bazlı checkbox işaretleme
 * Aynı satırda birden fazla "Var/Yok" olduğunda doğru olanı bulmak için
 */
function setCheckboxInContext(xml, contextLabel, checkboxLabel, checked = true) {
    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    const rows = xml.match(rowRegex) || [];

    for (const row of rows) {
        if (!row.includes(contextLabel)) continue;

        const updatedRow = setCheckboxByLabel(row, checkboxLabel, checked);

        if (updatedRow !== row) {
            return xml.replace(row, updatedRow);
        }
    }

    return xml;
}

/**
 * Şebeke tipi checkbox'larını ayarla
 */
function setSebekeTipi(xml, sebekeTipi) {
    if (!sebekeTipi) return xml;

    const tipler = ['TT', 'IT', 'TN-CS', 'TN-C', 'TN-S', 'TN'];

    // Önce hepsini temizle
    for (const tip of tipler) {
        xml = setCheckboxByLabel(xml, tip, false);
    }

    // Seçileni işaretle
    xml = setCheckboxByLabel(xml, sebekeTipi, true);

    return xml;
}

/**
 * Var/Yok tipindeki checkbox'ları ayarla
 */
function setVarYokCheckbox(xml, contextLabel, value) {
    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    const rows = xml.match(rowRegex) || [];

    for (const row of rows) {
        if (!row.includes(contextLabel)) continue;

        let updatedRow = row;
        updatedRow = setCheckboxByLabel(updatedRow, 'Var', value === true);
        updatedRow = setCheckboxByLabel(updatedRow, 'Yok', value === false);

        if (updatedRow !== row) {
            return xml.replace(row, updatedRow);
        }
    }

    return xml;
}

/**
 * Ölçüm metodunu ayarla
 */
function setOlcumMetodu(xml, metod) {
    if (!metod) return xml;

    // Önce hepsini temizle
    xml = setCheckboxByLabel(xml, 'Çevrim empedansı', false);
    xml = setCheckboxByLabel(xml, '3 Uçlu topraklama', false);
    xml = setCheckboxByLabel(xml, 'Klamp metodu', false);

    // Seçileni işaretle
    switch (metod.toLowerCase()) {
        case 'cevrim':
        case 'çevrim':
            xml = setCheckboxByLabel(xml, 'Çevrim empedansı', true);
            break;
        case '3uclu':
        case 'uclu':
            xml = setCheckboxByLabel(xml, '3 Uçlu topraklama', true);
            break;
        case 'klamp':
        case 'clamp':
            xml = setCheckboxByLabel(xml, 'Klamp metodu', true);
            break;
    }

    return xml;
}

/**
 * Yapı cinsini ayarla
 */
function setYapiCinsi(xml, yapiCinsi) {
    if (!yapiCinsi) return xml;

    // Önce hepsini temizle
    xml = setCheckboxByLabel(xml, 'Ev', false);
    xml = setCheckboxByLabel(xml, 'Ticari', false);
    xml = setCheckboxByLabel(xml, 'Endüstri', false);
    xml = setCheckboxByLabel(xml, 'Diğer', false);

    // Seçileni işaretle
    const yapiMap = {
        'ev': 'Ev',
        'ticari': 'Ticari',
        'endustri': 'Endüstri',
        'endüstri': 'Endüstri',
        'diger': 'Diğer',
        'diğer': 'Diğer'
    };

    const labelToMark = yapiMap[yapiCinsi.toLowerCase()] || yapiCinsi;
    xml = setCheckboxByLabel(xml, labelToMark, true);

    return xml;
}

/**
 * Topraklayıcı tipini ayarla
 */
function setTopraklayiciTipi(xml, tip) {
    if (!tip) return xml;

    const tipler = ['Ring', 'Yüzeysel', 'Temel', 'Derin', 'Belirlenemedi'];

    // Önce hepsini temizle
    for (const t of tipler) {
        xml = setCheckboxByLabel(xml, t, false);
    }

    // Seçileni işaretle
    xml = setCheckboxByLabel(xml, tip, true);

    return xml;
}

/**
 * Kontrol nedenini ayarla
 */
function setKontrolNedeni(xml, neden) {
    if (!neden) return xml;

    // Önce ikisini de temizle
    xml = setCheckboxByLabel(xml, 'Periyodik Kontrol', false);
    xml = setCheckboxByLabel(xml, 'İlk Kontrol', false);

    if (neden.toLowerCase().includes('periyodik')) {
        xml = setCheckboxByLabel(xml, 'Periyodik Kontrol', true);
    } else if (neden.toLowerCase().includes('ilk')) {
        xml = setCheckboxByLabel(xml, 'İlk Kontrol', true);
    }

    return xml;
}

/**
 * Dolaylı dokunmaya karşı koruma önlemini ayarla
 */
function setKorumaOnlemi(xml, onlem) {
    if (!onlem) return xml;

    const onlemler = [
        { key: 'espotansiyel', label: 'Eşpotansiyel topraklama ve beslemenin otomatik kesilmesi' },
        { key: 'yalitma', label: 'Koruyucu yalıtma' },
        { key: 'ayirma', label: 'Koruyucu ayırma' },
        { key: 'kucuk', label: 'Küçük gerilim' }
    ];

    // Hepsini temizle
    for (const o of onlemler) {
        xml = setCheckboxByLabel(xml, o.label, false);
    }

    // Eşleşeni işaretle
    const onlemLower = onlem.toLowerCase();
    for (const o of onlemler) {
        if (onlemLower.includes(o.key)) {
            xml = setCheckboxByLabel(xml, o.label, true);
            break;
        }
    }

    return xml;
}

/**
 * Tüm checkbox'ları doldur - YENİ VERSİYON
 */
function fillAllCheckboxes(xml, rapor, options = {}) {
    let result = xml;
    // options öncelikli, rapor fallback
    const get = (key) => options[key] !== undefined ? options[key] : rapor[key];

    // 1. ŞEBEKE TİPİ
    const sTipi = get('sistemTipi');
    if (sTipi) {
        result = setSebekeTipi(result, String(sTipi).toUpperCase().replace('TN-C-S', 'TN-CS'));
    }

    // 2. KONTROL NEDENİ
    result = setKontrolNedeni(result, get('kontrolNedeni') || 'periyodik');

    // 3. TESİSE AİT PROJE VAR MI?
    const projeVar = get('projeVar');
    if (projeVar !== undefined && projeVar !== null) {
        result = setVarYokCheckbox(result, 'Tesise ait proje var mı', projeVar);
    }

    // 4. TEK HAT ŞEMASI VAR MI?
    const tekHat = get('tekHatSemasiVar');
    if (tekHat !== undefined && tekHat !== null) {
        result = setVarYokCheckbox(result, 'Tek hat şeması var mı', tekHat);
    }

    // 5. YAPI CİNSİ (ayrı ayrı checkbox'lar olarak geliyor)
    if (get('yapiEv')) result = setCheckboxByLabel(result, 'Ev', true);
    if (get('yapiTicari')) result = setCheckboxByLabel(result, 'Ticari', true);
    if (get('yapiEndustri')) result = setCheckboxByLabel(result, 'Endüstri', true);
    if (get('yapiDiger')) result = setCheckboxByLabel(result, 'Diğer', true);
    // Eski format için de destek
    if (options.yapiCinsi) {
        result = setYapiCinsi(result, options.yapiCinsi);
    }

    // 6. TOPRAKLAYICI TİPİ
    if (get('toprakRing')) result = setCheckboxByLabel(result, 'Ring', true);
    if (get('toprakYuzeysel')) result = setCheckboxByLabel(result, 'Yüzeysel', true);
    if (get('toprakTemel')) result = setCheckboxByLabel(result, 'Temel', true);
    if (get('toprakDerin')) result = setCheckboxByLabel(result, 'Derin', true);
    if (get('toprakBelirlenemedi')) result = setCheckboxByLabel(result, 'Belirlenemedi', true);

    // 7. KORUMA ÖNLEMİ
    if (get('korumaEspotansiyel')) {
        result = setCheckboxByLabel(result, 'Eşpotansiyel topraklama ve beslemenin otomatik kesilmesi', true);
    }
    if (get('korumaYalitma')) result = setCheckboxByLabel(result, 'Koruyucu yalıtma', true);
    if (get('korumaAyirma')) result = setCheckboxByLabel(result, 'Koruyucu ayırma', true);
    if (get('korumaKucukGerilim')) result = setCheckboxByLabel(result, 'Küçük gerilim', true);

    // 8. TESİSATTA KAPSAMLI DEĞİŞİKLİK
    const kapsamli = get('kapsamliDegisiklik');
    if (kapsamli !== undefined && kapsamli !== null) {
        result = setVarYokCheckbox(result, 'Tesisatta kapsamlı değişiklik var mı', kapsamli);
    }

    // 9. ÖNCEKİ KONTROL ETİKETİ
    const onceki = get('oncekiKontrolEtiketi');
    if (onceki !== undefined && onceki !== null) {
        result = setVarYokCheckbox(result, 'önceki periyodik kontrol etiketi var mı', onceki);
    }

    // 10. ÖLÇÜM METODU
    if (get('olcumCevrimEmpedansi') || options.olcumCevrim) result = setCheckboxByLabel(result, 'Çevrim empedansı', true);
    if (get('olcum3UcluTopraklama') || options.olcum3Uclu) result = setCheckboxByLabel(result, '3 Uçlu topraklama', true);
    if (get('olcumKlamp')) result = setCheckboxByLabel(result, 'Klamp metodu', true);

    return result;
}

// ============ ANA FONKSİYON ============

/**
 * Word raporu oluştur
 */
async function generateElektrikTopraklamaWord(rapor, isEmri, olcumler = [], options = {}) {
    // Şablonu oku
    const templateContent = fs.readFileSync(TEMPLATE_PATH);
    const zip = await JSZip.loadAsync(templateContent);
    let docXml = await zip.file('word/document.xml').async('string');

    // Firma bilgileri
    const firma = isEmri?.customer || {};
    const firmaBilgi = isEmri?.firmaBilgi || {};

    // === 1. FİRMA BİLGİLERİ ===
    docXml = setValueByLabel(docXml, 'Firma Adı', firma.unvan);
    docXml = setValueByLabel(docXml, 'Rapor Numarası', rapor.raporNo);
    docXml = setValueByLabel(docXml, 'Periyodik Kontrol Adresi', firma.adres);
    docXml = setValueByLabel(docXml, 'Rapor Tarihi', formatDate(rapor.bitisTarihi || new Date()));
    docXml = setValueByLabel(docXml, 'İSG-KATİP', options.isgKatipNo || rapor.isgKatipNo || firmaBilgi.isgKatipId);
    docXml = setValueByLabel(docXml, 'SGK Sicil No', firmaBilgi.sgkSicilNo);
    docXml = setValueByLabel(docXml, 'Periyodik Kontrol Başlangıç Tarihi ve Saati', formatDateTime(rapor.baslangicTarihi, options.baslangicSaati || '09:00'));
    docXml = setValueByLabel(docXml, 'Periyodik Kontrol Bitiş Tarihi ve Saati', formatDateTime(rapor.bitisTarihi, options.bitisSaati || '17:00'));
    docXml = setValueByLabel(docXml, 'Bir Sonraki Periyodik Kontrol Tarihi', getNextYearDate(rapor.bitisTarihi));

    // === 2. EKİPMAN BİLGİLERİ ===
    docXml = setValueByLabel(docXml, 'Enerji sağlayan kuruluş', options.enerjiSaglayan || 'MEDAŞ');
    docXml = setValueByLabel(docXml, 'Şebeke gerilimi', options.sebekeGerilimi || '380');
    docXml = setValueByLabel(docXml, 'Proje bilgileri', options.projeBilgileri || '-');
    docXml = setValueByLabel(docXml, 'Ekipmanın kullanım amacı', options.kullanimAmaci || firma.spiKodu || 'FABRİKA');
    docXml = setValueByLabel(docXml, 'Son kontrol tarihi', formatDate(options.sonKontrolTarihi) || '-');
    docXml = setValueByLabel(docXml, 'Hava durumu ve sıcaklığı', options.havaDurumu || rapor.havaDurumu || `${rapor.ortamSicaklik || 25} °C`);
    docXml = setValueByLabel(docXml, 'Zemin nem durumu', options.zeminNem || rapor.zeminNem || (rapor.ortamNem ? (rapor.ortamNem < 50 ? 'KURU' : 'NORMAL') : 'KURU'));
    docXml = setValueByLabel(docXml, 'Pano/Ekipman tanımlaması', options.panoTanimi || '-');

    // === 3. ÖLÇÜM CİHAZI ===
    const cihaz = rapor.topraklamaCihaz || {};
    docXml = setValueByLabel(docXml, 'Cihaz adı', cihaz.cihazAdi || 'Chauvin Arnoux');
    docXml = setValueByLabel(docXml, 'Seri numarası', cihaz.seriNo || '0165K-0126-00105');
    docXml = setValueByLabel(docXml, 'Kalibrasyon tarihi', formatDate(cihaz.kalibrasyonTarihi) || '20.01.2026');
    docXml = setValueByLabel(docXml, 'Kalibrasyon geçerlilik tarihi', formatDate(cihaz.kalibrasyonGecerlilikTarihi) || '20.01.2027');
    docXml = setValueByLabel(docXml, 'Kalibrasyon numarası', cihaz.kalibrasyonNo || '2500290');

    // === 3.5 CHECKBOX'LAR ===
    docXml = fillAllCheckboxes(docXml, rapor, options);

    // === 4. ÖLÇÜM TABLOSU ===
    if (olcumler && olcumler.length > 0) {
        docXml = fillMeasurementTable(docXml, olcumler, options.sistemTipi || rapor.sistemTipi || 'TN');
    }

    // === 4.5 RCD SELEKTİVİTE TABLOSU ===
    if (options.rcdSelektivite && options.rcdSelektivite.length > 0) {
        docXml = fillRcdTable(docXml, options.rcdSelektivite);
    }

    // === 4.6 KUSUR AÇIKLAMALARI ===
    docXml = fillKusurTable(docXml, options.kusurlar, options.kusurAciklama);

    // === 5. SONUÇ ===
    const sonucMetni = rapor.genelSonuc === 'UYGUN' ? 'UYGUNDUR' : 'UYGUN DEĞİLDİR';
    docXml = docXml.replace(
        /(kullanımı\s*\d*\s*yıl\s*süreyle[;:]*\s*)(UYGUNDUR|UYGUN DEĞİLDİR)/gi,
        `$1${sonucMetni}`
    );

    // === 6. YETKİLİ KİŞİ ===
    if (options.tekniker) {
        docXml = setValueByLabel(docXml, 'Adı, Soyadı', options.tekniker.adSoyad);
        docXml = setValueByLabel(docXml, 'Unvanı', options.tekniker.unvan || 'Elektriksel Ölçümler Sorumlusu');
        docXml = setValueByLabel(docXml, 'Mesleği', options.tekniker.meslek || 'Elektrik Teknikeri');
        docXml = setValueByLabel(docXml, 'Diploma Tarihi', formatDate(options.tekniker.diplomaTarihi));
        docXml = setValueByLabel(docXml, 'Diploma Numarası', options.tekniker.diplomaNo);
        docXml = setValueByLabel(docXml, 'Ekipnet Kayıt No', options.tekniker.ekipnetNo);
    }

    // === 7. NOTLAR ===
    // Sabit metin + kullanıcının ek notları
    const sabitNotlar = 'İŞ EKİPMANLARININ KULLANIMINDA SAĞLIK VE GÜVENLİK ŞARTLARI YÖNETMELİĞİ\nTesisatlar:2.3.7. Elektrik, topraklama ve yıldırımdan korunma tesisatları için periyodik kontrolde tesisat projesi aranır. İşveren, projesi olmayan tesisatların 3/12/2003 tarihli ve 25305 sayılı Resmî Gazete\'de yayımlanan Elektrik İç Tesisleri Proje Hazırlama Yönetmeliği, diğer ilgili yönetmelikler ve ilgili standartlara uygun olarak projelendirilmesini yaptırmak zorundadır.\nNot: Ölçüm Raporları Ölçüm Yapılan Günün Şartları İçin Geçerlidir';
    const notlarMetni = options.notlar ? `${sabitNotlar}\n${options.notlar}` : sabitNotlar;
    docXml = fillNotlarTable(docXml, notlarMetni);

    // Güncellenmiş XML'i kaydet
    zip.file('word/document.xml', docXml);

    // Yeni dosyayı oluştur
    return await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 }
    });
}

/**
 * Ölçüm tablosunu doldur
 */
function fillMeasurementTable(docXml, olcumler, sistemTipi) {
    const tableRegex = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
    const tables = docXml.match(tableRegex) || [];

    let measurementTable = null;

    for (let i = 0; i < tables.length; i++) {
        const tableText = tables[i].replace(/<[^>]+>/g, ' ');
        if (tableText.includes('Ölçüm noktası') || tableText.includes('DOLAYLI DOKUNMAYA')) {
            measurementTable = tables[i];
            break;
        }
    }

    if (!measurementTable) {
        console.log('Ölçüm tablosu bulunamadı');
        return docXml;
    }

    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    const rows = measurementTable.match(rowRegex) || [];

    let newTable = measurementTable;
    let dataRowIndex = 0;

    for (let i = 0; i < rows.length && dataRowIndex < olcumler.length; i++) {
        const row = rows[i];
        const rowText = getRowText(row);

        if (rowText.includes('Ölçüm noktası') ||
            rowText.includes('Açma eğrisi') ||
            rowText.includes('SON TÜKETİM') ||
            rowText.includes('Koruma Elemanı') ||
            rowText.includes('Sınır değer') ||
            rowText.includes('Ölçülen değer') ||
            rowText.length === 0) {
            continue;
        }

        // Satır numarası ile başlamalı
        const firstNum = rowText.match(/^\d+/);
        if (!firstNum) continue;

        // 12 hücrelik veri satırı olmalı
        const cellCount = (row.match(/<w:tc[^>]*>/g) || []).length;
        if (cellCount < 12) continue;

        const olcum = olcumler[dataRowIndex];
        const newRow = fillMeasurementRow(row, olcum, dataRowIndex + 1, sistemTipi);

        const rowIndex = newTable.indexOf(row);
        if (rowIndex !== -1) {
            newTable = newTable.substring(0, rowIndex) + newRow + newTable.substring(rowIndex + row.length);
        }

        dataRowIndex++;
    }

    // Doldurulan satırlardan sonraki boş veri satırlarını sil
    if (dataRowIndex > 0) {
        const updatedRows = newTable.match(rowRegex) || [];
        for (let i = 0; i < updatedRows.length; i++) {
            const row = updatedRows[i];
            const rowText = getRowText(row);

            // Başlık satırlarını atla
            if (rowText.includes('Ölçüm noktası') ||
                rowText.includes('Açma eğrisi') ||
                rowText.includes('SON TÜKETİM') ||
                rowText.includes('Koruma Elemanı') ||
                rowText.includes('Sınır değer') ||
                rowText.includes('Ölçülen değer') ||
                rowText.length === 0) {
                continue;
            }

            // Satır numarası ile başlayan veri satırı mı?
            const firstNum = rowText.match(/^\d+/);
            if (!firstNum) continue;

            const cellCount = (row.match(/<w:tc[^>]*>/g) || []).length;
            if (cellCount < 12) continue;

            const rowNum = parseInt(firstNum[0]);
            // Doldurulan satırlardan sonraki boş satırları sil
            if (rowNum > dataRowIndex) {
                newTable = newTable.replace(row, '');
            }
        }
    }

    return docXml.replace(measurementTable, newTable);
}

/**
 * Tek bir ölçüm satırını doldur
 * Şablon sütun sırası (12 hücre):
 *  0: No
 *  1: Ölçüm noktası / Etiketi
 *  2: In (A) - Koruma elemanı anma akımı
 *  3: Açma eğrisi tipi (B/C/D)
 *  4: Açma akımı Ia (A)
 *  5: Toprak kısa devre akımı Ik1 (A)
 *  6: Ölçülen değer Zx/Rx (Ω)
 *  7: Sınır değer Zs/RA (Ω)
 *  8: RCD tipi / dayanma akımı In / IΔn
 *  9: Açma akımı IΔ (mA)
 * 10: Açma zamanı TΔ (ms)
 * 11: Sonuç (Uygunluk notu)
 */
function fillMeasurementRow(rowXml, olcum, rowNum, sistemTipi) {
    const cellRegex = /<w:tc[^>]*>[\s\S]*?<\/w:tc>/g;
    const cells = rowXml.match(cellRegex) || [];

    if (cells.length < 12) return rowXml;

    const anmaAkimi = parseFloat(olcum.anmaAkimi || olcum.inA) || 0;
    const sigortaTipi = olcum.sigortaTipi || olcum.tip || 'C';
    const zx = parseFloat(olcum.zx || olcum.zxRx) || 0;

    let ia = 0;
    if (anmaAkimi) {
        if (sigortaTipi === 'B') ia = anmaAkimi * 5;
        else if (sigortaTipi === 'C') ia = anmaAkimi * 10;
        else if (sigortaTipi === 'D') ia = anmaAkimi * 20;
        else if (sigortaTipi === 'TMS' || sigortaTipi === 'TMŞ') ia = anmaAkimi * 10;
    }

    const rcdIdn = parseFloat(olcum.rcdIdn || olcum.rcdIAn) || 0;
    const rcdVar = rcdIdn > 0;

    // Zs/RA hesaplama: Sınır değer = UL(mV) / Ia
    let zsra = ia > 0 ? 50000 / ia : 0;

    // Ik1 = U₀ / Zx
    let ik = zx > 0 ? (230 / zx) : 0;

    // Sonuç: Zx ≤ Zs → Not-1 (MCB yeterli), Zx > Zs ve RCD var → Not-4, yoksa Not-2
    let sonuc = 'Not-2';
    if (zx > 0 && zsra > 0) {
        if (zx <= zsra) {
            sonuc = 'Not-1';
        } else if (rcdVar) {
            sonuc = 'Not-4';
        }
    }

    const olcumNoktasi = olcum.olcumNoktasi || olcum.tabloAdi || olcum.panoAdi || '-';
    const rcdInStr = olcum.rcdIn || '-';
    const rcdIdnStr = olcum.rcdIdn || olcum.rcdIAn || '-';
    const rcdId = olcum.rcdId || '-';
    const rcdTd = olcum.rcdTd || olcum.rcdSure || '-';

    // RCD bilgisi: tip/In(A)/IΔn(mA) formatında
    const rcdInfo = rcdVar ? `AC/${rcdInStr}/${rcdIdnStr}` : '-';

    // 12 hücre - şablon sırasıyla
    const values = [
        rowNum.toString(),           // 0: No
        olcumNoktasi,                // 1: Ölçüm noktası
        anmaAkimi ? anmaAkimi.toString() : '-',  // 2: In (A)
        sigortaTipi,                 // 3: Açma eğrisi tipi
        ia ? ia.toFixed(0) : '-',    // 4: Ia (A)
        ik ? ik.toFixed(0) : '-',    // 5: Ik1 (A)
        zx ? zx.toFixed(2) : '-',   // 6: Zx/Rx (Ω)
        zsra ? (zsra % 1 === 0 ? zsra.toFixed(0) : zsra.toFixed(2)) : '-', // 7: Zs/RA (Ω)
        rcdInfo,                     // 8: RCD tipi/In/IΔn
        rcdId,                       // 9: IΔ (mA)
        rcdTd,                       // 10: TΔ (ms)
        sonuc                        // 11: Sonuç
    ];

    let newRow = rowXml;
    for (let i = 0; i < Math.min(cells.length, values.length); i++) {
        const newCell = writeToCell(cells[i], String(values[i]));
        newRow = newRow.replace(cells[i], newCell);
    }

    return newRow;
}

/**
 * RCD Selektivite tablosunu doldur
 * Şablon sütun sırası (11 hücre):
 *  0: No
 *  1: Önceki pano adı
 *  2: RCD Tipi (önceki)
 *  3: Dayanma akımı In (A) (önceki)
 *  4: Açma akımı IΔn (mA) (önceki)
 *  5: Açma zamanı gecikmesi (ms) (önceki)
 *  6: Besleyen (son) pano adı
 *  7: RCD Tipi (son)
 *  8: Açma akımı IΔn (mA) (son)
 *  9: Test açma zamanı TΔ (ms) (son)
 * 10: Sonuç
 */
function fillRcdTable(docXml, rcdVerileri) {
    if (!rcdVerileri || rcdVerileri.length === 0) return docXml;

    const tableRegex = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
    const tables = docXml.match(tableRegex) || [];

    let rcdTable = null;
    for (const table of tables) {
        const tableText = table.replace(/<[^>]+>/g, ' ');
        if (tableText.includes('SELEKTİVİTE') || tableText.includes('Selektivite') || tableText.includes('selektivite')) {
            rcdTable = table;
            break;
        }
    }

    if (!rcdTable) {
        console.log('RCD Selektivite tablosu bulunamadı');
        return docXml;
    }

    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    const rows = rcdTable.match(rowRegex) || [];

    let newTable = rcdTable;
    let dataRowIndex = 0;

    for (let i = 0; i < rows.length && dataRowIndex < rcdVerileri.length; i++) {
        const row = rows[i];
        const rowText = getRowText(row);

        // Başlık satırlarını atla
        if (rowText.includes('SELEKTİVİTE') || rowText.includes('Selektivite') ||
            rowText.includes('RCD Tipi') || rowText.includes('Dayanma') ||
            rowText.includes('pano adı') || rowText.includes('Sonuç') ||
            rowText.includes('Uygunluk')) {
            continue;
        }

        const cells = row.match(/<w:tc[^>]*>[\s\S]*?<\/w:tc>/g) || [];
        if (cells.length < 11) continue;

        const rcd = rcdVerileri[dataRowIndex];

        const values = [
            (dataRowIndex + 1).toString(),      // 0: No
            rcd.oncekiPanoAdi || '-',            // 1: Önceki pano adı
            rcd.oncekiRcdTipi || '-',            // 2: RCD Tipi (önceki)
            rcd.oncekiIn || '-',                 // 3: In (A) (önceki)
            rcd.oncekiIdn || '-',                // 4: IΔn (mA) (önceki)
            rcd.oncekiGecikme || '-',            // 5: Gecikme (ms) (önceki)
            rcd.sonPanoAdi || '-',               // 6: Son pano adı
            rcd.sonRcdTipi || '-',               // 7: RCD Tipi (son)
            rcd.sonIdn || '-',                   // 8: IΔn (mA) (son)
            rcd.sonTd || '-',                    // 9: TΔ (ms) (son)
            rcd.sonuc || 'Not-7'                 // 10: Sonuç
        ];

        let newRow = row;
        for (let ci = 0; ci < Math.min(cells.length, values.length); ci++) {
            const newCell = writeToCell(cells[ci], String(values[ci]));
            newRow = newRow.replace(cells[ci], newCell);
        }

        const rowIndex = newTable.indexOf(row);
        if (rowIndex !== -1) {
            newTable = newTable.substring(0, rowIndex) + newRow + newTable.substring(rowIndex + row.length);
        }

        dataRowIndex++;
    }

    // Doldurulan satırlardan sonraki boş veri satırlarını sil
    if (dataRowIndex > 0) {
        const updatedRows = newTable.match(rowRegex) || [];
        for (let i = 0; i < updatedRows.length; i++) {
            const row = updatedRows[i];
            const rowText = getRowText(row);

            // Başlık satırlarını atla
            if (rowText.includes('SELEKTİVİTE') || rowText.includes('Selektivite') ||
                rowText.includes('RCD Tipi') || rowText.includes('Dayanma') ||
                rowText.includes('pano adı') || rowText.includes('Sonuç') ||
                rowText.includes('Uygunluk')) {
                continue;
            }

            const cells = row.match(/<w:tc[^>]*>[\s\S]*?<\/w:tc>/g) || [];
            if (cells.length < 11) continue;

            // İlk hücre numara mı? Doldurulan satır sayısından büyükse sil
            const firstCellText = getCellText(cells[0]).trim();
            const rowNum = parseInt(firstCellText);
            if (!isNaN(rowNum) && rowNum > dataRowIndex) {
                newTable = newTable.replace(row, '');
            } else if (firstCellText === '' || firstCellText === '-') {
                // Numarası olmayan boş satır
                newTable = newTable.replace(row, '');
            }
        }
    }

    return docXml.replace(rcdTable, newTable);
}

/**
 * Kusur açıklamalarını doldur
 * Tablo 8: Başlık + 1 büyük hücre
 */
function fillKusurTable(docXml, kusurlar, kusurAciklama) {
    if ((!kusurlar || kusurlar.length === 0) && !kusurAciklama) return docXml;

    const kusurMetinleri = {
        'topraklama_direnci': 'Topraklama direnci yüksek (*)',
        'hat_empedansi': 'Hat empedansı yüksek (*)',
        'rcd_sure': 'RCD çalışma süresi aşıldı (*)',
        'topraklama_yok': 'Topraklama bağlantısı yok (**)',
        'pano_kopru': 'Pano gövde-kapak köprüsü yok (**)',
        'notr_toprak': 'Nötr-toprak birleşikliği tespit edildi (**)',
        'rcd_yok': 'RCD yok veya arızalı (**)',
        'pen_kopru': 'PEN köprüsü dışında PE-N birleştirilmiş (**)'
    };

    let kusurText = '';
    if (kusurlar && kusurlar.length > 0) {
        kusurText = kusurlar.map((k, i) => `${i + 1}. ${kusurMetinleri[k] || k}`).join('\n');
    }
    if (kusurAciklama) {
        kusurText += (kusurText ? '\n' : '') + kusurAciklama;
    }
    if (!kusurText) kusurText = 'Kusur tespit edilmemiştir.';

    // Kusur tablosunu bul
    const tableRegex = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
    const tables = docXml.match(tableRegex) || [];

    for (const table of tables) {
        const tableText = table.replace(/<[^>]+>/g, ' ');
        if (tableText.includes('KUSUR AÇIKLAMALARI') || tableText.includes('Kusur Açıklamaları')) {
            const rows = table.match(/<w:tr[^>]*>[\s\S]*?<\/w:tr>/g) || [];
            // Son satır veri satırı
            if (rows.length >= 2) {
                const dataRow = rows[rows.length - 1];
                const cells = dataRow.match(/<w:tc[^>]*>[\s\S]*?<\/w:tc>/g) || [];
                if (cells.length > 0) {
                    const newCell = writeToCell(cells[0], kusurText);
                    const newRow = dataRow.replace(cells[0], newCell);
                    const newTable = table.replace(dataRow, newRow);
                    return docXml.replace(table, newTable);
                }
            }
        }
    }

    return docXml;
}

/**
 * Notlar tablosunu doldur
 * Tablo 7: "NOTLAR" başlıklı tablo, alt satıra yaz
 */
function fillNotlarTable(docXml, notlarText) {
    if (!notlarText) return docXml;

    const tableRegex = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
    const tables = docXml.match(tableRegex) || [];

    for (const table of tables) {
        const tableText = table.replace(/<[^>]+>/g, ' ');
        if (tableText.includes('NOTLAR') && !tableText.includes('KUSUR')) {
            const rows = table.match(/<w:tr[^>]*>[\s\S]*?<\/w:tr>/g) || [];
            if (rows.length >= 2) {
                const dataRow = rows[rows.length - 1];
                const cells = dataRow.match(/<w:tc[^>]*>[\s\S]*?<\/w:tc>/g) || [];
                if (cells.length > 0) {
                    const newCell = writeToCell(cells[0], notlarText);
                    const newRow = dataRow.replace(cells[0], newCell);
                    const newTable = table.replace(dataRow, newRow);
                    return docXml.replace(table, newTable);
                }
            }
        }
    }

    return docXml;
}

/**
 * Dosyaya kaydet
 */
async function saveWordToFile(rapor, isEmri, olcumler, options, outputPath) {
    const buffer = await generateElektrikTopraklamaWord(rapor, isEmri, olcumler, options);
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
}

module.exports = {
    generateElektrikTopraklamaWord,
    saveWordToFile,
    formatDate,
    formatDateTime,
    getNextYearDate,
    setCheckboxByLabel,
    setCheckboxInContext,
    setSebekeTipi,
    setVarYokCheckbox,
    setOlcumMetodu,
    setYapiCinsi,
    setTopraklayiciTipi,
    setKontrolNedeni,
    setKorumaOnlemi,
    fillAllCheckboxes,
    fillRcdTable,
    fillKusurTable,
    fillNotlarTable
};
