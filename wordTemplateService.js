/**
 * Word Şablon Doldurma Servisi
 * FR7.2.36 Elektrik Topraklama Ölçüm Raporu için
 */

const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

class WordTemplateService {
    constructor() {
        this.templatesDir = path.join(__dirname, 'templates', 'elektrik');
        this.outputDir = path.join(__dirname, 'output', 'raporlar');

        // Output klasörü yoksa oluştur
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
     * Mevcut şablonları listele
     */
    listTemplates() {
        try {
            const files = fs.readdirSync(this.templatesDir);
            return files.filter(f => f.endsWith('.docx')).map(f => ({
                filename: f,
                path: path.join(this.templatesDir, f),
                name: f.replace('.docx', '')
            }));
        } catch (error) {
            console.error('Şablon listeleme hatası:', error);
            return [];
        }
    }

    /**
     * Elektrik Topraklama Raporu şablonunu doldur
     * @param {Object} rapor - ElektrikTopraklamaRaporu verisi
     * @param {string} templateName - Şablon dosya adı
     * @returns {string} Oluşturulan dosya yolu
     */
    async fillTopraklamaRaporu(rapor, templateName = 'FR7.2.36 Elektrik Topraklama Ölçüm Raporu-1.docx') {
        const templatePath = path.join(this.templatesDir, templateName);

        if (!fs.existsSync(templatePath)) {
            throw new Error(`Şablon bulunamadı: ${templateName}`);
        }

        // Şablonu oku
        const content = fs.readFileSync(templatePath, 'binary');
        const zip = new PizZip(content);

        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            delimiters: { start: '{{', end: '}}' }
        });

        // Veriyi hazırla
        const data = this.prepareTopraklamaData(rapor);

        // Şablonu doldur
        doc.render(data);

        // Çıktı dosyasını oluştur
        const outputFilename = `${rapor.raporNo}_${Date.now()}.docx`;
        const outputPath = path.join(this.outputDir, outputFilename);

        const buf = doc.getZip().generate({
            type: 'nodebuffer',
            compression: 'DEFLATE'
        });

        fs.writeFileSync(outputPath, buf);

