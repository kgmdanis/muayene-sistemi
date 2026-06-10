/**
 * Elektrik İç Tesisat Ölçüm Raporu Word Oluşturma Servisi
 * FR7.2.40 - Etiket bazlı akıllı değiştirme + CHECKBOX DESTEĞİ
 *
 * Şablon: FR7.2.40 Elektrik İç Tesisat Ölçüm Raporu-2 (2).docx
 *
 * @version 1.0
 */

const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, '../templates/elektrik/FR7.2.40 Elektrik İç Tesisat Ölçüm Raporu-2 (2).docx');

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

/**
 * Decimal/Number değeri güvenle parse et
 */
function safeNum(val, decimals = 2) {
    if (val === null || val === undefined || val === '') return null;
    const n = parseFloat(val);
    if (isNaN(n)) return null;
    return decimals !== null ? n.toFixed(decimals) : n;
}

/**
 * Decimal/Number değeri string'e çevir (gösterim için)
 */
function numStr(val, decimals = 2) {
    const n = safeNum(val, decimals);
    return n !== null ? n : '-';
}

// ============ HÜCRE İŞLEMLERİ ============

// Calibri 8pt (16 half-points) font özellikleri
const FONT_RPR = '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr>';

/**
 * Hücreye metin yaz - mevcut içeriği değiştirerek
 * Tüm yazılan metinler Calibri 8pt olarak formatlanır
 */
