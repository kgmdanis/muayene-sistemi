/**
 * Word Rapor Ortak Yardımcı Fonksiyonlar
 */

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(dateStr, time = '09:00') {
    if (!dateStr) return '-';
    return `${formatDate(dateStr)} / ${time}`;
}

function getNextYearDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    date.setFullYear(date.getFullYear() + 1);
    return formatDate(date);
}

function escapeXml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

module.exports = {
    formatDate,
    formatDateTime,
    getNextYearDate,
    escapeXml
};