        return {
            filename: outputFilename,
            path: outputPath,
            relativePath: `/output/raporlar/${outputFilename}`
        };
    }

    /**
     * Rapor verisini şablon formatına dönüştür
     */
    prepareTopraklamaData(rapor) {
        const customer = rapor.altGorev?.isEmri?.customer || {};
        const firmaBilgi = rapor.altGorev?.isEmri?.firmaBilgi || {};
        const ekipman = rapor.ekipmanBilgi || {};

        // Tarih formatla
        const formatDate = (date) => {
            if (!date) return '';
            const d = new Date(date);
            return d.toLocaleDateString('tr-TR');
        };

        // Ölçüm tablosu verisi
        const olcumler = (rapor.detayliOlcumler || []).map((o, index) => ({
            sira: index + 1,
            tabloAdi: o.tabloAdi || '',
            panoAdi: o.panoAdi || '',
            salterAdi: o.salterAdi || '',
            anmaAkimi: o.anmaAkimi ? parseFloat(o.anmaAkimi).toFixed(0) : '',
            sigortaTipi: o.sigortaTipi || 'C',
            ia: o.ia ? parseFloat(o.ia).toFixed(1) : '',
            zs: o.zs ? parseFloat(o.zs).toFixed(3) : '',
            ra: o.ra ? parseFloat(o.ra).toFixed(3) : '',
            zx: o.zx ? parseFloat(o.zx).toFixed(3) : '',
            ik: o.ik ? parseFloat(o.ik).toFixed(1) : '',
            rcdVarMi: o.rcdVarMi ? 'Var' : 'Yok',
            rcdIAn: o.rcdIAn || '',
            rcdSure: o.rcdSure || '',
            sonuc: o.sonuc === 'UYGUN' ? 'UYGUN' : 'UYGUN DEĞİL'
        }));

        // Checkbox durumları (X veya boş)
        const checkMark = (val) => val ? '☑' : '☐';

        return {
            // Rapor Bilgileri
            raporNo: rapor.raporNo || '',
            raporTarihi: formatDate(new Date()),
            baslangicTarihi: formatDate(rapor.baslangicTarihi),
            bitisTarihi: formatDate(rapor.bitisTarihi),

            // Firma Bilgileri
            firmaAdi: customer.unvan || '',
            firmaAdres: customer.adres || '',
            firmaTelefon: customer.telefon || '',
            firmaEmail: customer.email || '',
            vergiNo: customer.vergiNo || '',
            vergiDairesi: customer.vergiDairesi || '',
            sgkSicilNo: rapor.sgkSicilNo || firmaBilgi.sgkSicilNo || '',
            isgKatipNo: rapor.isgKatipNo || firmaBilgi.isgKatipId || '',

            // Ortam Koşulları
            ortamSicaklik: rapor.ortamSicaklik || '',
            ortamNem: rapor.ortamNem || '',

            // Sistem Tipi
            sistemTipiTN: rapor.sistemTipi === 'TN' ? '☑' : '☐',
            sistemTipiTT: rapor.sistemTipi === 'TT' ? '☑' : '☐',

            // Ekipman Bilgileri - Devre Türü
            devreMotor: checkMark(ekipman.devreMotor),
            devreAydinlatma: checkMark(ekipman.devreAydinlatma),
            devrePriz: checkMark(ekipman.devrePriz),
            devreDiger: checkMark(ekipman.devreDiger),

            // Ekipman Bilgileri - Sigorta Tipi
            sigortaTipB: checkMark(ekipman.sigortaTipB),
            sigortaTipC: checkMark(ekipman.sigortaTipC),
            sigortaTipD: checkMark(ekipman.sigortaTipD),

            // Ekipman Bilgileri - Güç Aralığı
            guc05_1kW: checkMark(ekipman.guc05_1kW),
            guc1_5kW: checkMark(ekipman.guc1_5kW),
            guc5_10kW: checkMark(ekipman.guc5_10kW),
            guc10_20kW: checkMark(ekipman.guc10_20kW),
            guc20_50kW: checkMark(ekipman.guc20_50kW),
            guc50kWUstu: checkMark(ekipman.guc50kWUstu),

            // RCD Durumu
            rcdVar: checkMark(ekipman.rcdVar),
            rcdYok: checkMark(ekipman.rcdYok),

            // Ölçüm Cihazları
            topraklamaCihazAdi: rapor.topraklamaCihaz?.cihazAdi || '',
            topraklamaCihazMarka: rapor.topraklamaCihaz?.marka || '',
            topraklamaCihazModel: rapor.topraklamaCihaz?.model || '',
            topraklamaCihazSeriNo: rapor.topraklamaCihaz?.seriNo || '',
            topraklamaCihazKalibrasyon: formatDate(rapor.topraklamaCihaz?.kalibrasyonTarihi),

            devreCihazAdi: rapor.devreCihaz?.cihazAdi || '',
            devreCihazMarka: rapor.devreCihaz?.marka || '',
            devreCihazModel: rapor.devreCihaz?.model || '',
            devreCihazSeriNo: rapor.devreCihaz?.seriNo || '',
            devreCihazKalibrasyon: formatDate(rapor.devreCihaz?.kalibrasyonTarihi),

            rcdCihazAdi: rapor.rcdCihaz?.cihazAdi || '',
            rcdCihazMarka: rapor.rcdCihaz?.marka || '',
            rcdCihazModel: rapor.rcdCihaz?.model || '',
            rcdCihazSeriNo: rapor.rcdCihaz?.seriNo || '',
            rcdCihazKalibrasyon: formatDate(rapor.rcdCihaz?.kalibrasyonTarihi),

            // Ölçüm Tablosu
            olcumler: olcumler,
            olcumSayisi: olcumler.length,

            // Genel Sonuç
            genelSonuc: rapor.genelSonuc === 'UYGUN' ? 'UYGUN' : 'UYGUN DEĞİL',
            genelSonucUygun: rapor.genelSonuc === 'UYGUN' ? '☑' : '☐',
            genelSonucUygunDegil: rapor.genelSonuc !== 'UYGUN' ? '☑' : '☐',
            aciklama: rapor.aciklama || '',

            // RCD Seçicilik (varsa)
            rcdSecicilik: (rapor.rcdSecicilik || []).map((r, index) => ({
                sira: index + 1,
                konum: r.rcdKonumu || '',
                tip: r.rcdTipi || '',
                iAn: r.rcdIAn || '',
                sure: r.rcdAcmaSuresi || '',
                secicilik: r.secicilikSaglandi ? 'SAĞLANDI' : 'SAĞLANMADI'
            }))
        };
    }

    /**
     * Şablondaki placeholder'ları analiz et
     */
    analyzeTemplate(templateName) {
        const templatePath = path.join(this.templatesDir, templateName);

        if (!fs.existsSync(templatePath)) {
            throw new Error(`Şablon bulunamadı: ${templateName}`);
        }

        const content = fs.readFileSync(templatePath, 'binary');
        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true
        });

        // Şablondaki tüm tag'leri bul
        const tags = doc.getFullText().match(/\{[^}]+\}/g) || [];
        const uniqueTags = [...new Set(tags)];

        return {
            templateName,
            placeholders: uniqueTags,
            count: uniqueTags.length
        };
    }
}

module.exports = new WordTemplateService();