function writeToCell(cellXml, newText) {
    const escapedText = escapeXml(newText || '-');

    if (!/<w:t[ >]/.test(cellXml)) {
        if (/<w:pPr>[\s\S]*?<\/w:pPr>/.test(cellXml)) {
            return cellXml.replace(
                /(<\/w:pPr>)/,
                `$1<w:r>${FONT_RPR}<w:t xml:space="preserve">${escapedText}</w:t></w:r>`
            );
        }
        return cellXml.replace(
            /(<\/w:p>)/,
            `<w:r>${FONT_RPR}<w:t xml:space="preserve">${escapedText}</w:t></w:r>$1`
        );
    }

    let firstReplaced = false;
    let result = cellXml.replace(/<w:t([^>]*)>([^<]*)<\/w:t>/g, (match, attrs, oldText) => {
        if (!firstReplaced) {
            firstReplaced = true;
            return `<w:t xml:space="preserve">${escapedText}</w:t>`;
        }
        return '<w:t></w:t>';
    });

    // Mevcut run'lardaki font boyutlarını Calibri 8pt'ye normalize et
    result = result.replace(/<w:sz w:val="\d+"/g, '<w:sz w:val="16"');
    result = result.replace(/<w:szCs w:val="\d+"/g, '<w:szCs w:val="16"');
    result = result.replace(/<w:rFonts[^>]*\/>/g, '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>');
    // rPr'si olmayan run'lara font ekle
    result = result.replace(/<w:r>(\s*)<w:t/g, `<w:r>$1${FONT_RPR}<w:t`);

    return result;
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

/**
 * Tablodaki tüm metni al
 */
function getTableText(tableXml) {
    const matches = tableXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
    return matches.map(t => t.replace(/<[^>]+>/g, '')).join(' ').trim();
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

/**
 * N'inci eşleşen etiketin yanındaki hücreye değer yaz
 * Birden fazla "Cihaz adı" gibi tekrarlayan etiketler için
 */
function setNthValueByLabel(xml, labelText, newValue, n = 1) {
    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    const rows = xml.match(rowRegex) || [];
    let result = xml;
    let matchCount = 0;

    for (const row of rows) {
        const rowText = getRowText(row);
        if (!rowText.includes(labelText)) continue;

        const cellRegex = /<w:tc[^>]*>[\s\S]*?<\/w:tc>/g;
        const cells = row.match(cellRegex) || [];

        for (let i = 0; i < cells.length; i++) {
            const cellText = getCellText(cells[i]).trim();
            if (cellText.includes(labelText)) {
                matchCount++;
                if (matchCount === n && i + 1 < cells.length) {
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

/**
 * Belirli bir etiketin olduğu hücrenin belirli bir offset sonrasındaki hücreye değer yaz
 */
function setValueByLabelOffset(xml, labelText, newValue, offset = 1) {
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
                if (i + offset < cells.length) {
                    const newCell = writeToCell(cells[i + offset], newValue);
                    const newRow = row.replace(cells[i + offset], newCell);
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
 * Label'a göre doğru checkbox'ı bulur
 */
function setCheckboxByLabel(xml, label, checked = true) {
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
        newCheckbox = oldCheckbox
            .replace(/<w:default w:val="[01]"/, '<w:default w:val="1"')
            .replace(/<\/w:checkBox>/, '<w:checked/></w:checkBox>');

        // Eğer zaten w:checked varsa duplike etme
        if (oldCheckbox.includes('<w:checked')) {
            newCheckbox = oldCheckbox.replace(/<w:default w:val="[01]"/, '<w:default w:val="1"');
        }
    } else {
        newCheckbox = oldCheckbox
            .replace(/<w:default w:val="[01]"/, '<w:default w:val="0"')
            .replace(/<w:checked\s*\/?>/g, '');
    }

    return xml.substring(0, absolutePos) + newCheckbox + xml.substring(absolutePos + oldCheckbox.length);
}

/**
 * Context bazlı checkbox işaretleme
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
 * Tüm checkbox'ları doldur
 */
function fillAllCheckboxes(xml, rapor, options = {}) {
    let result = xml;

    // 1. ŞEBEKE TİPİ - sebekeTipi veya sistemTipi kullan, underscore'ları hyphen'e çevir
    const sebekeTipiRaw = options.sebekeTipi || rapor.sebekeTipi || rapor.sistemTipi || '';
    if (sebekeTipiRaw) {
        const sebekeTipiNorm = sebekeTipiRaw.toUpperCase().replace(/_/g, '-').replace('TN-C-S', 'TN-CS');
        result = setSebekeTipi(result, sebekeTipiNorm);
    }

    // 2. KONTROL NEDENİ
    result = setKontrolNedeni(result, options.kontrolNedeni || 'periyodik');

    // 3. TESİSE AİT PROJE VAR MI?
    if (options.projeVar !== undefined) {
        result = setVarYokCheckbox(result, 'Tesise ait proje var mı', options.projeVar);
    }

    // 4. TEK HAT ŞEMASI VAR MI?
    if (options.tekHatSemasiVar !== undefined) {
        result = setVarYokCheckbox(result, 'Tek hat şeması var mı', options.tekHatSemasiVar);
    }

    // 5. YAPI CİNSİ
    if (options.yapiEv) result = setCheckboxByLabel(result, 'Ev', true);
    if (options.yapiTicari) result = setCheckboxByLabel(result, 'Ticari', true);
    if (options.yapiEndustri) result = setCheckboxByLabel(result, 'Endüstri', true);
    if (options.yapiDiger) result = setCheckboxByLabel(result, 'Diğer', true);

    // 5b. FAZ İLETKEN TİPİ (AA/DA)
    if (options.fazTipi) {
        const ft = options.fazTipi;
        if (ft.includes('1f2t')) result = setCheckboxByLabel(result, '1 faz, 2 tel', true);
        if (ft.includes('1f3t')) result = setCheckboxByLabel(result, '1 faz, 3 tel', true);
        if (ft.includes('2f3t')) result = setCheckboxByLabel(result, '2 faz, 3 tel', true);
        if (ft.includes('3f3t')) result = setCheckboxByLabel(result, '3 faz, 3 tel', true);
        if (ft.includes('3f4t')) result = setCheckboxByLabel(result, '3 faz, 4 tel', true);
        if (ft.includes('DA2k')) result = setCheckboxByLabel(result, '2 kutup', true);
        if (ft.includes('DA3k')) result = setCheckboxByLabel(result, '3 kutup', true);
    }

    // 6. TOPRAKLAYICI TİPİ
    if (options.toprakRing) result = setCheckboxByLabel(result, 'Ring', true);
    if (options.toprakYuzeysel) result = setCheckboxByLabel(result, 'Yüzeysel', true);
    if (options.toprakTemel) result = setCheckboxByLabel(result, 'Temel', true);
    if (options.toprakDerin) result = setCheckboxByLabel(result, 'Derin', true);
    if (options.toprakBelirlenemedi) result = setCheckboxByLabel(result, 'Belirlenemedi', true);

    // 7. DOĞRUDAN DOKUNMAYA KARŞI KORUMA ÖNLEMİ
    // Template'de tek hücrede birleşik checkbox'lar: Gerilim altındaki, Mahfaza, Engel, El ulaşma, İlave koruma
    if (options.korumaYalitma) result = setCheckboxByLabel(result, 'Gerilim altındaki bölümlerin yalıtılması', true);
    if (options.korumaMahfaza) result = setCheckboxByLabel(result, 'Mahfaza', true);
    if (options.korumaEngel) result = setCheckboxByLabel(result, 'Engel', true);
    if (options.korumaElUlasma) result = setCheckboxByLabel(result, 'El ulaşma uzaklığı', true);
    if (options.korumaIlaveRCD) result = setCheckboxByLabel(result, 'İlave koruma', true);

    // 7b. DOLAYLI DOKUNMAYA KARŞI KORUMA ÖNLEMİ
    if (options.korumaEspotansiyel) {
        result = setCheckboxByLabel(result, 'Eşpotansiyel topraklama ve beslemenin otomatik kesilmesi', true);
    }
    if (options.korumaDolayliYalitma || options.korumaKoruyucuYalitma) {
        result = setCheckboxByLabel(result, 'Koruyucu yalıtma', true);
    }
    if (options.korumaAyirma || options.korumaKoruyucuAyirma) {
        result = setCheckboxByLabel(result, 'Koruyucu ayırma', true);
    }
    if (options.korumaKucukGerilim) {
        result = setCheckboxByLabel(result, 'Küçük gerilim', true);
    }

    // 8. TESİSATTA KAPSAMLI DEĞİŞİKLİK
    if (options.kapsamliDegisiklik !== undefined) {
        result = setVarYokCheckbox(result, 'kapsamlı değişiklik var mı', options.kapsamliDegisiklik);
    }

    // 8b. DKD/SPD (Evet/Hayır - Var/Yok değil)
    if (options.dkdSpdKullanildi !== undefined) {
        result = setCheckboxInContext(result, 'DKD/SPD', 'Evet', options.dkdSpdKullanildi === true);
        result = setCheckboxInContext(result, 'DKD/SPD', 'Hayır', options.dkdSpdKullanildi === false);
    }

    // 9. ÖNCEKİ KONTROL ETİKETİ
    if (options.oncekiKontrolEtiketi !== undefined) {
        result = setVarYokCheckbox(result, 'önceki periyodik kontrol etiketi var mı', options.oncekiKontrolEtiketi);
    }

    // 10. ÖLÇÜM METODU - Template label'ları
    if (options.olcumCevrimEmpedansi || options.olcumCevrim) result = setCheckboxByLabel(result, 'Çevrim Empedansı', true);
    if (options.olcum3UcluTopraklama || options.olcum3Uclu) result = setCheckboxByLabel(result, 'Üç Uçlu Karşılaştırma', true);
    if (options.olcumKlamp) result = setCheckboxByLabel(result, 'Klamp Yöntemi', true);

    return result;
}

// ============ TABLO İŞLEMLERİ ============

/**
 * Tüm tabloları bul ve indeksle
 */
function findAllTables(docXml) {
    const tableRegex = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
    const tables = [];
    let match;
    while ((match = tableRegex.exec(docXml)) !== null) {
        const text = getTableText(match[0]);
        tables.push({
            xml: match[0],
            text: text,
            index: match.index
        });
    }
    return tables;
}

/**
 * Belirli metni içeren tabloyu bul
 */
function findTableByText(tables, searchText) {
    for (const table of tables) {
        if (table.text.includes(searchText)) {
            return table;
        }
    }
    return null;
}

/**
 * Belirli metinlerden birini içeren tabloyu bul
 */
function findTableByTexts(tables, searchTexts) {
    for (const table of tables) {
        for (const text of searchTexts) {
            if (table.text.includes(text)) {
                return table;
            }
        }
    }
    return null;
}

/**
 * Belirli metni içeren tüm tabloları bul
 */
function findAllTablesByText(tables, searchText) {
    return tables.filter(t => t.text.includes(searchText));
}

// ============ PANO KONTROL TABLOSU ============

/**
 * Pano kontrol tablosunu doldur
 * Her pano için 27 kriterlik tablo var
 * Kriterlere U (Uygun), UD (Uygun Değil), UY (Uygulanamaz) yazılır
 */
function fillPanoKontrolTable(docXml, panolar) {
    if (!panolar || panolar.length === 0) return docXml;

    const tables = findAllTables(docXml);

    // Pano kontrol tablolarını bul
    // Her pano icin ayri bir tablo var - "KONTROL KRİTERLERİ" başlığı ile tanımlanır
    const panoTables = [];
    for (const table of tables) {
        if (table.text.includes('KONTROL KRİTERLERİ') && table.text.includes('Pano Adı')) {
            panoTables.push(table);
        }
    }

    // Alternatif: "Pano Adı/Ekipman Tanımlaması" içeren tablolar
    if (panoTables.length === 0) {
        for (const table of tables) {
            if (table.text.includes('Pano Adı/Ekipman') || table.text.includes('Pano Adı') || table.text.includes('PANO ADI')) {
                panoTables.push(table);
            }
        }
    }

    // Alternatif: "Gözle Kontrol" veya "Madde" içeren tablolar
    if (panoTables.length === 0) {
        for (const table of tables) {
            if ((table.text.includes('Madde') || table.text.includes('madde')) &&
                (table.text.includes('Uygun') || table.text.includes('U '))) {
                panoTables.push(table);
            }
        }
    }

    if (panoTables.length === 0) {
        for (const table of tables) {
            if (table.text.includes('Gözle') || table.text.includes('GÖZLE')) {
                panoTables.push(table);
            }
        }
    }

    let result = docXml;

    for (let panoIndex = 0; panoIndex < Math.min(panolar.length, panoTables.length); panoIndex++) {
        const pano = panolar[panoIndex];
        const table = panoTables[panoIndex];

        try {
            let newTable = table.xml;

            // Pano adını yaz
            if (pano.panoAdi) {
                newTable = setValueByLabel(newTable, 'Pano Adı/Ekipman Tanımlaması', pano.panoAdi);
            }

            // Termal foto bilgilerini yaz
            const termalTarih = pano.termalFotoTarih || pano.termalFotografTarihi;
            const termalNo = pano.termalFotoNo || pano.termalFotografNo;
            if (termalTarih) {
                newTable = setValueByLabel(newTable, 'Fotoğraf tarihi', termalTarih);
            }
            if (termalNo) {
                newTable = setValueByLabel(newTable, 'Fotoğraf no', termalNo);
            }

            // Kriter satırlarını doldur - 4 sütunlu: Kriter | Değerlendirme | Kriter | Değerlendirme
            const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
            const rows = newTable.match(rowRegex) || [];

            let kriterIndex = 1;
            for (let ri = 0; ri < rows.length && kriterIndex <= 27; ri++) {
                const row = rows[ri];
                const rowText = getRowText(row);

                // Başlık ve section satırlarını atla
                if (rowText.includes('TEST VE KONTROLLER') || rowText.includes('KONTROL KRİTERLERİ') ||
                    rowText.includes('Pano Adı') || rowText.includes('Kontrol Kriteri') ||
                    rowText.includes('Değerlendirme') || rowText.length === 0) {
                    continue;
                }

                const cellRegex = /<w:tc[^>]*>[\s\S]*?<\/w:tc>/g;
                const cells = row.match(cellRegex) || [];

                // 1 hücreli satır = section başlığı (PANO VE DİĞER, TOPRAKLANMIŞ, vs.)
                if (cells.length <= 1) continue;

                // 4 hücreli satır: kriter1 | değer1 | kriter2 | değer2
                if (cells.length === 4) {
                    // Sol taraf
                    const kriterKey1 = `kriter${kriterIndex}`;
                    const kriterValue1 = pano[kriterKey1] || 'U';
                    const newCell1 = writeToCell(cells[1], kriterValue1);
                    newTable = newTable.replace(cells[1], newCell1);
                    kriterIndex++;

                    // Sağ taraf (eğer metin varsa)
                    const rightText = getCellText(cells[2]).trim();
                    if (rightText && rightText.length > 2) {
                        const kriterKey2 = `kriter${kriterIndex}`;
                        const kriterValue2 = pano[kriterKey2] || 'U';
                        const newCell2 = writeToCell(cells[3], kriterValue2);
                        newTable = newTable.replace(cells[3], newCell2);
                        kriterIndex++;
                    }
                }
            }

            result = result.replace(table.xml, newTable);
        } catch (e) {
            console.error(`Pano ${panoIndex + 1} tablosu doldurulurken hata:`, e.message);
        }
    }

    // Eğer tablo bulunamadıysa, alternatif yöntem: tüm tabloları tarayarak
    // satır bazlı kriter numarası içeren satırları bul
    if (panoTables.length === 0 && panolar.length > 0) {
        console.log('Pano kontrol tabloları bulunamadı, alternatif yöntem deneniyor...');
        result = fillPanoKontrolAlternative(result, panolar);
    }

    return result;
}

/**
 * Alternatif pano kontrol tablosu doldurma
 * Tablo bulunamazsa satır bazlı arama yapar
 */
function fillPanoKontrolAlternative(docXml, panolar) {
    if (!panolar || panolar.length === 0) return docXml;

    let result = docXml;
    const tables = findAllTables(result);

    // Her pano için ayrı section bulmaya çalış
    for (let pi = 0; pi < panolar.length; pi++) {
        const pano = panolar[pi];

        // Kriter sayacı: 1'den 27'ye
        for (let ki = 1; ki <= 27; ki++) {
            const kriterKey = `kriter${ki}`;
            const kriterValue = pano[kriterKey] || 'U';
            // Bu değerler zaten tablolara yazıldıysa skip
            // Aksi halde sonraki aşamada XML doğrudan yazılabilir
        }
    }

    return result;
}

// ============ LİNYE TABLOSU ============

/**
 * Linye tablosunu doldur
 * Sütunlar: No, Pano/Linye, Eğri tipi, Kutup, In(A), Icu(kA), Faz(mm²), N(mm²), PE(mm²),
 *           Ib(A), Iz(A), IΔ(mA), TΔ(ms), Sonuç(Not)
 */
function fillLinyeTable(docXml, linyeler, rapor) {
    if (!linyeler || linyeler.length === 0) return docXml;

    const tables = findAllTables(docXml);

    // Linye tablosunu bul - "Eğri" veya "Linye" veya "İletken kesiti" gibi metinler
    let linyeTable = findTableByTexts(tables, [
        'Eğri tipi', 'eğri tipi', 'EĞRI',
        'Linye', 'LİNYE', 'linye',
        'İletken kesiti', 'İLETKEN KESİTİ',
        'Kutup', 'KUTUP'
    ]);

    // Alternatif: Icu veya In(A) içeren tablo
    if (!linyeTable) {
        linyeTable = findTableByTexts(tables, ['Icu', 'ICU', 'In(A)', 'In (A)']);
    }

    if (!linyeTable) {
        console.log('Linye tablosu bulunamadı');
        return docXml;
    }

    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    const rows = linyeTable.xml.match(rowRegex) || [];

    let newTable = linyeTable.xml;
    let dataRowIndex = 0;

    const sistemTipi = (rapor?.sistemTipi || 'TN').toUpperCase();
    const isTT = sistemTipi === 'TT';

    for (let i = 0; i < rows.length && dataRowIndex < linyeler.length; i++) {
        const row = rows[i];
        const rowText = getRowText(row);

        // Başlık satırlarını atla
        if (rowText.includes('Eğri') || rowText.includes('eğri') ||
            rowText.includes('Linye') || rowText.includes('LİNYE') ||
            rowText.includes('Kutup') || rowText.includes('KUTUP') ||
            rowText.includes('İletken') || rowText.includes('Sonuç') ||
            rowText.includes('Icu') || rowText.includes('ICU') ||
            rowText.includes('No') || rowText.length === 0) {
            continue;
        }

        const cellRegex = /<w:tc[^>]*>[\s\S]*?<\/w:tc>/g;
        const cells = row.match(cellRegex) || [];

        // En az 10 hücre olmalı
        if (cells.length < 10) continue;

        // İlk hücre numara olmalı
        const firstCell = getCellText(cells[0]).trim();
        if (!/^\d+$/.test(firstCell) && firstCell !== '') continue;

        const linye = linyeler[dataRowIndex];

        try {
            const newRow = fillLinyeRow(row, cells, linye, dataRowIndex + 1, isTT);
            const rowIndex = newTable.indexOf(row);
            if (rowIndex !== -1) {
                newTable = newTable.substring(0, rowIndex) + newRow + newTable.substring(rowIndex + row.length);
            }
        } catch (e) {
            console.error(`Linye ${dataRowIndex + 1} satırı doldurulurken hata:`, e.message);
        }

        dataRowIndex++;
    }

    return docXml.replace(linyeTable.xml, newTable);
}

/**
 * Tek bir linye satırını doldur
 */
function fillLinyeRow(rowXml, cells, linye, rowNum, isTT) {
    const inA = parseFloat(linye.inA) || 0;
    const icuKA = parseFloat(linye.icuKA) || 0;
    const egriTipi = linye.egriTipi || 'C';
    const zx = parseFloat(linye.zx || linye.zxOhm) || 0;
    const rcdIAn = parseFloat(linye.rcdIAn) || 0;
    const rcdTd = parseFloat(linye.rcdTd || linye.rcdTSuresi) || 0;

    // Hesaplamalar (eğer DB'de yoksa server-side hesapla)
    let ia = parseFloat(linye.ia) || 0;
    if (!ia && inA) {
        if (egriTipi === 'B') ia = inA * 5;
        else if (egriTipi === 'C') ia = inA * 10;
        else if (egriTipi === 'D') ia = inA * 20;
        else if (egriTipi === 'TMS' || egriTipi === 'TMŞ') ia = inA * 10;
    }

    let zsRa = parseFloat(linye.zsRa) || 0;
    if (!zsRa) {
        const rcdVar = rcdIAn > 0;
        if (rcdVar) {
            const ideltaA = rcdIAn / 1000;
            zsRa = ideltaA > 0 ? 50 / ideltaA : 0;
        } else if (ia > 0) {
            zsRa = isTT ? 50 / ia : 230 / ia;
        }
    }

    let ik1 = parseFloat(linye.ik1) || 0;
    if (!ik1 && zx > 0) {
        ik1 = 230 / zx;
    }

    // Sonuç belirleme
    let sonuc = linye.sonuc || '';
    let notKodu = linye.notKodu || '';
    if (!sonuc) {
        if (zx > 0 && zsRa > 0 && zx <= zsRa) {
            const rcdVar = rcdIAn > 0;
            notKodu = rcdVar ? 'Not-4' : 'Not-1';
            sonuc = `Uygun (${notKodu})`;
        } else if (zx > 0 && zsRa > 0 && zx > zsRa) {
            notKodu = 'Not-2';
            sonuc = `Uygun Değil (${notKodu})`;
        } else {
            sonuc = '-';
        }
    }

    // Pano/Linye adı - support both separate fields and combined field
    const panoLinye = linye.panoLinyeAdi || [linye.panoAdi, linye.linyeAdi].filter(Boolean).join(' / ') || '-';

    // Field fallbacks for DB/form name mismatches
    const kesitFaz = linye.kesitFaz || linye.fazKesiti || '-';
    const kesitN = linye.kesitN || linye.nKesiti || '-';
    const kesitPE = linye.kesitPE || linye.peKesiti || '-';
    const ibVal = linye.ib || linye.ibA;
    const izVal = linye.iz || linye.izA;

    // 14 sütun: No, Pano/Linye, Eğri tipi, Kutup, In(A), Icu(kA), Faz(mm²), N(mm²), PE(mm²),
    //           Ib(A), Iz(A), IΔ(mA), TΔ(ms), Sonuç(Not)
    const values = [
        rowNum.toString(),                                      // 0: No
        panoLinye,                                               // 1: Pano/Linye
        egriTipi,                                                // 2: Eğri tipi
        linye.kutupSayisi || '-',                                // 3: Kutup
        inA ? inA.toString() : '-',                              // 4: In (A)
        icuKA ? icuKA.toString() : '-',                          // 5: Icu (kA)
        kesitFaz,                                                // 6: Faz (mm²)
        kesitN,                                                  // 7: N (mm²)
        kesitPE,                                                 // 8: PE (mm²)
        ibVal ? numStr(ibVal, 1) : '-',                          // 9: Ib (A)
        izVal ? numStr(izVal, 1) : '-',                          // 10: Iz (A)
        rcdIAn ? rcdIAn.toString() : '-',                        // 11: IΔ (mA)
        rcdTd ? rcdTd.toString() : '-',                          // 12: TΔ (ms)
        sonuc                                                    // 13: Sonuç (Not)
    ];

    let newRow = rowXml;
    for (let ci = 0; ci < Math.min(cells.length, values.length); ci++) {
        const newCell = writeToCell(cells[ci], String(values[ci]));
        newRow = newRow.replace(cells[ci], newCell);
    }

    return newRow;
}

// ============ POTANSİYEL DENGELEME TABLOSU ============

/**
 * Potansiyel dengeleme tablosunu doldur
 * Sütunlar: No, Bölüm, İletken Kesiti, Süreklilik(Ω), Tamamlayıcı Kesit, Tamamlayıcı Süreklilik, Sonuç
 */
function fillPotansiyelDengelemeTable(docXml, veriler) {
    if (!veriler || veriler.length === 0) return docXml;

    const tables = findAllTables(docXml);

    // Potansiyel dengeleme tablosunu bul
    let pdTable = findTableByTexts(tables, [
        'Potansiyel', 'POTANSİYEL', 'potansiyel',
        'Dengeleme', 'DENGELEME', 'dengeleme',
        'Süreklilik', 'SÜREKLİLİK'
    ]);

    if (!pdTable) {
        console.log('Potansiyel dengeleme tablosu bulunamadı');
        return docXml;
    }

    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    const rows = pdTable.xml.match(rowRegex) || [];

    let newTable = pdTable.xml;
    let dataRowIndex = 0;

    for (let i = 0; i < rows.length && dataRowIndex < veriler.length; i++) {
        const row = rows[i];
        const rowText = getRowText(row);

        // Başlık satırlarını atla
        if (rowText.includes('Potansiyel') || rowText.includes('POTANSİYEL') ||
            rowText.includes('Dengeleme') || rowText.includes('DENGELEME') ||
            rowText.includes('Süreklilik') || rowText.includes('SÜREKLİLİK') ||
            rowText.includes('Bölüm') || rowText.includes('BÖLÜM') ||
            rowText.includes('Kesit') || rowText.includes('KESİT') ||
            rowText.includes('Sonuç') || rowText.includes('SONUÇ') ||
            rowText.includes('No') || rowText.length === 0) {
            continue;
        }

        const cellRegex = /<w:tc[^>]*>[\s\S]*?<\/w:tc>/g;
        const cells = row.match(cellRegex) || [];
        if (cells.length < 5) continue;

        const firstCell = getCellText(cells[0]).trim();
        if (!/^\d+$/.test(firstCell) && firstCell !== '') continue;

        const veri = veriler[dataRowIndex];

        // 7 sütun: No, Bölüm, İletken Kesiti, Süreklilik(Ω), Tamamlayıcı Kesit, Tamamlayıcı Süreklilik, Sonuç
        const values = [
            (dataRowIndex + 1).toString(),                           // 0: No
            veri.olcumNoktasi || veri.bolumOlcumNoktasi || '-',      // 1: Bölüm/Ölçüm noktası
            veri.iletkenKesiti || '-',                               // 2: İletken Kesiti
            numStr(veri.sureklillikOhm || veri.sureklilik, 4),       // 3: Süreklilik (Ω)
            veri.tamamlayiciKesit || '-',                            // 4: Tamamlayıcı Kesit
            numStr(veri.tamamlayiciSureklilik, 4),                   // 5: Tamamlayıcı Süreklilik
            veri.sonuc || 'Uygun'                                    // 6: Sonuç
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

    return docXml.replace(pdTable.xml, newTable);
}

// ============ ZEMİN İZOLASYON TABLOSU ============

/**
 * Zemin izolasyon tablosunu doldur
 * Sütunlar: No, Yer, En(m), Boy(m), İzolasyon Direnci(kΩ), Sonuç
 */
function fillZeminIzolasyonTable(docXml, veriler) {
    if (!veriler || veriler.length === 0) return docXml;

    const tables = findAllTables(docXml);

    // Zemin izolasyon tablosunu bul
    let ziTable = findTableByTexts(tables, [
        'Zemin', 'ZEMİN', 'zemin',
        'İzolasyon', 'İZOLASYON', 'izolasyon'
    ]);

    if (!ziTable) {
        console.log('Zemin izolasyon tablosu bulunamadı');
        return docXml;
    }

    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    const rows = ziTable.xml.match(rowRegex) || [];

    let newTable = ziTable.xml;
    let dataRowIndex = 0;

    for (let i = 0; i < rows.length && dataRowIndex < veriler.length; i++) {
        const row = rows[i];
        const rowText = getRowText(row);

        // Başlık satırlarını atla
        if (rowText.includes('Zemin') || rowText.includes('ZEMİN') ||
            rowText.includes('İzolasyon') || rowText.includes('İZOLASYON') ||
            rowText.includes('Direnç') || rowText.includes('DİRENÇ') ||
            rowText.includes('Yer') || rowText.includes('YER') ||
            rowText.includes('Boy') || rowText.includes('BOY') ||
            rowText.includes('Sonuç') || rowText.includes('SONUÇ') ||
            rowText.includes('No') || rowText.length === 0) {
            continue;
        }

        const cellRegex = /<w:tc[^>]*>[\s\S]*?<\/w:tc>/g;
        const cells = row.match(cellRegex) || [];
        if (cells.length < 4) continue;

        const firstCell = getCellText(cells[0]).trim();
        if (!/^\d+$/.test(firstCell) && firstCell !== '') continue;

        const veri = veriler[dataRowIndex];

        // 6 sütun: No, Yer, En(m), Boy(m), İzolasyon Direnci(kΩ), Sonuç
        const values = [
            (dataRowIndex + 1).toString(),                           // 0: No
            veri.olcumNoktasi || veri.yer || '-',                    // 1: Yer
            numStr(veri.eni || veri.enM, 2),                         // 2: En (m)
            numStr(veri.boyu || veri.boyM, 2),                       // 3: Boy (m)
            numStr(veri.izolasyonDirenciKOhm || veri.izolasyonDirenci, 2), // 4: İzolasyon Direnci (kΩ)
            veri.sonuc || 'Uygun'                                    // 5: Sonuç
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

    return docXml.replace(ziTable.xml, newTable);
}

// ============ KUSUR TABLOSU ============

/**
 * Kusur açıklamalarını doldur
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
        'pen_kopru': 'PEN köprüsü dışında PE-N birleştirilmiş (**)',
        'pe_kesit': 'PE iletken kesiti yetersiz (*)',
        'sigorta_secimi': 'Sigorta seçimi uygun değil (*)',
        'kablo_kesit': 'Kablo kesiti yetersiz (*)',
        'pano_ip': 'Pano koruma sınıfı (IP) yetersiz (**)'
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
    const tables = findAllTables(docXml);

    for (const table of tables) {
        if (table.text.includes('KUSUR AÇIKLAMALARI') || table.text.includes('Kusur Açıklamaları') ||
            table.text.includes('Kusur açıklamaları') || table.text.includes('KUSUR')) {
            const rows = table.xml.match(/<w:tr[^>]*>[\s\S]*?<\/w:tr>/g) || [];
            // Son satır veri satırı
            if (rows.length >= 2) {
                const dataRow = rows[rows.length - 1];
                const cells = dataRow.match(/<w:tc[^>]*>[\s\S]*?<\/w:tc>/g) || [];
                if (cells.length > 0) {
                    const newCell = writeToCell(cells[0], kusurText);
                    const newRow = dataRow.replace(cells[0], newCell);
                    const newTableXml = table.xml.replace(dataRow, newRow);
                    return docXml.replace(table.xml, newTableXml);
                }
            }
        }
    }

    return docXml;
}

// ============ ANA FONKSİYON ============

/**
 * FR7.2.40 Elektrik İç Tesisat Ölçüm Raporu Word dosyası oluştur
 *
 * @param {Object} rapor - ElektrikIcTesisatRaporu (panolar, linyeler, potansiyelDengeleme, zeminIzolasyon dahil)
 * @param {Object} isEmri - İş emri objesi (customer, firmaBilgi dahil)
 * @param {Object} options - Ek seçenekler (tekniker, checkboxlar, notlar, vb.)
 * @returns {Buffer} - Word dosyası buffer'ı
 */
async function generateElektrikIcTesisatWord(rapor, isEmri, options = {}) {
    // Şablonu oku
    const templateContent = fs.readFileSync(TEMPLATE_PATH);
    const zip = await JSZip.loadAsync(templateContent);
    let docXml = await zip.file('word/document.xml').async('string');

    // Firma bilgileri
    const firma = isEmri?.customer || {};
    const firmaBilgi = isEmri?.firmaBilgi || {};

    // === 1. FİRMA BİLGİLERİ ===
    try {
        docXml = setValueByLabel(docXml, 'Firma Adı', firma.unvan);
        docXml = setValueByLabel(docXml, 'Rapor Numarası', rapor.raporNo);
        docXml = setValueByLabel(docXml, 'Periyodik Kontrol Adresi', firma.adres);
        docXml = setValueByLabel(docXml, 'Rapor Tarihi', formatDate(rapor.bitisTarihi || new Date()));
        const _isgKatipCombined = [firmaBilgi.isgKatipId, firmaBilgi.isgKatipId2, firmaBilgi.isgKatipId3, firmaBilgi.isgKatipId4]
            .map(v => (v == null ? '' : String(v).trim())).filter(v => v && v !== '-').join(' / ');
        docXml = setValueByLabel(docXml, 'İSG-KATİP Sözleşme ID', options.isgKatipNo || _isgKatipCombined || firmaBilgi.isgKatipId || rapor.isgKatipNo);
        docXml = setValueByLabel(docXml, 'SGK Sicil Numarası', options.sgkSicilNo || firmaBilgi.sgkSicilNo || rapor.sgkSicilNo);
        docXml = setValueByLabel(docXml, 'Periyodik Kontrol Başlangıç Tarihi ve Saati', formatDateTime(rapor.baslangicTarihi, options.baslangicSaati || '09:00'));
        docXml = setValueByLabel(docXml, 'Periyodik Kontrol Bitiş Tarihi ve Saati', formatDateTime(rapor.bitisTarihi, options.bitisSaati || '17:00'));
        docXml = setValueByLabel(docXml, 'Bir Sonraki Periyodik Kontrol Tarihi', getNextYearDate(rapor.bitisTarihi));
    } catch (e) {
        console.error('Firma bilgileri doldurulurken hata:', e.message);
    }

    // === 2. EKİPMAN BİLGİLERİ ===
    try {
        docXml = setValueByLabel(docXml, 'Enerji sağlayan kuruluş', rapor.enerjiSaglayan || rapor.enerjiFirma || options.enerjiSaglayan || options.enerjiFirma || 'MEDAŞ');
        docXml = setValueByLabel(docXml, 'Şebeke gerilimi', options.sebekeGerilimi || rapor.beslemeNominalGerilim || '380');
        // Proje bilgileri alanı template'de yok, checkbox ile kontrol ediliyor
        docXml = setValueByLabel(docXml, 'Ekipmanın kullanım amacı', rapor.ekipmanKullanimAmaci || rapor.kullanimAmaci || options.ekipmanKullanimAmaci || options.kullanimAmaci || firma.spiKodu || 'FABRİKA');
        docXml = setValueByLabel(docXml, 'Son kontrol tarihi', rapor.sonKontrolTarihi ? formatDate(rapor.sonKontrolTarihi) : (options.sonKontrolTarihi ? formatDate(options.sonKontrolTarihi) : '-'));
        // Hava durumu ve Zemin nem durumu bu template'de yok (topraklama template'ine ait)
        // DKD/SPD ve İlave topraklama
        // DKD/SPD checkbox ile kontrol ediliyor, ayrıca setValueByLabel yok
        if (rapor.ilaveTopraklamaElektrotu) {
            docXml = setValueByLabel(docXml, 'İlave topraklama elektrotu', rapor.ilaveTopraklamaElektrotu);
        }
    } catch (e) {
        console.error('Ekipman bilgileri doldurulurken hata:', e.message);
    }

    // === 3. 2.1 EK ALANLAR (İç tesisat'a özel) ===
    try {
        docXml = setValueByLabel(docXml, 'Faz iletkenlerinin sayısı ve tipi', rapor.fazIletkenTipi || rapor.fazIletkenSayisiTipi || options.fazIletkenTipi || options.fazIletkenSayisiTipi || '-');
        docXml = setValueByLabel(docXml, 'Temel topraklama direnci', rapor.temelTopraklamaDirenci || options.temelTopraklamaDirenci || '-');
        docXml = setValueByLabel(docXml, 'Sistem topraklama iletkeni', rapor.sistemTopraklamaIletkeni || options.sistemTopraklamaIletkeni || '-');
        docXml = setValueByLabel(docXml, 'Ana eşpotansiyel iletkeni', rapor.anaEspotansiyelIletkeni || options.anaEspotansiyelIletkeni || '-');
        // Nominal gerilim, frekans, hata akımı, çevrim empedansı
        if (rapor.nominalGerilim || options.nominalGerilim) {
            docXml = setValueByLabel(docXml, 'Nominal gerilim', rapor.nominalGerilim || options.nominalGerilim);
        }
        if (rapor.nominalFrekans || options.nominalFrekans) {
            docXml = setValueByLabel(docXml, 'Nominal frekans', rapor.nominalFrekans || options.nominalFrekans);
        }
        if (rapor.hataAkimi || options.hataAkimi) {
            docXml = setValueByLabel(docXml, 'Hata akımı', rapor.hataAkimi || options.hataAkimi);
        }
        if (rapor.cevrimEmpedansi || options.cevrimEmpedansi) {
            docXml = setValueByLabel(docXml, 'Çevrim empedansı', rapor.cevrimEmpedansi || options.cevrimEmpedansi);
        }
        // Ana kesici bilgileri
        const anaKesiciTipi = rapor.anaKesiciTipi || options.anaKesiciTipi || '-';
        const anaKesiciNominalAkim = rapor.anaKesiciNominalAkim || options.anaKesiciNominalAkim || '';
        const anaKesiciStr = anaKesiciNominalAkim ? `${anaKesiciTipi} / ${anaKesiciNominalAkim}A` : anaKesiciTipi;
        docXml = setValueByLabel(docXml, 'Ana kesici karakteristikleri', anaKesiciStr);
        docXml = setValueByLabel(docXml, 'TT-TN-S Şebeke için ana RCD anma akımı', rapor.anaRcdAnmaAkimi || options.anaRcdAnmaAkimi || '-');
        docXml = setValueByLabel(docXml, 'TT-TNS Şebeke için ana RCD test akımı', rapor.anaRcdTestAkimi || options.anaRcdTestAkimi || '-');
    } catch (e) {
        console.error('2.1 ek alanlar doldurulurken hata:', e.message);
    }

    // === 4. ÖLÇÜM CİHAZI (3 cihaz desteği) ===
    try {
        const formData = typeof rapor.formData === 'string' ? JSON.parse(rapor.formData) : (rapor.formData || {});

        // Helper: build cihaz object from flat form fields (cihaz1Adi, cihaz1SeriNo, etc.)
        function buildCihazFromFlat(src, prefix) {
            const obj = {};
            if (src[`${prefix}Adi`]) obj.cihazAdi = src[`${prefix}Adi`];
            if (src[`${prefix}SeriNo`]) obj.seriNo = src[`${prefix}SeriNo`];
            if (src[`${prefix}Kalibrasyon`]) obj.kalibrasyonTarihi = src[`${prefix}Kalibrasyon`];
            if (src[`${prefix}KalibrasyonGecerlilik`]) obj.kalibrasyonGecerlilikTarihi = src[`${prefix}KalibrasyonGecerlilik`];
            if (src[`${prefix}KalibrasyonNo`]) obj.kalibrasyonNo = src[`${prefix}KalibrasyonNo`];
            return Object.keys(obj).length > 0 ? obj : null;
        }

        // Flat field fallbacks from options and formData
        const flatCihaz1 = buildCihazFromFlat(options, 'cihaz1') || buildCihazFromFlat(formData, 'cihaz1');
        const flatCihaz2 = buildCihazFromFlat(options, 'cihaz2') || buildCihazFromFlat(formData, 'cihaz2');
        const flatCihaz3 = buildCihazFromFlat(options, 'cihaz3') || buildCihazFromFlat(formData, 'cihaz3');

        // Cihaz 1 - Ana ölçüm cihazı
        const cihaz1 = options.cihaz1 || formData.cihaz1 || formData.olcumCihazi || formData.cihaz || options.cihaz || flatCihaz1 || {};
        const kal1Tarihi = cihaz1.kalibrasyonTarihi ? formatDate(cihaz1.kalibrasyonTarihi) : '-';
        const kal1Gecerlilik = cihaz1.kalibrasyonGecerlilikTarihi ? formatDate(cihaz1.kalibrasyonGecerlilikTarihi) : '-';
        docXml = setValueByLabel(docXml, 'Cihaz adı', cihaz1.cihazAdi || '-');
        docXml = setValueByLabel(docXml, 'Seri numarası', cihaz1.seriNo || '-');
        docXml = setValueByLabel(docXml, 'Kalibrasyon tarihi', kal1Tarihi);
        docXml = setValueByLabel(docXml, 'Kalibrasyon geçerlilik tarihi', kal1Gecerlilik);
        docXml = setValueByLabel(docXml, 'Kalibrasyon numarası', cihaz1.kalibrasyonNo || '-');

        // Cihaz 2
        const cihaz2 = options.cihaz2 || formData.cihaz2 || flatCihaz2 || {};
        if (cihaz2.cihazAdi) {
            // İkinci "Cihaz adı" etiketini bul - ilk etiketten sonraki
            docXml = setNthValueByLabel(docXml, 'Cihaz adı', cihaz2.cihazAdi, 2);
            docXml = setNthValueByLabel(docXml, 'Seri numarası', cihaz2.seriNo || '-', 2);
            docXml = setNthValueByLabel(docXml, 'Kalibrasyon tarihi', cihaz2.kalibrasyonTarihi ? formatDate(cihaz2.kalibrasyonTarihi) : '-', 2);
            docXml = setNthValueByLabel(docXml, 'Kalibrasyon geçerlilik tarihi', cihaz2.kalibrasyonGecerlilikTarihi ? formatDate(cihaz2.kalibrasyonGecerlilikTarihi) : '-', 2);
            docXml = setNthValueByLabel(docXml, 'Kalibrasyon numarası', cihaz2.kalibrasyonNo || '-', 2);
        }

        // Cihaz 3
        const cihaz3 = options.cihaz3 || formData.cihaz3 || flatCihaz3 || {};
        if (cihaz3.cihazAdi) {
            docXml = setNthValueByLabel(docXml, 'Cihaz adı', cihaz3.cihazAdi, 3);
            docXml = setNthValueByLabel(docXml, 'Seri numarası', cihaz3.seriNo || '-', 3);
            docXml = setNthValueByLabel(docXml, 'Kalibrasyon tarihi', cihaz3.kalibrasyonTarihi ? formatDate(cihaz3.kalibrasyonTarihi) : '-', 3);
            docXml = setNthValueByLabel(docXml, 'Kalibrasyon geçerlilik tarihi', cihaz3.kalibrasyonGecerlilikTarihi ? formatDate(cihaz3.kalibrasyonGecerlilikTarihi) : '-', 3);
            docXml = setNthValueByLabel(docXml, 'Kalibrasyon numarası', cihaz3.kalibrasyonNo || '-', 3);
        }
    } catch (e) {
        console.error('Ölçüm cihazı bilgileri doldurulurken hata:', e.message);
    }

    // === 5. CHECKBOX'LAR ===
    try {
        docXml = fillAllCheckboxes(docXml, rapor, options);
    } catch (e) {
        console.error('Checkboxlar doldurulurken hata:', e.message);
    }

    // === 6. PANO KONTROL TABLOLARI ===
    try {
        if (rapor.panolar && rapor.panolar.length > 0) {
            docXml = fillPanoKontrolTable(docXml, rapor.panolar);
        }
    } catch (e) {
        console.error('Pano kontrol tabloları doldurulurken hata:', e.message);
    }

    // === 6B. PANO ÖLÇÜM DEĞERLERİ (tüm panolar) ===
    try {
        if (rapor.panolar && rapor.panolar.length > 0) {
            for (let pi = 0; pi < rapor.panolar.length; pi++) {
                const pano = rapor.panolar[pi];
                const nth = pi + 1; // 1-indexed

                // Field fallbacks for DB/form name mismatches
                const panoGerilimFF = pano.gerilimFF || pano.panoVff;
                const panoGerilimLN = pano.gerilimLN || pano.panoVln;
                const panoGerilimNPE = pano.gerilimNPE || pano.panoVnpe;
                const panoKisaDevre = pano.kisaDevreAkimi3Faz || pano.panoIkk;
                const panoDkdTipi = pano.dkdTipi || pano.panoDkdTipi;
                const panoDkdAkim = pano.dkdDayanmaAkimi || pano.panoDkdAkim;
                const panoTermalTarih = pano.termalFotoTarih || pano.termalFotografTarihi;
                const panoTermalNo = pano.termalFotoNo || pano.termalFotografNo;

                if (pi === 0) {
                    // İlk pano: ana alanlara yaz
                    if (pano.panoAdi) docXml = setValueByLabel(docXml, 'Pano (Ekipman) Adı-Etiketi veya Kodu', pano.panoAdi);
                    if (pano.panoZx) docXml = setValueByLabel(docXml, 'Panodan ölçülen faztoprak', pano.panoZx);
                    if (pano.panoZln) docXml = setValueByLabel(docXml, 'Panodan ölçülen faz-nötr', pano.panoZln);
                    if (panoGerilimFF) docXml = setValueByLabel(docXml, 'F-F(V)', panoGerilimFF);
                    if (panoGerilimLN) docXml = setValueByLabel(docXml, 'L-N(V)', panoGerilimLN);
                    if (panoGerilimNPE) docXml = setValueByLabel(docXml, 'N-PE(V)', panoGerilimNPE);
                    if (panoKisaDevre) docXml = setValueByLabel(docXml, 'Hesaplanan 3fazlı kısa devre', panoKisaDevre);
                    if (panoDkdTipi) docXml = setValueByLabel(docXml, 'Aşırı gerilim koruma (DKD) tipi', panoDkdTipi);
                    if (panoDkdAkim) docXml = setValueByLabel(docXml, 'Aşırı gerilim koruma(DKD) dayanma', panoDkdAkim);
                } else {
                    // Sonraki panolar: N'inci eşleşen etikete yaz
                    if (pano.panoAdi) docXml = setNthValueByLabel(docXml, 'Pano (Ekipman) Adı-Etiketi veya Kodu', pano.panoAdi, nth);
                    if (pano.panoZx) docXml = setNthValueByLabel(docXml, 'Panodan ölçülen faztoprak', pano.panoZx, nth);
                    if (pano.panoZln) docXml = setNthValueByLabel(docXml, 'Panodan ölçülen faz-nötr', pano.panoZln, nth);
                    if (panoGerilimFF) docXml = setNthValueByLabel(docXml, 'F-F(V)', panoGerilimFF, nth);
                    if (panoGerilimLN) docXml = setNthValueByLabel(docXml, 'L-N(V)', panoGerilimLN, nth);
                    if (panoGerilimNPE) docXml = setNthValueByLabel(docXml, 'N-PE(V)', panoGerilimNPE, nth);
                    if (panoKisaDevre) docXml = setNthValueByLabel(docXml, 'Hesaplanan 3fazlı kısa devre', panoKisaDevre, nth);
                    if (panoDkdTipi) docXml = setNthValueByLabel(docXml, 'Aşırı gerilim koruma (DKD) tipi', panoDkdTipi, nth);
                    if (panoDkdAkim) docXml = setNthValueByLabel(docXml, 'Aşırı gerilim koruma(DKD) dayanma', panoDkdAkim, nth);
                }
            }
        }
    } catch (e) {
        console.error('Pano ölçüm değerleri doldurulurken hata:', e.message);
    }

    // === 7. LİNYE TABLOSU ===
    try {
        if (rapor.linyeler && rapor.linyeler.length > 0) {
            docXml = fillLinyeTable(docXml, rapor.linyeler, rapor);
        }
    } catch (e) {
        console.error('Linye tablosu doldurulurken hata:', e.message);
    }

    // === 8. POTANSİYEL DENGELEME TABLOSU ===
    try {
        if (rapor.potansiyelDengeleme && rapor.potansiyelDengeleme.length > 0) {
            docXml = fillPotansiyelDengelemeTable(docXml, rapor.potansiyelDengeleme);
        }
    } catch (e) {
        console.error('Potansiyel dengeleme tablosu doldurulurken hata:', e.message);
    }

    // === 9. ZEMİN İZOLASYON TABLOSU ===
    try {
        if (rapor.zeminIzolasyon && rapor.zeminIzolasyon.length > 0) {
            docXml = fillZeminIzolasyonTable(docXml, rapor.zeminIzolasyon);
        }
    } catch (e) {
        console.error('Zemin izolasyon tablosu doldurulurken hata:', e.message);
    }

    // === 10. KUSUR AÇIKLAMALARI ===
    try {
        docXml = fillKusurTable(docXml, options.kusurlar, options.kusurAciklama);
    } catch (e) {
        console.error('Kusur tablosu doldurulurken hata:', e.message);
    }

    // === 11. SONUÇ / KANAAT ===
    try {
        const sonucMetni = rapor.genelSonuc === 'UYGUN' ? 'UYGUNDUR' : 'UYGUN DEĞİLDİR';
        // "kullanımı ... yıl süreyle UYGUNDUR/UYGUN DEĞİLDİR" pattern
        docXml = docXml.replace(
            /(kullanımı\s*\d*\s*yıl\s*süreyle[;:]*\s*)(UYGUNDUR|UYGUN DEĞİLDİR)/gi,
            `$1${sonucMetni}`
        );

        // Uygunluk notu
        if (options.uygunlukNotu) {
            docXml = setValueByLabel(docXml, 'Uygunluk notu', options.uygunlukNotu);
        }
    } catch (e) {
        console.error('Sonuç/kanaat doldurulurken hata:', e.message);
    }

    // === 12. YETKİLİ KİŞİ BİLGİLERİ ===
    try {
        if (options.tekniker) {
            docXml = setValueByLabel(docXml, 'Adı, Soyadı', options.tekniker.adSoyad);
            docXml = setValueByLabel(docXml, 'Unvanı', options.tekniker.unvan || 'Elektriksel Ölçümler Sorumlusu');
            docXml = setValueByLabel(docXml, 'Mesleği', options.tekniker.meslek || 'Elektrik Teknikeri');
            docXml = setValueByLabel(docXml, 'Diploma Tarihi', formatDate(options.tekniker.diplomaTarihi));
            docXml = setValueByLabel(docXml, 'Diploma Numarası', options.tekniker.diplomaNo);
            docXml = setValueByLabel(docXml, 'Ekipnet Kayıt No', options.tekniker.ekipnetNo);
        }
    } catch (e) {
        console.error('Yetkili kişi bilgileri doldurulurken hata:', e.message);
    }

    // === 13. NOTLAR ===
    try {
        const sabitNotlar = 'İŞ EKİPMANLARININ KULLANIMINDA SAĞLIK VE GÜVENLİK ŞARTLARI YÖNETMELİĞİ\nTesisatlar:2.3.7. Elektrik, topraklama ve yıldırımdan korunma tesisatları için periyodik kontrolde tesisat projesi aranır. İşveren, projesi olmayan tesisatların 3/12/2003 tarihli ve 25305 sayılı Resmî Gazete\'de yayımlanan Elektrik İç Tesisleri Proje Hazırlama Yönetmeliği, diğer ilgili yönetmelikler ve ilgili standartlara uygun olarak projelendirilmesini yaptırmak zorundadır.\nNot: Ölçüm Raporları Ölçüm Yapılan Günün Şartları İçin Geçerlidir';
        const ekNotlar = rapor.notlar || rapor.genelNotlar || options.notlar || options.genelNotlar || '';
        const notlarMetni = ekNotlar ? `${sabitNotlar}\n${ekNotlar}` : sabitNotlar;

        // NOTLAR tablosunu bul ve doldur
        const tableRegex2 = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
        const tables2 = docXml.match(tableRegex2) || [];
        for (const table of tables2) {
            const tableText = table.replace(/<[^>]+>/g, ' ');
            if (tableText.includes('NOTLAR') && !tableText.includes('KUSUR')) {
                const rows2 = table.match(/<w:tr[^>]*>[\s\S]*?<\/w:tr>/g) || [];
                if (rows2.length >= 2) {
                    const dataRow = rows2[rows2.length - 1];
                    const cells2 = dataRow.match(/<w:tc[^>]*>[\s\S]*?<\/w:tc>/g) || [];
                    if (cells2.length > 0) {
                        const newCell = writeToCell(cells2[0], notlarMetni);
                        const newRow = dataRow.replace(cells2[0], newCell);
                        const newTable = table.replace(dataRow, newRow);
                        docXml = docXml.replace(table, newTable);
                    }
                }
                break;
            }
        }
    } catch (e) {
        console.error('Notlar doldurulurken hata:', e.message);
    }

    // === 14. FOTOĞRAFLAR (Grid düzeni) ===
    try {
        const fotograflar = rapor.fotograflar || [];
        // Önce şablondaki eski/placeholder fotoğrafları temizle
        const cleanResult = await removeTemplatePlaceholderImages(zip, docXml);
        docXml = cleanResult.docXml;

        if (fotograflar.length > 0) {
            const result = await embedPhotosInWord(zip, docXml, fotograflar, rapor.panolar || []);
            docXml = result.docXml;
        }
    } catch (e) {
        console.error('Fotoğraflar eklenirken hata:', e.message);
    }

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
 * Dosyaya kaydet
 */
async function saveWordToFile(rapor, isEmri, options, outputPath) {
    const buffer = await generateElektrikIcTesisatWord(rapor, isEmri, options);
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
}

// ============ FOTOĞRAF EMBED FONKSİYONLARI ============

/**
 * Şablondaki eski/placeholder fotoğrafları (w:drawing blokları) temizle
 * Şablonda kalan eski resimler varsa bunları kaldırır
 */
async function removeTemplatePlaceholderImages(zip, docXml) {
    // Şablondaki tüm inline drawing'leri bul ve kaldır
    // Bu, şablona gömülü eski fotoğrafları temizler
    // Dikkat: Sadece "EKİPMAN FOTOGRAFLARI" veya "Termal" bölümündeki resimleri kaldır
    // Diğer resimler (logo, imza vb.) korunmalı

    // Strateji: Belgenin sonundaki fotoğraf tablolarını (sayfa sonu + foto grid) temizle
    // "EKİPMAN FOTOGRAFLARI" veya "FOTOĞRAF" başlığından sonraki tüm içeriği kaldır
    const fotoBaslikPattern = /<w:p[^>]*>[\s\S]*?EK(?:İ|I)PMAN\s*FOTO(?:Ğ|G)RAF(?:LARI)?[\s\S]*?<\/w:p>/gi;
    const fotoMatch = docXml.match(fotoBaslikPattern);

    if (fotoMatch && fotoMatch.length > 0) {
        // Foto başlığının pozisyonunu bul
        const fotoBaslikPos = docXml.indexOf(fotoMatch[0]);
        if (fotoBaslikPos > 0) {
            // Başlıktan önceki sayfa sonu paragrafını da bul (varsa)
            const beforeBaslik = docXml.substring(Math.max(0, fotoBaslikPos - 500), fotoBaslikPos);
            const sayfaSonuMatch = beforeBaslik.match(/<w:p[^>]*>[\s\S]*?<w:br w:type="page"\s*\/>[\s\S]*?<\/w:p>\s*$/);

            let removeFrom = fotoBaslikPos;
            if (sayfaSonuMatch) {
                removeFrom = fotoBaslikPos - sayfaSonuMatch[0].length;
            }

            // </w:body> etiketine kadar olan kısmı kaldır
            const bodyEndPos = docXml.indexOf('</w:body>');
            if (bodyEndPos > removeFrom) {
                docXml = docXml.substring(0, removeFrom) + docXml.substring(bodyEndPos);
            }
        }
    }

    // Ayrıca, şablondaki w:drawing içeren paragrafları kontrol et
    // Eğer foto placeholder'ları varsa (genellikle rIdImg veya belirli isimlerle)
    // bunları da temizle - ancak logo/imza gibi resimleri korumak için
    // sadece "foto" veya "image" isimli resimleri kaldır
    const drawingPattern = /<w:drawing>[\s\S]*?<\/w:drawing>/g;
    let match;
    const toRemove = [];

    while ((match = drawingPattern.exec(docXml)) !== null) {
        const drawing = match[0];
        // Sadece "foto", "Foto", "resim", "Resim", "image", "Picture" isimli resimleri temizle
        if (/name="[^"]*(?:foto|Foto|FOTO|resim|Resim|Picture|image|IMG_|DSC_|DCIM)/i.test(drawing)) {
            toRemove.push({ start: match.index, end: match.index + drawing.length, text: drawing });
        }
    }

    // Ters sırada kaldır (pozisyonlar kaymasın)
    for (let i = toRemove.length - 1; i >= 0; i--) {
        const item = toRemove[i];
        // Drawing'i içeren run'ı bul ve kaldır
        const beforeDrawing = docXml.substring(Math.max(0, item.start - 200), item.start);
        const runStartMatch = beforeDrawing.match(/<w:r[^>]*>\s*$/);
        const afterDrawing = docXml.substring(item.end, Math.min(docXml.length, item.end + 50));
        const runEndMatch = afterDrawing.match(/^\s*<\/w:r>/);

        if (runStartMatch && runEndMatch) {
            const fullStart = item.start - runStartMatch[0].length;
            const fullEnd = item.end + runEndMatch[0].length;
            docXml = docXml.substring(0, fullStart) + docXml.substring(fullEnd);
        }
    }

    return { docXml };
}

/**
 * Fotoğrafları Word belgesine 4'lü grid tablo olarak embed eder
 */
async function embedPhotosInWord(zip, docXml, fotograflar, panolar) {
    // Fotoğrafları pano ve tipe göre grupla
    const gruplar = {};
    fotograflar.forEach(f => {
        const panoId = f.panoId || 0;
        const tip = f.fotoTipi || 'ekipman';
        const key = `${panoId}-${tip}`;
        if (!gruplar[key]) {
            gruplar[key] = { panoId, fotoTipi: tip, fotograflar: [] };
        }
        gruplar[key].fotograflar.push(f);
    });

    // Rels dosyasını oku
    let relsXml = '';
    try {
        relsXml = await zip.file('word/_rels/document.xml.rels').async('string');
    } catch (e) {
        return { docXml };
    }

    // Content types dosyasını oku
    let ctXml = '';
    try {
        ctXml = await zip.file('[Content_Types].xml').async('string');
    } catch (e) {
        return { docXml };
    }

    // Resim uzantılarını content types'a ekle
    if (!ctXml.includes('Extension="jpeg"')) {
        ctXml = ctXml.replace('</Types>', '<Default Extension="jpeg" ContentType="image/jpeg"/></Types>');
    }
    if (!ctXml.includes('Extension="jpg"')) {
        ctXml = ctXml.replace('</Types>', '<Default Extension="jpg" ContentType="image/jpeg"/></Types>');
    }
    if (!ctXml.includes('Extension="png"')) {
        ctXml = ctXml.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
    }

    let imgCounter = 100; // Yüksek sayıdan başla çakışma olmasın
    let fotoTabloXml = '';

    for (const key of Object.keys(gruplar)) {
        const grup = gruplar[key];
        const pano = panolar.find(p => p.id === grup.panoId);
        const panoAdi = pano ? pano.panoAdi : 'Genel';
        const baslik = grup.fotoTipi === 'termal' ? `Termal Kamera Fotograflari - ${panoAdi}` : `Ekipman Fotograflari - ${panoAdi}`;

        // Başlık paragrafı
        fotoTabloXml += `<w:p><w:pPr><w:jc w:val="left"/><w:spacing w:before="240" w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>${escapeXml(baslik)}</w:t></w:r></w:p>`;

        // 4 sütunlu tablo oluştur
        const fotos = grup.fotograflar;
        const satirSayisi = Math.ceil(fotos.length / 4);

        fotoTabloXml += `<w:tbl><w:tblPr><w:tblW w:w="9600" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/><w:left w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/><w:right w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/></w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="2400"/><w:gridCol w:w="2400"/><w:gridCol w:w="2400"/></w:tblGrid>`;

        for (let satir = 0; satir < satirSayisi; satir++) {
            fotoTabloXml += '<w:tr>';

            for (let sutun = 0; sutun < 4; sutun++) {
                const fotoIdx = satir * 4 + sutun;
                fotoTabloXml += '<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>';

                if (fotoIdx < fotos.length) {
                    const foto = fotos[fotoIdx];
                    const relId = `rIdImg${imgCounter}`;
                    imgCounter++;

                    // Dosyayı oku ve zip'e ekle
                    const dosyaPath = path.join(__dirname, '..', 'public', foto.dosyaYolu);
                    let ext = path.extname(foto.dosyaYolu).toLowerCase().replace('.', '');
                    if (ext === 'jpg') ext = 'jpeg';
                    const mediaFileName = `word/media/foto${imgCounter}.${ext === 'jpeg' ? 'jpeg' : ext}`;

                    try {
                        if (fs.existsSync(dosyaPath)) {
                            const imgBuffer = fs.readFileSync(dosyaPath);
                            zip.file(mediaFileName, imgBuffer);

                            // Relationship ekle
                            const relEntry = `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/foto${imgCounter}.${ext === 'jpeg' ? 'jpeg' : ext}"/>`;
                            relsXml = relsXml.replace('</Relationships>', relEntry + '</Relationships>');

                            // Resim boyutları (EMU: 1 inch = 914400, 1 cm = 360000)
                            // ~4cm genişlik x ~5.5cm yükseklik
                            const imgW = 1440000; // ~4cm
                            const imgH = 1980000; // ~5.5cm

                            // Resim paragrafı
                            fotoTabloXml += `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${imgW}" cy="${imgH}"/><wp:docPr id="${imgCounter}" name="Foto${imgCounter}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${imgCounter}" name="foto${imgCounter}.${ext}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${imgW}" cy="${imgH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

                            // Açıklama paragrafı
                            const aciklama = foto.aciklama || `Foto ${fotoIdx + 1}`;
                            fotoTabloXml += `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="40"/></w:pPr><w:r><w:rPr><w:sz w:val="16"/><w:szCs w:val="16"/><w:i/></w:rPr><w:t>${escapeXml(aciklama)}</w:t></w:r></w:p>`;
                        } else {
                            fotoTabloXml += `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="999999"/></w:rPr><w:t>[Foto bulunamadi]</w:t></w:r></w:p>`;
                        }
                    } catch (imgErr) {
                        fotoTabloXml += `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="999999"/></w:rPr><w:t>[Foto hatasi]</w:t></w:r></w:p>`;
                    }
                } else {
                    // Boş hücre
                    fotoTabloXml += '<w:p/>';
                }

                fotoTabloXml += '</w:tc>';
            }

            fotoTabloXml += '</w:tr>';
        }

        fotoTabloXml += '</w:tbl>';

        // Etiket
        const fotoSayisi = fotos.length;
        fotoTabloXml += `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="200"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="666666"/></w:rPr><w:t>${grup.fotoTipi === 'termal' ? 'Termal Foto' : 'Fotograf'} No: ${fotoSayisi} / ${escapeXml(panoAdi)}</w:t></w:r></w:p>`;
    }

    // Fotoğraf tablolarını belgenin sonuna ekle (</w:body> etiketinden önce)
    if (fotoTabloXml) {
        // Sayfa sonu ekle ve fotoğrafları sonuna koy
        const sayfaSonu = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
        const fotoBaslik = '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="200"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="2E7D32"/></w:rPr><w:t>EKİPMAN FOTOGRAFLARI</w:t></w:r></w:p>';
        docXml = docXml.replace('</w:body>', sayfaSonu + fotoBaslik + fotoTabloXml + '</w:body>');
    }

    // Güncellenmiş rels ve content types kaydet
    zip.file('word/_rels/document.xml.rels', relsXml);
    zip.file('[Content_Types].xml', ctXml);

    return { docXml };
}

module.exports = {
    generateElektrikIcTesisatWord,
    saveWordToFile,
    formatDate,
    formatDateTime,
    getNextYearDate,
    setCheckboxByLabel,
    setCheckboxInContext,
    setSebekeTipi,
    setVarYokCheckbox,
    setKontrolNedeni,
    fillAllCheckboxes,
    fillPanoKontrolTable,
    fillLinyeTable,
    fillPotansiyelDengelemeTable,
    fillZeminIzolasyonTable,
    fillKusurTable
};
