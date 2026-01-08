/**
 * PDF ENGINE - Config-Driven PDF Üretici
 * pdfGenerator2.js'den dönüştürülmüş tek motor
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Sabit renkler
const COLORS = {
    primary: '#2C5F8D',
    dark: '#1a3d5c',
    lightBg: '#D9E2F3',
    zebra: '#F2F2F2',
    success: '#28a745',
    danger: '#dc3545',
    warning: '#ffc107'
};

/**
 * PDF oluştur
 * @param {object} config - Rapor config'i (ET.config.js veya MEKANIK.config.js)
 * @param {object} data - Veri (workOrder, customer, tenant, fieldData, calculated)
 */
async function render(config, data) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                margin: 40,
                size: 'A4',
                bufferPages: true
            });

            const chunks = [];
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Font yükle
            loadFonts(doc);

            // Header
            renderHeader(doc, data.tenant, config);

            // Başlık
            renderTitle(doc, config.title);

            // Rapor bilgileri
            renderReportInfo(doc, data);

            // Müşteri bilgileri
            renderCustomerInfo(doc, data.customer);

            // Config'e göre bölümleri render et
            let yPos = 340;

            for (const section of config.sections) {
                // Sayfa kontrolü
                if (yPos > 700) {
                    doc.addPage();
                    yPos = 50;
                }

                switch (section.type) {
                    case 'info':
                        yPos = renderInfoSection(doc, yPos, data.fieldData, data.calculated, section);
                        break;
                    case 'measurements':
                        // Hesaplanmış olcumler varsa onu kullan
                        const olcumler = data.calculated?.olcumler || data.fieldData[section.dataKey];
                        yPos = renderMeasurementsTable(doc, yPos, olcumler, section);
                        break;
                    case 'defects':
                        const kusurlar = data.calculated?.kusurAciklamalari || data.fieldData[section.dataKey];
                        yPos = renderDefectsSection(doc, yPos, kusurlar, section);
                        break;
                    case 'checklist':
                        yPos = renderChecklist(doc, yPos, data.fieldData[section.dataKey], section);
                        break;
                    case 'result':
                        yPos = renderResult(doc, yPos, data.sonuc, data.calculated);
                        break;
                    case 'notes':
                        yPos = renderNotes(doc, yPos, section.items);
                        break;
                }

                yPos += 20;
            }

            // İmza alanları
            renderSignatures(doc, yPos, data.tenant, data.user);

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Font yükle
 */
function loadFonts(doc) {
    try {
        const fontPath = path.join(__dirname, '..', 'fonts');
        if (fs.existsSync(path.join(fontPath, 'DejaVuSans.ttf'))) {
            doc.registerFont('Turkish', path.join(fontPath, 'DejaVuSans.ttf'));
            doc.registerFont('Turkish-Bold', path.join(fontPath, 'DejaVuSans-Bold.ttf'));
            doc.font('Turkish');
        } else {
            doc.font('Helvetica');
        }
    } catch (err) {
        doc.font('Helvetica');
    }
}

/**
 * Header render
 */
function renderHeader(doc, tenant, config) {
    // Arka plan
    doc.fillColor(COLORS.lightBg).rect(40, 40, 515, 90).fill();

    // Logo
    const logoPath = path.join(__dirname, '..', 'public', 'images', 'logo.png');
    if (fs.existsSync(logoPath)) {
        try {
            doc.image(logoPath, 50, 50, { width: 100, height: 50, fit: [100, 50] });
        } catch (err) { }
    }

    // Firma bilgileri
    doc.fillColor('#000000');
    doc.font('Turkish-Bold').fontSize(14).text(tenant.name || 'MUAYENE FİRMASI', 160, 50, { width: 280 });
    doc.font('Turkish').fontSize(8);
    doc.text(tenant.adres || '', 160, 70, { width: 280 });
    doc.text(`Tel: ${tenant.telefon || ''} | Email: ${tenant.email || ''}`, 160, 85);

    // TÜRKAK logo
    const turkakPath = path.join(__dirname, '..', 'public', 'images', 'turkak-logo.png');
    if (fs.existsSync(turkakPath)) {
        try {
            doc.image(turkakPath, 470, 50, { width: 70, height: 35, fit: [70, 35] });
        } catch (err) { }
    }
}

/**
 * Başlık render
 */
