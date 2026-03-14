/**
 * Word Checkbox İşlemleri - Ortak Modül
 * Elektrik şablonlarında kullanılan checkbox manipülasyonları
 */

const { getRowText } = require('./wordCellOperations');

/**
 * Checkbox'ı label'a göre bul ve işaretle/temizle
 * direction: 'before' (default) = label'dan önce ara, 'after' = label'dan sonra ara
 */
function setCheckboxByLabel(xml, label, checked = true, direction = 'before') {
    const labelIndex = xml.indexOf(label);
    if (labelIndex === -1) return xml;

    const checkboxPattern = /<w:checkBox>[\s\S]*?<\/w:checkBox>/g;
    let targetMatch = null;
    let absolutePos = 0;

    if (direction === 'after') {
        // Label'dan sonraki ilk checkbox'u bul
        const searchArea = xml.substring(labelIndex);
        const match = checkboxPattern.exec(searchArea);
        if (!match) return xml;
        absolutePos = labelIndex + match.index;
        targetMatch = match[0];
    } else {
        // Label'dan önceki son checkbox'u bul
        const searchStart = Math.max(0, labelIndex - 2000);
        const searchArea = xml.substring(searchStart, labelIndex);
        let lastMatch = null;
        let match;
        while ((match = checkboxPattern.exec(searchArea)) !== null) {
            lastMatch = match;
        }
        if (!lastMatch) return xml;
        absolutePos = searchStart + lastMatch.index;
        targetMatch = lastMatch[0];
    }

    const oldCheckbox = targetMatch;
    let newCheckbox;
    if (checked) {
        newCheckbox = oldCheckbox
            .replace(/<w:default w:val="[01]"/, '<w:default w:val="1"')
            .replace(/<\/w:checkBox>/, '<w:checked/></w:checkBox>');

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
 * Context (satır) içinde checkbox bul ve işaretle
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
 * Var/Yok checkbox çifti
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
 * Radio group: birini seç, diğerlerini temizle
 * direction: 'before' veya 'after' - checkbox'un label'a göre konumu
 */
function setRadioGroup(xml, labels, selectedLabel, direction = 'before') {
    if (!selectedLabel) return xml;

    for (const label of labels) {
        xml = setCheckboxByLabel(xml, label, false, direction);
    }
    xml = setCheckboxByLabel(xml, selectedLabel, true, direction);

    return xml;
}

/**
 * Satır içindeki N. checkbox'u işaretle (0-based index)
 * Row text ile satır bulunur, sonra satır içindeki tüm checkBox'lar index ile seçilir
 */
function setRowCheckboxByIndex(xml, contextLabel, checkboxIndex, checked = true) {
    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    const rows = xml.match(rowRegex) || [];

    for (const row of rows) {
        if (!row.includes(contextLabel)) continue;

        const cbRegex = /<w:checkBox>[\s\S]*?<\/w:checkBox>/g;
        let match;
        let idx = 0;
        let updatedRow = row;
        let offset = 0;

        while ((match = cbRegex.exec(row)) !== null) {
            if (idx === checkboxIndex) {
                const oldCb = match[0];
                let newCb;
                if (checked) {
                    newCb = oldCb
                        .replace(/<w:default w:val="[01]"/, '<w:default w:val="1"')
                        .replace(/<\/w:checkBox>/, '<w:checked/></w:checkBox>');
                    if (oldCb.includes('<w:checked')) {
                        newCb = oldCb.replace(/<w:default w:val="[01]"/, '<w:default w:val="1"');
                    }
                } else {
                    newCb = oldCb
                        .replace(/<w:default w:val="[01]"/, '<w:default w:val="0"')
                        .replace(/<w:checked\s*\/?>/g, '');
                }
                updatedRow = updatedRow.substring(0, match.index + offset) + newCb + updatedRow.substring(match.index + offset + oldCb.length);
                offset += newCb.length - oldCb.length;
            }
            idx++;
        }

        if (updatedRow !== row) {
            return xml.replace(row, updatedRow);
        }
    }
    return xml;
}

/**
 * Satırdaki var/yok checkbox çiftini doldur (proje + uygulama)
 * 4 checkbox sırası: proje-var[0], proje-yok[1], uygulama-var[2], uygulama-yok[3]
 */
function setRowVarYokPair(xml, contextLabel, projeValue, uygulamaValue) {
    const isProjeVar = projeValue === true || projeValue === 'true' || projeValue === 'Var' || projeValue === 'var';
    const isUygVar = uygulamaValue === true || uygulamaValue === 'true' || uygulamaValue === 'Var' || uygulamaValue === 'var';

    xml = setRowCheckboxByIndex(xml, contextLabel, 0, isProjeVar);
    xml = setRowCheckboxByIndex(xml, contextLabel, 1, !isProjeVar);
    xml = setRowCheckboxByIndex(xml, contextLabel, 2, isUygVar);
    xml = setRowCheckboxByIndex(xml, contextLabel, 3, !isUygVar);

    return xml;
}

/**
 * Config-driven checkbox doldurma
 *
 * checkboxConfig formatları:
 * { type: "radio", labels: ["A","B","C"], field: "secilenDeger" }
 * { type: "var-yok", context: "Proje var mı", field: "projeVar" }
 * { type: "var-yok-pair", context: "Sprinkler", projeField: "sprProje", uygulamaField: "sprUyg" }
 * { type: "row-radio-pair", context: "ıslak borulu", projeField: "field1", uygulamaField: "field2", options: ["sulu","köpüklü"] }
 * { type: "multi", mapping: { "fieldA": "Label A", "fieldB": "Label B" } }
 * { type: "single", label: "Periyodik Kontrol", field: "periyodikKontrol" }
 */
function fillCheckboxesFromConfig(xml, formData, checkboxConfigs) {
    if (!checkboxConfigs || !formData) return xml;

    for (const cb of checkboxConfigs) {
        const value = formData[cb.field];

        switch (cb.type) {
            case 'radio':
                if (value) {
                    xml = setRadioGroup(xml, cb.labels, value, cb.direction || 'before');
                }
                break;

            case 'var-yok':
                if (value !== undefined && value !== null) {
                    xml = setVarYokCheckbox(xml, cb.context, value === true || value === 'true' || value === 'Var');
                }
                break;

            case 'multi':
                if (cb.mapping) {
                    for (const [fieldName, label] of Object.entries(cb.mapping)) {
                        const checked = formData[fieldName] === true || formData[fieldName] === 'true';
                        xml = setCheckboxByLabel(xml, label, checked);
                    }
                }
                break;

            case 'single':
                if (value !== undefined) {
                    const checked = value === true || value === 'true' || value === 'Evet';
                    xml = setCheckboxByLabel(xml, cb.label, checked);
                }
                break;

            case 'var-yok-pair': {
                const projeVal = formData[cb.projeField];
                const uygVal = formData[cb.uygulamaField];
                if (projeVal !== undefined || uygVal !== undefined) {
                    xml = setRowVarYokPair(xml, cb.context, projeVal, uygVal);
                }
                break;
            }

            case 'row-radio-pair': {
                // 4 checkbox: proje-opt1[0], proje-opt2[1], uyg-opt1[2], uyg-opt2[3]
                const pVal = formData[cb.projeField];
                const uVal = formData[cb.uygulamaField];
                if (pVal !== undefined || uVal !== undefined) {
                    const opts = cb.options || [];
                    xml = setRowCheckboxByIndex(xml, cb.context, 0, pVal === opts[0]);
                    xml = setRowCheckboxByIndex(xml, cb.context, 1, pVal === opts[1]);
                    xml = setRowCheckboxByIndex(xml, cb.context, 2, uVal === opts[0]);
                    xml = setRowCheckboxByIndex(xml, cb.context, 3, uVal === opts[1]);
                }
                break;
            }
        }
    }

    return xml;
}

module.exports = {
    setCheckboxByLabel,
    setCheckboxInContext,
    setVarYokCheckbox,
    setRadioGroup,
    setRowCheckboxByIndex,
    setRowVarYokPair,
    fillCheckboxesFromConfig
};
