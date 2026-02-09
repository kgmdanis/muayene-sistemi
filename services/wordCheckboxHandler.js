/**
 * Word Checkbox İşlemleri - Ortak Modül
 * Elektrik şablonlarında kullanılan checkbox manipülasyonları
 */

const { getRowText } = require('./wordCellOperations');

/**
 * Checkbox'ı label'a göre bul ve işaretle/temizle
 */
function setCheckboxByLabel(xml, label, checked = true) {
    const labelIndex = xml.indexOf(label);
    if (labelIndex === -1) return xml;

    const searchStart = Math.max(0, labelIndex - 2000);
    const searchArea = xml.substring(searchStart, labelIndex);

    const checkboxPattern = /<w:checkBox>[\s\S]*?<\/w:checkBox>/g;
    let lastMatch = null;
    let match;

    while ((match = checkboxPattern.exec(searchArea)) !== null) {
        lastMatch = match;
    }

    if (!lastMatch) return xml;

    const absolutePos = searchStart + lastMatch.index;
    const oldCheckbox = lastMatch[0];

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
 */
function setRadioGroup(xml, labels, selectedLabel) {
    if (!selectedLabel) return xml;

    for (const label of labels) {
        xml = setCheckboxByLabel(xml, label, false);
    }
    xml = setCheckboxByLabel(xml, selectedLabel, true);

    return xml;
}

/**
 * Config-driven checkbox doldurma
 *
 * checkboxConfig formatları:
 * { type: "radio", labels: ["A","B","C"], field: "secilenDeger" }
 * { type: "var-yok", context: "Proje var mı", field: "projeVar" }
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
                    xml = setRadioGroup(xml, cb.labels, value);
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
        }
    }

    return xml;
}

module.exports = {
    setCheckboxByLabel,
    setCheckboxInContext,
    setVarYokCheckbox,
    setRadioGroup,
    fillCheckboxesFromConfig
};