function renderTitle(doc, title) {
    doc.fillColor(COLORS.primary).rect(40, 145, 515, 30).fill();
    doc.fillColor('#FFFFFF').font('Turkish-Bold').fontSize(14);
    doc.text(title, 0, 152, { align: 'center', width: 595 });
}

/**
 * Rapor bilgileri render
 */
function renderReportInfo(doc, data) {
    const y = 190;

    doc.fillColor(COLORS.zebra).rect(40, y, 250, 25).fill();
    doc.fillColor(COLORS.zebra).rect(305, y, 250, 25).fill();

    doc.fillColor('#000000').font('Turkish-Bold').fontSize(9);
    doc.text('Rapor No:', 50, y + 7);
    doc.font('Turkish').text(data.reportNo, 110, y + 7);

    doc.font('Turkish-Bold').text('Tarih:', 315, y + 7);
    doc.font('Turkish').text(new Date(data.olcumTarihi || data.tarih).toLocaleDateString('tr-TR'), 355, y + 7);

    doc.font('Turkish-Bold').text('İş Emri:', 430, y + 7);
    doc.font('Turkish').text(data.workOrder.workOrderNo, 480, y + 7);
}

/**
 * Müşteri bilgileri render
 */
function renderCustomerInfo(doc, customer) {
    const y = 230;

    doc.fillColor(COLORS.primary).rect(40, y, 515, 20).fill();
    doc.fillColor('#FFFFFF').font('Turkish-Bold').fontSize(10);
    doc.text('MÜŞTERİ BİLGİLERİ', 50, y + 5);

    doc.fillColor('#000000').font('Turkish').fontSize(9);
    doc.rect(40, y + 25, 515, 55).stroke();

    doc.text(`Firma: ${customer.unvan || '-'}`, 50, y + 33);
    doc.text(`Yetkili: ${customer.yetkili || '-'}`, 50, y + 48);
    doc.text(`Adres: ${customer.adres || '-'}`, 50, y + 63);
    doc.text(`Tel: ${customer.telefon || '-'}`, 350, y + 48);
    doc.text(`Email: ${customer.email || '-'}`, 350, y + 63);
}

/**
 * Info section render (ET için - Ölçüm Bilgileri)
 */
function renderInfoSection(doc, yPos, fieldData, calculated, section) {
    // Bölüm başlığı
    doc.fillColor(COLORS.dark).rect(40, yPos, 515, 20).fill();
    doc.fillColor('#FFFFFF').font('Turkish-Bold').fontSize(10);
    doc.text(section.title || 'ÖLÇÜM BİLGİLERİ', 50, yPos + 5);
    yPos += 25;

    // Info kutusu
    doc.rect(40, yPos, 515, 50).stroke();

    const fields = section.fields || [];
    const labels = {
        'sebeke_tipi': 'Şebeke Tipi',
        'sebeke_gerilimi': 'Şebeke Gerilimi (V)',
        'zemin_durumu': 'Zemin Durumu',
        'hava_sicakligi': 'Hava Sıcaklığı (°C)'
    };

    doc.fillColor('#000000').font('Turkish').fontSize(9);

    let xPos = 50;
    let currentY = yPos + 10;
    let colIndex = 0;

    fields.forEach((field, i) => {
        const label = labels[field] || field;
        const value = fieldData[field] || calculated?.[field] || '-';

        if (colIndex >= 2) {
            colIndex = 0;
            xPos = 50;
            currentY += 18;
        }

        doc.font('Turkish-Bold').text(`${label}: `, xPos, currentY, { continued: true });
        doc.font('Turkish').text(String(value));

        xPos += 250;
        colIndex++;
    });

    return yPos + 55;
}

/**
 * Kusur açıklamaları section render
 */
