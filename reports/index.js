/**
 * RAPOR MOTORU - Orchestrator
 * Tek endpoint, config-driven PDF üretimi
 */

const path = require('path');
const fs = require('fs');
const pdfEngine = require('./pdfEngine');

// Desteklenen rapor türleri
const SUPPORTED_TYPES = ['ET', 'MEKANIK'];

/**
 * Rapor üret
 * @param {string} reportType - "ET" veya "MEKANIK"
 * @param {object} workOrder - İş emri (includes: customer, tenant, fieldData)
 * @param {object} fieldData - Saha formu verisi
 * @param {object} user - Oturumdan gelen kullanıcı
 */
async function generate(reportType, workOrder, fieldData, user) {
    // 1. Rapor türü kontrolü
    if (!SUPPORTED_TYPES.includes(reportType)) {
        throw new Error(`Desteklenmeyen rapor türü: ${reportType}`);
    }

    // 2. Config yükle
    const configPath = path.join(__dirname, '..', 'templates', `${reportType}.config.js`);
    if (!fs.existsSync(configPath)) {
        throw new Error(`Config bulunamadı: ${reportType}.config.js`);
    }
    const config = require(configPath);

    // 3. Veriyi hazırla
    const data = {
        reportNo: generateReportNo(reportType, workOrder.id),
        reportType,
        tarih: new Date(),
        workOrder,
        customer: workOrder.customer,
        tenant: workOrder.tenant,
        fieldData: fieldData.formData,
        olcumTarihi: fieldData.olcumTarihi,
        user
    };

    // 4. Hesaplama (config'de tanımlıysa)
    if (config.calculate) {
        data.calculated = config.calculate(data.fieldData);
        data.sonuc = data.calculated.sonuc;
    } else {
        // Hesaplama yoksa genel sonuç formData'dan alınır
        data.sonuc = data.fieldData.genelSonuc || 'UYGUN';
    }

    // 5. PDF üret
    const pdfBuffer = await pdfEngine.render(config, data);

    // 6. Diske kaydet
    const filename = `${reportType}-${workOrder.id}-${Date.now()}.pdf`;
    const tenantDir = path.join(__dirname, '..', 'storage', 'reports', String(workOrder.tenantId));

    if (!fs.existsSync(tenantDir)) {
        fs.mkdirSync(tenantDir, { recursive: true });
    }

    const fullPath = path.join(tenantDir, filename);
    fs.writeFileSync(fullPath, pdfBuffer);

    return {
        success: true,
        reportNo: data.reportNo,
        sonuc: data.sonuc,
        pdfPath: fullPath,
        pdfUrl: `/api/reports/download/${workOrder.tenantId}/${filename}`,
        filename
    };
}

/**
 * Rapor numarası üret
 */
function generateReportNo(reportType, workOrderId) {
    const year = new Date().getFullYear();
    const seq = String(workOrderId).padStart(4, '0');
    return `${reportType}-${year}-${seq}`;
}

module.exports = { generate, SUPPORTED_TYPES };