function renderDefectsSection(doc, yPos, kusurlar, section) {
    if (!kusurlar || (Array.isArray(kusurlar) && kusurlar.length === 0)) {
        return yPos; // Kusur yoksa render etme
    }

    // Bölüm başlığı
    doc.fillColor(COLORS.dark).rect(40, yPos, 515, 20).fill();
    doc.fillColor('#FFFFFF').font('Turkish-Bold').fontSize(10);
    doc.text(section.title || 'KUSUR AÇIKLAMALARI', 50, yPos + 5);
    yPos += 25;

    doc.fillColor('#000000').font('Turkish').fontSize(9);

    if (Array.isArray(kusurlar)) {
        kusurlar.forEach((kusur, i) => {
            if (yPos > 700) {
                doc.addPage();
                yPos = 50;
            }

            // Zebra
            if (i % 2 === 0) {
                doc.fillColor(COLORS.zebra).rect(40, yPos, 515, 18).fill();
            }
            doc.rect(40, yPos, 515, 18).stroke();

            const text = typeof kusur === 'object' ? (kusur.aciklama || kusur.text || '-') : kusur;
            doc.fillColor('#000000').text(`${i + 1}. ${text}`, 50, yPos + 5, { width: 490 });
            yPos += 18;
        });
    } else if (typeof kusurlar === 'string' && kusurlar.trim()) {
        // Tek string ise direkt yaz
        doc.rect(40, yPos, 515, 30).stroke();
        doc.text(kusurlar, 50, yPos + 8, { width: 490 });
        yPos += 35;
    }

    return yPos;
}

/**
 * Ölçüm tablosu render (ET için)
 * Dinamik sütun genişliği hesaplaması
 */
function renderMeasurementsTable(doc, yPos, measurements, section) {
    if (!measurements || !Array.isArray(measurements)) return yPos;

    // Bölüm başlığı
    doc.fillColor(COLORS.dark).rect(40, yPos, 515, 20).fill();
    doc.fillColor('#FFFFFF').font('Turkish-Bold').fontSize(10);
    doc.text(section.title || 'ÖLÇÜM SONUÇLARI', 50, yPos + 5);
    yPos += 25;

    const cols = section.columns || [
        { key: 'nokta', label: 'Nokta', width: 60 },
        { key: 'olcum', label: 'Ölçüm (Ω)', width: 80 },
        { key: 'carpan', label: 'Çarpan', width: 60 },
        { key: 'hesaplanan', label: 'Hesaplanan', width: 80 },
        { key: 'limit', label: 'Limit (Ω)', width: 80 },
        { key: 'sonuc', label: 'Sonuç', width: 80 }
    ];

    // Sütun sayısına göre spacing ve font size ayarla
    const colCount = cols.length;
    const spacing = colCount > 8 ? 1 : (colCount > 6 ? 2 : 5);
    const fontSize = colCount > 8 ? 6 : (colCount > 6 ? 7 : 8);
    const rowHeight = colCount > 8 ? 16 : 18;

    // Toplam genişliği hesapla ve normalize et
    const totalConfigWidth = cols.reduce((sum, c) => sum + c.width, 0);
    const availableWidth = 510; // 515 - margins
    const scale = availableWidth / (totalConfigWidth + (colCount - 1) * spacing);

    // Normalize edilmiş genişlikler
    const normalizedCols = cols.map(col => ({
        ...col,
        width: Math.floor(col.width * scale)
    }));

    // Tablo başlıkları
    doc.fillColor(COLORS.primary).rect(40, yPos, 515, rowHeight).fill();
    doc.fillColor('#FFFFFF').font('Turkish-Bold').fontSize(fontSize);

    let xPos = 42;
    normalizedCols.forEach(col => {
        doc.text(col.label, xPos, yPos + 4, { width: col.width, align: 'center' });
        xPos += col.width + spacing;
    });
    yPos += rowHeight;

    // Satırlar
    doc.font('Turkish').fontSize(fontSize);
    measurements.forEach((m, i) => {
        if (yPos > 700) {
            doc.addPage();
            yPos = 50;
        }

        // Zebra
        if (i % 2 === 0) {
            doc.fillColor(COLORS.zebra).rect(40, yPos, 515, rowHeight).fill();
        }
        doc.rect(40, yPos, 515, rowHeight).stroke();

        doc.fillColor('#000000');
        xPos = 42;
        normalizedCols.forEach(col => {
            let val = m[col.key];
            // Null/undefined kontrolü
            if (val === null || val === undefined || val === '') {
                val = '-';
            }
            // Sonuç renklendirme
            if (col.key === 'sonuc') {
                const sonucVal = String(val).toUpperCase();
                if (sonucVal.includes('UYGUN') && !sonucVal.includes('DEGIL') && !sonucVal.includes('DEĞİL')) {
                    doc.fillColor(COLORS.success);
                } else {
                    doc.fillColor(COLORS.danger);
                }
            }
            doc.text(String(val), xPos, yPos + 4, { width: col.width, align: 'center' });
            doc.fillColor('#000000');
            xPos += col.width + spacing;
        });
        yPos += rowHeight;
    });

    return yPos;
}

/**
 * Checklist render (MEKANIK için)
 */
function renderChecklist(doc, yPos, items, section) {
    if (!items || !Array.isArray(items)) return yPos;

    // Bölüm başlığı
    doc.fillColor(COLORS.dark).rect(40, yPos, 515, 20).fill();
    doc.fillColor('#FFFFFF').font('Turkish-Bold').fontSize(10);
    doc.text(section.title || 'KONTROL MADDELERİ', 50, yPos + 5);
    yPos += 25;

    // Tablo başlıkları
    doc.fillColor(COLORS.primary).rect(40, yPos, 515, 18).fill();
    doc.fillColor('#FFFFFF').font('Turkish-Bold').fontSize(8);
    doc.text('Kontrol Maddesi', 50, yPos + 5, { width: 350 });
    doc.text('Durum', 420, yPos + 5, { width: 80, align: 'center' });
    yPos += 18;

    // Satırlar
    doc.font('Turkish').fontSize(8);
    items.forEach((item, i) => {
        if (yPos > 700) {
            doc.addPage();
            yPos = 50;
        }

        if (i % 2 === 0) {
            doc.fillColor(COLORS.zebra).rect(40, yPos, 515, 20).fill();
        }
        doc.rect(40, yPos, 515, 20).stroke();

        doc.fillColor('#000000');
        doc.text(item.madde || item.label || '-', 50, yPos + 6, { width: 350 });

        const durum = item.durum || item.value || '-';
        doc.fillColor(durum === 'UYGUN' || durum === 'EVET' ? COLORS.success : COLORS.danger);
        doc.text(durum, 420, yPos + 6, { width: 80, align: 'center' });

        yPos += 20;
    });

    return yPos;
}

/**
 * Sonuç render
 */
function renderResult(doc, yPos, sonuc, calculated) {
    yPos += 10;

    const bgColor = sonuc === 'UYGUN' ? '#d4edda' : '#f8d7da';
    const textColor = sonuc === 'UYGUN' ? '#155724' : '#721c24';

    doc.fillColor(bgColor).rect(40, yPos, 515, 40).fill();
    doc.rect(40, yPos, 515, 40).stroke();

    doc.fillColor(textColor).font('Turkish-Bold').fontSize(14);
    doc.text(`GENEL SONUÇ: ${sonuc}`, 0, yPos + 12, { align: 'center', width: 595 });

    if (calculated && calculated.aciklama) {
        doc.font('Turkish').fontSize(9);
        doc.text(calculated.aciklama, 0, yPos + 28, { align: 'center', width: 595 });
    }

    return yPos + 50;
}

/**
 * Notlar render
 */
function renderNotes(doc, yPos, items) {
    if (!items || !Array.isArray(items)) return yPos;

    doc.fillColor('#000000').font('Turkish-Bold').fontSize(9);
    doc.text('NOTLAR:', 40, yPos);
    yPos += 15;

    doc.font('Turkish').fontSize(8);
    items.forEach(note => {
        doc.text(`• ${note}`, 50, yPos);
        yPos += 12;
    });

    return yPos;
}

/**
 * İmza alanları render
 */
function renderSignatures(doc, yPos, tenant, user) {
    if (yPos < 550) yPos = 600;
    else {
        doc.addPage();
        yPos = 100;
    }

    doc.fillColor('#000000').font('Turkish-Bold').fontSize(10);
    doc.text('ÖLÇÜMÜ YAPAN', 80, yPos);
    doc.text('TEKNİK SORUMLU', 380, yPos);

    // İmza çizgileri
    doc.moveTo(80, yPos + 50).lineTo(200, yPos + 50).stroke();
    doc.moveTo(380, yPos + 50).lineTo(500, yPos + 50).stroke();

    // İsimler
    doc.font('Turkish').fontSize(9);
    doc.text(user?.name || '', 80, yPos + 55);
    doc.text(tenant?.yetkili || '', 380, yPos + 55);

    // Footer
    const bottomY = doc.page.height - 30;
    doc.fontSize(7).fillColor('#666666');
    doc.text('Bu rapor elektronik ortamda oluşturulmuştur.', 0, bottomY, { align: 'center', width: 595 });
}

module.exports = { render };
