// ========================================
// GLOBAL DEĞİŞKENLER
// ========================================

// API base URL'i dinamik olarak belirle (localhost veya IP)
const API_BASE = window.location.origin + '/api';
let musteriler = [];
let teklifler = [];
let hizmetler = [];
let firmaBilgi = {};
let currentFilter = 'all';
let editingMusteri = null;
let editingTeklif = null;
let currentUser = null;
let authToken = null;

// Pagination değişkenleri
const ITEMS_PER_PAGE = 20;
let currentPageMusteri = 1;
let currentPageTeklif = 1;
let currentPageMuayene = 1;
let currentPageSertifika = 1;

// Arama filtresi
let musteriSearchTerm = '';

// ========================================
// SAYFA YÜKLENDİĞİNDE
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Uygulama başlatılıyor...');
    checkAuth();
});

// Auth kontrolü
async function checkAuth() {
    // Token'ı al (login.html 'token' olarak kaydediyor)
    authToken = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (!authToken) {
        // Login sayfasına yönlendir
        window.location.href = '/login.html';
        return;
    }

    try {
        // Token'ı doğrula (server.js'de /api/auth/me endpoint'i var)
        const response = await fetch(`${API_BASE}/auth/me`, {
            headers: { 'Authorization': 'Bearer ' + authToken }
        });

        if (!response.ok) {
            throw new Error('Invalid token');
        }

        const data = await response.json();
        currentUser = data.user;

        // Superadmin'i superadmin paneline yönlendir
        if (currentUser.role === 'superadmin') {
            window.location.href = '/superadmin.html';
            return;
        }

        // Kullanıcı bilgisini göster
        updateUserInfo();

        // Uygulamayı başlat
        initializeApp();

    } catch (error) {
        console.error('Auth hatası:', error);
        // Token'ları temizle ve login'e yönlendir
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login.html';
    }
}

async function initializeApp() {
    // Süper admin için Firma Yönetimi linkini ekle
    if (currentUser && currentUser.role === 'superadmin') {
        const navContainer = document.querySelector('.sidebar-nav');
        const ayarlarLink = navContainer.querySelector('[data-page="ayarlar"]');
        
        // Firma Yönetimi linki oluştur
        const firmaLink = document.createElement('a');
        firmaLink.href = 'admin-tenants.html';
        firmaLink.className = 'nav-item';
        firmaLink.innerHTML = `
            <span class="nav-icon">🏢</span>
            <span class="nav-text">Firma Yönetimi</span>
        `;
        
        // Ayarlar'dan önce ekle
        navContainer.insertBefore(firmaLink, ayarlarLink);
    }

    // Navigasyon event listener'ları
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.getAttribute('data-page');
            if (page) {
                navigateToPage(page);
            }
        });
    });

    // Veri yükle
    await loadAllData();

    // Dashboard'u göster
    navigateToPage('dashboard');
}

// Kullanıcı bilgisini güncelle
function updateUserInfo() {
    // Sidebar footer'a kullanıcı bilgisi ekle
    const sidebarFooter = document.querySelector('.sidebar-footer');
    if (sidebarFooter && currentUser) {
        const userInfo = document.createElement('div');
        userInfo.style.cssText = 'padding: 10px; border-top: 1px solid rgba(255,255,255,0.1); margin-bottom: 10px;';
        userInfo.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 5px;">
                <span style="margin-right: 5px;">👤</span>
                <span style="font-size: 13px;">${currentUser.name}</span>
            </div>
            <div style="font-size: 11px; opacity: 0.8;">${currentUser.role === 'admin' ? 'Yönetici' : 'Kullanıcı'}</div>
        `;
        sidebarFooter.insertBefore(userInfo, sidebarFooter.firstChild);
    }
}

// API isteklerini auth token ile yap
async function authenticatedFetch(url, options = {}) {
    if (!authToken) {
        throw new Error('No auth token');
    }

    return fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            'Authorization': 'Bearer ' + authToken
        }
    });
}

// ========================================
// VERİ YÜKLEME FONKSİYONLARI
// ========================================

async function loadAllData() {
    showLoading();
    try {
        await Promise.all([
            loadMusteriler(),
            loadTeklifler(),
            loadHizmetler(),
            loadFirmaBilgi()
        ]);
        console.log('✅ Tüm veriler yüklendi');
    } catch (error) {
        console.error('❌ Veri yükleme hatası:', error);
        showToast('Veriler yüklenirken hata oluştu', 'error');
    } finally {
        hideLoading();
    }
}

async function loadMusteriler() {
    try {
        const response = await authenticatedFetch(`${API_BASE}/musteriler`);
        musteriler = await response.json();
        console.log('✅ Müşteriler yüklendi:', musteriler.length);
        renderMusteriTable();
    } catch (error) {
        console.error('❌ Müşteri yükleme hatası:', error);
        throw error;
    }
}

async function loadTeklifler() {
    try {
        const response = await authenticatedFetch(`${API_BASE}/teklifler`);
        teklifler = await response.json();
        console.log('✅ Teklifler yüklendi:', teklifler.length);
        renderTeklifTable();
    } catch (error) {
        console.error('❌ Teklif yükleme hatası:', error);
        throw error;
    }
}

async function loadHizmetler() {
    try {
        const response = await authenticatedFetch(`${API_BASE}/hizmetler`);
        const rawHizmetler = await response.json();

        // API'den düz liste geliyor, kategorilere göre grupla
        const kategoriMap = {};
        rawHizmetler.forEach(hizmet => {
            const kategoriAdi = hizmet.kategori?.ad || 'Diğer';
            if (!kategoriMap[kategoriAdi]) {
                kategoriMap[kategoriAdi] = {
                    kategori: kategoriAdi,
                    items: []
                };
            }
            kategoriMap[kategoriAdi].items.push({
                id: hizmet.id,
                ad: hizmet.ad,
                metod: hizmet.aciklama || '',
                birim: hizmet.birim,
                fiyat: parseFloat(hizmet.birimFiyat) || 0
            });
        });

        hizmetler = Object.values(kategoriMap);
        console.log('✅ Hizmetler yüklendi:', rawHizmetler.length);
    } catch (error) {
        console.error('❌ Hizmet yükleme hatası:', error);
        throw error;
    }
}

async function loadFirmaBilgi() {
    try {
        const response = await authenticatedFetch(`${API_BASE}/firma-bilgi`);
        firmaBilgi = await response.json();
        console.log('✅ Firma bilgileri yüklendi');
        renderFirmaBilgileri();
    } catch (error) {
        console.error('❌ Firma bilgisi yükleme hatası:', error);
        throw error;
    }
}

async function loadDashboardStats() {
    try {
        const response = await authenticatedFetch(`${API_BASE}/dashboard/stats`);
        const stats = await response.json();

        document.getElementById('stat-musteri').textContent = stats.musteriSayisi || 0;
        document.getElementById('stat-teklif').textContent = stats.aylikTeklif || 0;
        document.getElementById('stat-bekleyen').textContent = stats.bekleyenTeklif || 0;
        document.getElementById('stat-tutar').textContent = formatParaTR(stats.aylikCiro || 0);

        // Son teklifleri yükle
        const tekliflerResponse = await authenticatedFetch(`${API_BASE}/dashboard/son-teklifler`);
        const sonTeklifler = await tekliflerResponse.json();
        renderSonTeklifler(sonTeklifler);

        // Durum grafiğini çiz
        drawDurumChart();

        console.log('✅ Dashboard istatistikleri yüklendi');
    } catch (error) {
        console.error('❌ Dashboard istatistikleri yükleme hatası:', error);
    }
}

// ========================================
// SAYFA NAVİGASYONU
// ========================================

function navigateToPage(page) {
    // Tüm sayfaları gizle
    document.querySelectorAll('.page-content').forEach(p => p.classList.remove('active'));

    // Tüm nav itemları deaktif et
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

    // Seçili sayfayı göster
    document.getElementById(`page-${page}`).classList.add('active');

    // Seçili nav item'ı aktif et
    document.querySelector(`.nav-item[data-page="${page}"]`).classList.add('active');

    // Sayfa yüklendiğinde özel işlemler
    if (page === 'dashboard') {
        loadDashboardStats();
    } else if (page === 'musteriler') {
        renderMusteriTable();
    } else if (page === 'teklifler') {
        renderTeklifTable();
    } else if (page === 'is-emirleri') {
        loadIsEmirleri();
    } else if (page === 'sertifikalar') {
        loadSertifikalar();
    } else if (page === 'ayarlar') {
        renderFirmaBilgileri();
        loadEmailAyarlar();
        loadPersoneller();
        loadSertifikaSablonlari();
    }

    console.log(`📄 Sayfa değiştirildi: ${page}`);
}

// ========================================
// MÜŞTERİ FONKSİYONLARI
// ========================================

function renderMusteriTable() {
    const tbody = document.querySelector('#musteri-table tbody');
    const container = document.querySelector('#musteri-table').parentElement;

    // Arama filtresini uygula
    let filteredMusteriler = musteriler;
    if (musteriSearchTerm) {
        filteredMusteriler = musteriler.filter(musteri => {
            return musteri.unvan.toLowerCase().includes(musteriSearchTerm) ||
                (musteri.vergiNo && musteri.vergiNo.toLowerCase().includes(musteriSearchTerm)) ||
                (musteri.telefon && musteri.telefon.toLowerCase().includes(musteriSearchTerm));
        });
    }

    if (filteredMusteriler.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Henüz müşteri kaydı bulunmamaktadır</td></tr>';
        // Pagination'ı temizle
        const existingPagination = container.querySelector('.pagination-container');
        if (existingPagination) existingPagination.remove();
        return;
    }

    // Pagination hesapla
    const startIndex = (currentPageMusteri - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const paginatedMusteriler = filteredMusteriler.slice(startIndex, endIndex);

    tbody.innerHTML = paginatedMusteriler.map(musteri => `
        <tr>
            <td><strong>${musteri.unvan}</strong></td>
            <td>${musteri.vergiNo || '-'}</td>
            <td>${musteri.telefon || '-'}</td>
            <td>${musteri.email || '-'}</td>
            <td>
                <button class="btn btn-primary btn-small" onclick="musteriDuzenle(${musteri.id})" title="Düzenle">✏️</button>
                <button class="btn btn-danger btn-small" onclick="musteriSil(${musteri.id})" title="Sil">🗑️</button>
                <button class="btn btn-secondary btn-small" onclick="musteriIcinTeklifOlustur(${musteri.id})" title="Teklif Oluştur">📄</button>
            </td>
        </tr>
    `).join('');

    // Pagination kontrollerini ekle/güncelle
    let paginationDiv = container.querySelector('.pagination-container');
    if (!paginationDiv) {
        paginationDiv = document.createElement('div');
        paginationDiv.className = 'pagination-container';
        container.appendChild(paginationDiv);
    }
    paginationDiv.innerHTML = generatePaginationHTML(currentPageMusteri, filteredMusteriler.length, 'Musteri');
}

function changePageMusteri(page) {
    currentPageMusteri = page;
    renderMusteriTable();
    // Sayfayı en üste kaydır
    document.querySelector('#musteri-table').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function musteriAra() {
    musteriSearchTerm = document.getElementById('musteri-arama').value.toLowerCase();
    currentPageMusteri = 1; // Arama yapınca ilk sayfaya dön
    renderMusteriTable();
}

function yeniMusteriModal() {
    editingMusteri = null;
    const modalHTML = `
        <div class="modal-overlay" onclick="closeModal(event)">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>Yeni Müşteri Ekle</h3>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="musteri-form" onsubmit="musteriKaydet(event)">
                        <div class="form-group">
                            <label class="form-label required">Ünvan</label>
                            <input type="text" class="form-input" id="musteri-unvan" required>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Vergi No</label>
                                <input type="text" class="form-input" id="musteri-vergiNo">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Telefon</label>
                                <input type="text" class="form-input" id="musteri-telefon">
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Email</label>
                            <input type="email" class="form-input" id="musteri-email">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Adres</label>
                            <textarea class="form-textarea" id="musteri-adres"></textarea>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Yetkili Kişi</label>
                            <input type="text" class="form-input" id="musteri-yetkiliKisi">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Notlar</label>
                            <textarea class="form-textarea" id="musteri-notlar"></textarea>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeModal()">İptal</button>
                    <button class="btn btn-primary" onclick="document.getElementById('musteri-form').requestSubmit()">Kaydet</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('modal-container').innerHTML = modalHTML;
}

function musteriDuzenle(id) {
    const musteri = musteriler.find(m => m.id === id);
    if (!musteri) return;

    editingMusteri = musteri;

    const modalHTML = `
        <div class="modal-overlay" onclick="closeModal(event)">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>Müşteri Düzenle</h3>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="musteri-form" onsubmit="musteriKaydet(event)">
                        <div class="form-group">
                            <label class="form-label required">Ünvan</label>
                            <input type="text" class="form-input" id="musteri-unvan" value="${musteri.unvan}" required>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Vergi No</label>
                                <input type="text" class="form-input" id="musteri-vergiNo" value="${musteri.vergiNo || ''}">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Telefon</label>
                                <input type="text" class="form-input" id="musteri-telefon" value="${musteri.telefon || ''}">
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Email</label>
                            <input type="email" class="form-input" id="musteri-email" value="${musteri.email || ''}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Adres</label>
                            <textarea class="form-textarea" id="musteri-adres">${musteri.adres || ''}</textarea>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Yetkili Kişi</label>
                            <input type="text" class="form-input" id="musteri-yetkiliKisi" value="${musteri.yetkiliKisi || ''}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Notlar</label>
                            <textarea class="form-textarea" id="musteri-notlar">${musteri.notlar || ''}</textarea>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeModal()">İptal</button>
                    <button class="btn btn-primary" onclick="document.getElementById('musteri-form').requestSubmit()">Güncelle</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('modal-container').innerHTML = modalHTML;
}

async function musteriKaydet(event) {
    event.preventDefault();

    const musteriData = {
        unvan: document.getElementById('musteri-unvan').value,
        vergiNo: document.getElementById('musteri-vergiNo').value,
        telefon: document.getElementById('musteri-telefon').value,
        email: document.getElementById('musteri-email').value,
        adres: document.getElementById('musteri-adres').value,
        yetkiliKisi: document.getElementById('musteri-yetkiliKisi').value,
        notlar: document.getElementById('musteri-notlar').value
    };

    showLoading();

    try {
        let response;
        if (editingMusteri) {
            // Güncelleme
            response = await authenticatedFetch(`${API_BASE}/musteriler/${editingMusteri.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(musteriData)
            });
        } else {
            // Yeni ekleme
            response = await authenticatedFetch(`${API_BASE}/musteriler`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(musteriData)
            });
        }

        if (response.ok) {
            showToast(editingMusteri ? 'Müşteri başarıyla güncellendi' : 'Müşteri başarıyla eklendi', 'success');
        } else {
            const result = await response.json();
            showToast(result.error || 'Kayıt başarısız', 'error');
        }
        closeModal();
        await loadMusteriler();
    } catch (error) {
        console.error('❌ Müşteri kaydetme hatası:', error);
        // Hata olsa bile listeyi yenile ve modal'ı kapat
        closeModal();
        await loadMusteriler();
    } finally {
        hideLoading();
    }
}

async function musteriSil(id) {
    const musteri = musteriler.find(m => m.id === id);
    if (!musteri) return;

    if (!confirm(`"${musteri.unvan}" adlı müşteriyi silmek istediğinize emin misiniz?`)) {
        return;
    }

    showLoading();

    try {
        const response = await authenticatedFetch(`${API_BASE}/musteriler/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('Müşteri başarıyla silindi', 'success');
        } else {
            const result = await response.json();
            showToast(result.error || 'Müşteri silinemedi', 'error');
        }
        await loadMusteriler();
    } catch (error) {
        console.error('❌ Müşteri silme hatası:', error);
        await loadMusteriler();
    } finally {
        hideLoading();
    }
}

// ========================================
// EXCEL İÇE AKTARMA
// ========================================

function excelSablonIndir() {
    sablonIndir();
}

async function sablonIndir() {
    try {
        const response = await authenticatedFetch(`${API_BASE}/musteriler/sablon`);
        if (!response.ok) throw new Error('Şablon indirilemedi');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'musteri_sablonu.xlsx';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();

        showToast('Şablon dosyası indirildi', 'success');
    } catch (error) {
        console.error('Şablon indirme hatası:', error);
        showToast('Şablon indirilemedi', 'error');
    }
}

function excelIceAktar() {
    document.getElementById('excel-file-input').click();
}

async function excelDosyaYukle(event) {
    const file = event.target.files[0];
    if (!file) return;

    showLoading();

    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${API_BASE}/musteriler/import`, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + authToken
            },
            body: formData
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showToast(`${result.eklenen} müşteri eklendi${result.hatali > 0 ? `, ${result.hatali} kayıt hatalı` : ''}`, 'success');
            await loadMusteriler();
        } else {
            showToast(result.error || 'Excel içe aktarılamadı', 'error');
        }
    } catch (error) {
        console.error('❌ Excel içe aktarma hatası:', error);
        showToast('Excel içe aktarılırken hata oluştu', 'error');
    } finally {
        hideLoading();
        event.target.value = ''; // Input'u temizle
    }
}

// ========================================
// TEKLİF FONKSİYONLARI
// ========================================

function renderTeklifTable() {
    const tbody = document.querySelector('#teklif-table tbody');
    const container = document.querySelector('#teklif-table').parentElement;

    let filteredTeklifler = teklifler;

    // Filtre uygula
    if (currentFilter !== 'all') {
        filteredTeklifler = teklifler.filter(t => t.durum === currentFilter);
    }

    if (filteredTeklifler.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Teklif bulunamadı</td></tr>';
        // Pagination'ı temizle
        const existingPagination = container.querySelector('.pagination-container');
        if (existingPagination) existingPagination.remove();
        return;
    }

    // Pagination hesapla
    const startIndex = (currentPageTeklif - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const paginatedTeklifler = filteredTeklifler.slice(startIndex, endIndex);

    tbody.innerHTML = paginatedTeklifler.map(teklif => {
        // API'den customer ilişkisi ile geliyor, yoksa musteriler'den bul
        const musteriAdi = teklif.customer?.unvan ||
                          (musteriler.find(m => m.id === teklif.customerId)?.unvan) ||
                          'Bilinmeyen Müşteri';

        // Durum değerlerini Türkçe'ye çevir
        const durumMap = {
            'TASLAK': 'Taslak',
            'GONDERILDI': 'Gönderildi',
            'ONAYLANDI': 'Onaylandı',
            'REDDEDILDI': 'Reddedildi',
            'IPTAL': 'İptal',
            'Bekleyen': 'Bekleyen'
        };
        const durumText = durumMap[teklif.durum] || teklif.durum;

        // Badge renkleri
        const badgeClass = {
            'TASLAK': 'warning',
            'GONDERILDI': 'info',
            'ONAYLANDI': 'success',
            'REDDEDILDI': 'danger',
            'IPTAL': 'secondary',
            'Bekleyen': 'warning'
        }[teklif.durum] || 'primary';

        return `
            <tr>
                <td><strong>${teklif.teklifNo}</strong></td>
                <td>${formatTarihTR(teklif.tarih || teklif.createdAt)}</td>
                <td>${musteriAdi}</td>
                <td><strong>${formatParaTR(parseFloat(teklif.genelToplam) || 0)}</strong></td>
                <td>
                    <span class="badge badge-${badgeClass}"
                          onclick="teklifDurumDegistirModal(${teklif.id})"
                          style="cursor: pointer;"
                          title="Durumu değiştirmek için tıklayın">
                        ${durumText}
                    </span>
                </td>
                <td>
                    <button class="btn btn-primary btn-small" onclick="teklifGoruntule(${teklif.id})" title="Görüntüle">👁️</button>
                    <button class="btn btn-secondary btn-small" onclick="teklifDuzenle(${teklif.id})" title="Düzenle">✏️</button>
                    <button class="btn btn-success btn-small" onclick="teklifPDFExcelFormat(${teklif.id})" title="PDF (Excel Format)">📄</button>
                    <button class="btn btn-info btn-small" onclick="teklifEmailGonder(${teklif.id})" title="E-posta Gönder">📧</button>
                    <button class="btn btn-danger btn-small" onclick="teklifSil(${teklif.id})" title="Sil">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');

    // Pagination kontrollerini ekle/güncelle
    let paginationDiv = container.querySelector('.pagination-container');
    if (!paginationDiv) {
        paginationDiv = document.createElement('div');
        paginationDiv.className = 'pagination-container';
        container.appendChild(paginationDiv);
    }
    paginationDiv.innerHTML = generatePaginationHTML(currentPageTeklif, filteredTeklifler.length, 'Teklif');
}

function changePageTeklif(page) {
    currentPageTeklif = page;
    renderTeklifTable();
    // Sayfayı en üste kaydır
    document.querySelector('#teklif-table').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function teklifFiltrele(filter) {
    currentFilter = filter;
    currentPageTeklif = 1; // Filtre değişince ilk sayfaya dön

    // Filtre butonlarını güncelle
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-filter') === filter) {
            btn.classList.add('active');
        }
    });

    renderTeklifTable();
}

function yeniTeklifModal() {
    if (musteriler.length === 0) {
        showToast('Önce en az bir müşteri eklemelisiniz', 'warning');
        return;
    }

    // Excel formatına uygun yeni teklif formunu aç
    window.location.href = '/forms/teklif-form.html';
}

function teklifDuzenle(id) {
    const teklif = teklifler.find(t => t.id === id);
    if (!teklif) return;

    editingTeklif = teklif;
    openTeklifModal(teklif);
}

function musteriIcinTeklifOlustur(musteriId) {
    editingTeklif = null;
    openTeklifModal(null, musteriId);
}

function openTeklifModal(teklif = null, preSelectedMusteriId = null) {
    const today = new Date().toISOString().split('T')[0];

    const modalHTML = `
        <div class="modal-overlay" onclick="closeModal(event)">
            <div class="modal" onclick="event.stopPropagation()" style="max-width: 1000px;">
                <div class="modal-header">
                    <h3>${teklif ? 'Teklif Düzenle' : 'Yeni Teklif Oluştur'}</h3>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="teklif-form" onsubmit="teklifKaydet(event)">
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label required">Müşteri</label>
                                <select class="form-select" id="teklif-musteri" required>
                                    <option value="">Müşteri Seçin</option>
                                    ${musteriler.map(m => `
                                        <option value="${m.id}" ${(teklif && teklif.musteriId === m.id) || (!teklif && preSelectedMusteriId === m.id) ? 'selected' : ''}>
                                            ${m.unvan}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label required">Teklif Tarihi</label>
                                <input type="date" class="form-input" id="teklif-tarih" value="${teklif ? teklif.teklifTarihi : today}" required>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Geçerlilik (Gün)</label>
                                <input type="number" class="form-input" id="teklif-gecerlilik" value="${teklif ? teklif.gecerlilik : 14}" min="1">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Durum</label>
                                <select class="form-select" id="teklif-durum">
                                    <option value="Bekleyen" ${(!teklif || teklif.durum === 'Bekleyen') ? 'selected' : ''}>Bekleyen</option>
                                    <option value="Onaylandı" ${teklif && teklif.durum === 'Onaylandı' ? 'selected' : ''}>Onaylandı</option>
                                    <option value="Reddedildi" ${teklif && teklif.durum === 'Reddedildi' ? 'selected' : ''}>Reddedildi</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Konu</label>
                            <textarea class="form-textarea" id="teklif-konu" rows="2">${teklif ? teklif.konu : 'Periyodik Kontrol ve İş Hijyeni Ölçüm Fiyat Teklifi'}</textarea>
                        </div>

                        <div class="form-group">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <label class="form-label required">Hizmetler</label>
                                <button type="button" class="btn btn-secondary btn-small" onclick="openHizmetEkleModal()">➕ Yeni Hizmet Ekle</button>
                            </div>
                            <div id="hizmet-secimi">
                                ${renderHizmetSecimi(teklif ? teklif.hizmetler : [])}
                            </div>
                        </div>

                        <div class="fiyat-ozet">
                            <div class="fiyat-satir">
                                <span>Ara Toplam:</span>
                                <strong id="ara-toplam">₺0,00</strong>
                            </div>
                            <div class="fiyat-satir">
                                <span>KDV (%20):</span>
                                <strong id="kdv-tutari">₺0,00</strong>
                            </div>
                            <div class="fiyat-satir toplam">
                                <span>GENEL TOPLAM:</span>
                                <strong id="genel-toplam">₺0,00</strong>
                            </div>
                        </div>

                        <div class="form-row" style="margin-top: 15px;">
                            <div class="form-group">
                                <div class="form-check" style="display: flex; align-items: center; gap: 8px;">
                                    <input type="checkbox" id="onayTelefon" ${teklif && teklif.onayTelefon ? 'checked' : ''}>
                                    <label for="onayTelefon">Onay telefon ile alındı</label>
                                </div>
                            </div>
                            <div class="form-group">
                                <div class="form-check" style="display: flex; align-items: center; gap: 8px;">
                                    <input type="checkbox" id="sahadaOnay" ${teklif && teklif.sahadaOnay ? 'checked' : ''}>
                                    <label for="sahadaOnay">Sahada onaylandı</label>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeModal()">İptal</button>
                    <button class="btn btn-success" onclick="teklifOnizle()">👁️ Önizle</button>
                    <button class="btn btn-primary" onclick="document.getElementById('teklif-form').requestSubmit()">Kaydet</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('modal-container').innerHTML = modalHTML;

    // Event listener'ları ekle
    document.querySelectorAll('.hizmet-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', hesaplaFiyat);
    });

    document.querySelectorAll('.hizmet-miktar').forEach(input => {
        input.addEventListener('input', hesaplaFiyat);
    });

    document.querySelectorAll('.hizmet-fiyat').forEach(input => {
        input.addEventListener('input', hesaplaFiyat);
    });

    // İlk hesaplamayı yap
    hesaplaFiyat();
}

function renderHizmetSecimi(secilenHizmetler = []) {
    if (!hizmetler || hizmetler.length === 0) {
        return '<p class="text-muted">Hizmet bulunamadı</p>';
    }
    return hizmetler.map(kategori => `
        <div class="hizmet-kategori">
            <div class="hizmet-kategori-header">${kategori.kategori}</div>
            <div class="hizmet-items">
                ${kategori.items.map(hizmet => {
        const secilenHizmet = secilenHizmetler.find(h => h.id === hizmet.id);
        const checked = secilenHizmet ? 'checked' : '';
        const miktar = secilenHizmet ? secilenHizmet.miktar : 1;

        return `
                        <div class="hizmet-item">
                            <input type="checkbox" class="hizmet-checkbox" data-hizmet-id="${hizmet.id}" ${checked}>
                            <div class="hizmet-bilgi">
                                <h4>${hizmet.ad}</h4>
                                <p>${hizmet.metod}</p>
                            </div>
                            <span>${hizmet.birim}</span>
                            <input type="number" class="form-input hizmet-miktar" data-hizmet-id="${hizmet.id}" value="${miktar}" min="1" ${!checked ? 'disabled' : ''}>
                            <input type="number" class="form-input hizmet-fiyat" data-hizmet-id="${hizmet.id}" value="${secilenHizmet ? secilenHizmet.fiyat : hizmet.fiyat}" min="0" step="0.01" ${!checked ? 'disabled' : ''} placeholder="Fiyat">
                        </div>
                    `;
    }).join('')}
            </div>
        </div>
    `).join('');
}

function hesaplaFiyat() {
    let araToplam = 0;

    document.querySelectorAll('.hizmet-checkbox:checked').forEach(checkbox => {
        const hizmetId = parseInt(checkbox.getAttribute('data-hizmet-id'));
        const miktarInput = document.querySelector(`.hizmet-miktar[data-hizmet-id="${hizmetId}"]`);
        const fiyatInput = document.querySelector(`.hizmet-fiyat[data-hizmet-id="${hizmetId}"]`);
        const miktar = parseInt(miktarInput.value) || 1;
        const fiyat = parseFloat(fiyatInput.value) || 0;

        araToplam += fiyat * miktar;

        // Miktar ve fiyat inputlarını aktif et
        miktarInput.disabled = false;
        fiyatInput.disabled = false;
    });

    // Devre dışı checkbox'ların input'larını devre dışı bırak
    document.querySelectorAll('.hizmet-checkbox:not(:checked)').forEach(checkbox => {
        const hizmetId = parseInt(checkbox.getAttribute('data-hizmet-id'));
        const miktarInput = document.querySelector(`.hizmet-miktar[data-hizmet-id="${hizmetId}"]`);
        const fiyatInput = document.querySelector(`.hizmet-fiyat[data-hizmet-id="${hizmetId}"]`);
        miktarInput.disabled = true;
        fiyatInput.disabled = true;
    });

    const kdv = araToplam * 0.20;
    const genelToplam = araToplam + kdv;

    document.getElementById('ara-toplam').textContent = formatParaTR(araToplam);
    document.getElementById('kdv-tutari').textContent = formatParaTR(kdv);
    document.getElementById('genel-toplam').textContent = formatParaTR(genelToplam);
}

async function teklifKaydet(event) {
    event.preventDefault();

    // Seçilen hizmetleri topla
    const secilenHizmetler = [];
    document.querySelectorAll('.hizmet-checkbox:checked').forEach(checkbox => {
        const hizmetId = parseInt(checkbox.getAttribute('data-hizmet-id'));
        const miktar = parseInt(document.querySelector(`.hizmet-miktar[data-hizmet-id="${hizmetId}"]`).value) || 1;
        const fiyatInput = document.querySelector(`.hizmet-fiyat[data-hizmet-id="${hizmetId}"]`);
        const fiyat = parseFloat(fiyatInput.value) || 0;

        // Hizmet bilgisini bul
        hizmetler.forEach(kategori => {
            const hizmet = kategori.items.find(h => h.id === hizmetId);
            if (hizmet) {
                secilenHizmetler.push({
                    id: hizmet.id,
                    ad: hizmet.ad,
                    metod: hizmet.metod,
                    birim: hizmet.birim,
                    fiyat: fiyat,
                    miktar: miktar,
                    toplam: fiyat * miktar,
                    kategori: kategori.kategori
                });
            }
        });
    });

    if (secilenHizmetler.length === 0) {
        showToast('En az bir hizmet seçmelisiniz', 'warning');
        return;
    }

    // Fiyatları hesapla
    const araToplam = secilenHizmetler.reduce((sum, h) => sum + h.toplam, 0);
    const kdvOrani = 20;
    const kdv = araToplam * (kdvOrani / 100);
    const genelToplam = araToplam + kdv;

    // API formatına dönüştür
    const detaylar = secilenHizmetler.map(h => ({
        hizmetId: h.id,
        miktar: h.miktar,
        birimFiyat: h.fiyat,
        aciklama: h.ad
    }));

    const teklifData = {
        customerId: parseInt(document.getElementById('teklif-musteri').value),
        gecerlilikGunu: parseInt(document.getElementById('teklif-gecerlilik').value) || 30,
        kdvOrani: kdvOrani,
        notlar: document.getElementById('teklif-konu')?.value || '',
        detaylar: detaylar,
        onayTelefon: document.getElementById('onayTelefon')?.checked || false,
        sahadaOnay: document.getElementById('sahadaOnay')?.checked || false
    };

    showLoading();

    try {
        let response;
        if (editingTeklif) {
            response = await authenticatedFetch(`${API_BASE}/teklifler/${editingTeklif.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(teklifData)
            });
        } else {
            response = await authenticatedFetch(`${API_BASE}/teklifler`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(teklifData)
            });
        }

        const result = await response.json();

        if (response.ok) {
            showToast(editingTeklif ? 'Teklif başarıyla güncellendi' : 'Teklif başarıyla oluşturuldu', 'success');
            closeModal();
            await loadTeklifler();
            await loadDashboardStats();
        } else {
            showToast(result.error || 'İşlem başarısız', 'error');
        }
    } catch (error) {
        console.error('❌ Teklif kaydetme hatası:', error);
        showToast('Teklif kaydedilirken hata oluştu', 'error');
    } finally {
        hideLoading();
    }
}

async function teklifSil(id) {
    const teklif = teklifler.find(t => t.id === id);
    if (!teklif) return;

    if (!confirm(`${teklif.teklifNo} nolu teklifi silmek istediğinize emin misiniz?`)) {
        return;
    }

    showLoading();

    try {
        const response = await authenticatedFetch(`${API_BASE}/teklifler/${id}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            showToast('Teklif başarıyla silindi', 'success');
            await loadTeklifler();
            await loadDashboardStats();
        } else {
            showToast(result.error || 'Teklif silinemedi', 'error');
        }
    } catch (error) {
        console.error('❌ Teklif silme hatası:', error);
        showToast('Teklif silinirken hata oluştu', 'error');
    } finally {
        hideLoading();
    }
}

async function tekliftenIsEmriOlustur(teklifId) {
    const teklif = teklifler.find(t => t.id === teklifId);
    if (!teklif) return;

    if (!confirm(`${teklif.teklifNo} nolu tekliften iş emri oluşturulacak. Onaylıyor musunuz?`)) {
        return;
    }

    showLoading();

    try {
        const response = await authenticatedFetch(`${API_BASE}/is-emirleri/tekliften-olustur/${teklifId}`, {
            method: 'POST'
        });

        const result = await response.json();

        if (response.ok) {
            showToast(`İş emri oluşturuldu: ${result.isEmriNo}`, 'success');
            // İş emirleri sayfasına yönlendir
            navigateToPage('is-emirleri');
        } else {
            showToast(result.error || 'İş emri oluşturulamadı', 'error');
        }
    } catch (error) {
        console.error('❌ İş emri oluşturma hatası:', error);
        showToast('İş emri oluşturulurken hata oluştu', 'error');
    } finally {
        hideLoading();
    }
}

function teklifGoruntule(id) {
    const teklif = teklifler.find(t => t.id === id);
    if (!teklif) return;

    // Tab'lı görüntüleme modalı
    const musteri = musteriler.find(m => m.id === teklif.musteriId);
    if (!musteri) return;

    const modalHTML = `
        <div class="modal-overlay" onclick="closeModal(event)">
            <div class="modal" onclick="event.stopPropagation()" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3>Teklif Detayları - ${teklif.teklifNo}</h3>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <!-- Tab Menüsü -->
                    <div class="tab-menu">
                        <button class="tab-button active" onclick="changeTab('detay')">📄 Teklif Detayı</button>
                        <button class="tab-button" onclick="changeTab('gecmis')">📅 Durum Geçmişi</button>
                        <button class="tab-button" onclick="changeTab('notlar')">📝 Notlar</button>
                    </div>

                    <!-- Tab İçerikleri -->
                    <div id="tab-detay" class="tab-content active">
                        ${renderTeklifDetay(teklif, musteri)}
                    </div>

                    <div id="tab-gecmis" class="tab-content" style="display: none;">
                        ${renderDurumGecmisi(teklif)}
                    </div>

                    <div id="tab-notlar" class="tab-content" style="display: none;">
                        ${renderTeklifNotlar(teklif)}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeModal()">Kapat</button>
                    ${teklif.isEmriId ? `
                        <button class="btn btn-info" onclick="closeModal(); navigateToPage('is-emirleri'); setTimeout(() => viewIsEmri(${teklif.isEmriId}), 300);">📋 İş Emrini Görüntüle</button>
                    ` : ''}
                    <button class="btn btn-primary" onclick="teklifOnizleModal(${teklif.id})">Yazdırılabilir Görünüm</button>
                    <button class="btn btn-success" onclick="teklifPDFOlustur(${teklif.id})">PDF İndir</button>
                    <button class="btn btn-success" onclick="teklifExcelOlustur(${teklif.id})">Excel İndir</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('modal-container').innerHTML = modalHTML;
}

function changeTab(tabName) {
    // Tüm tab butonlarını ve içeriklerini gizle
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = 'none';
    });

    // Seçilen tab'ı aktif et
    event.target.classList.add('active');
    document.getElementById(`tab-${tabName}`).style.display = 'block';
}

function renderTeklifDetay(teklif, musteri) {
    // Hizmetleri kategoriye göre grupla
    const hizmetlerKategoriye = {};
    teklif.hizmetler.forEach(hizmet => {
        if (!hizmetlerKategoriye[hizmet.kategori]) {
            hizmetlerKategoriye[hizmet.kategori] = [];
        }
        hizmetlerKategoriye[hizmet.kategori].push(hizmet);
    });

    return `
        <div class="teklif-detay">
            <div class="info-grid">
                <div>
                    <p><strong>Teklif No:</strong> ${teklif.teklifNo}</p>
                    <p><strong>Tarih:</strong> ${formatTarihTR(teklif.teklifTarihi)}</p>
                    <p><strong>Geçerlilik:</strong> ${teklif.gecerlilik} gün</p>
                </div>
                <div>
                    <p><strong>Müşteri:</strong> ${musteri.unvan}</p>
                    <p><strong>Durum:</strong> <span class="badge badge-${teklif.durum.toLowerCase().replace('ı', 'i')}">${teklif.durum}</span></p>
                    <p><strong>Tutar:</strong> ${formatParaTR(teklif.genelToplam)}</p>
                </div>
            </div>

            <hr>

            <h4>Hizmetler</h4>
            ${Object.keys(hizmetlerKategoriye).map(kategori => `
                <div class="kategori-baslik">${kategori}</div>
                <ul>
                    ${hizmetlerKategoriye[kategori].map(hizmet => `
                        <li>${hizmet.ad} - ${hizmet.miktar} ${hizmet.birim} x ${formatParaTR(hizmet.fiyat)} = ${formatParaTR(hizmet.toplam)}</li>
                    `).join('')}
                </ul>
            `).join('')}

            <div class="fiyat-ozet" style="margin-top: 20px;">
                <div class="fiyat-satir">
                    <span>Ara Toplam:</span>
                    <strong>${formatParaTR(teklif.araToplam)}</strong>
                </div>
                <div class="fiyat-satir">
                    <span>KDV (%20):</span>
                    <strong>${formatParaTR(teklif.kdv)}</strong>
                </div>
                <div class="fiyat-satir toplam">
                    <span>Genel Toplam:</span>
                    <strong>${formatParaTR(teklif.genelToplam)}</strong>
                </div>
            </div>
        </div>
    `;
}

function renderDurumGecmisi(teklif) {
    const gecmis = teklif.durumGecmisi || [];

    let html = `
        <div class="durum-gecmis">
            <h4>Durum Değişiklik Geçmişi</h4>
    `;

    if (gecmis.length === 0) {
        html += `<p class="text-muted">Henüz durum değişikliği yapılmamış.</p>`;
    } else {
        html += `
            <div class="timeline">
                ${gecmis.map((item, index) => `
                    <div class="timeline-item">
                        <div class="timeline-badge ${index === 0 ? 'primary' : ''}">
                            ${gecmis.length - index}
                        </div>
                        <div class="timeline-content">
                            <div class="timeline-header">
                                <span class="badge badge-${item.eskiDurum.toLowerCase().replace('ı', 'i')}">${item.eskiDurum}</span>
                                <span style="margin: 0 10px;">→</span>
                                <span class="badge badge-${item.yeniDurum.toLowerCase().replace('ı', 'i')}">${item.yeniDurum}</span>
                            </div>
                            <div class="timeline-body">
                                <p><strong>Tarih:</strong> ${new Date(item.tarih).toLocaleString('tr-TR')}</p>
                                ${item.not ? `<p><strong>Not:</strong> ${item.not}</p>` : ''}
                            </div>
                        </div>
                    </div>
                `).reverse().join('')}
            </div>
        `;
    }

    // İlk oluşturma bilgisi
    html += `
        <hr>
        <p class="text-muted">
            <strong>Teklif Oluşturma:</strong> ${new Date(teklif.olusturmaTarihi).toLocaleString('tr-TR')}
        </p>
    `;

    html += `</div>`;
    return html;
}

function renderTeklifNotlar(teklif) {
    const notlar = teklif.notlar || [];

    return `
        <div class="teklif-notlar">
            <div class="not-ekle-form">
                <h4>Not Ekle</h4>
                <form onsubmit="teklifNotEkle(event, ${teklif.id})">
                    <textarea class="form-textarea" id="yeni-not" rows="3" placeholder="Notunuzu buraya yazın..." required></textarea>
                    <button type="submit" class="btn btn-primary btn-small" style="margin-top: 10px;">Not Ekle</button>
                </form>
            </div>

            <hr>

            <h4>Mevcut Notlar</h4>
            <div class="notlar-liste">
                ${notlar.length === 0 ?
            '<p class="text-muted">Henüz not eklenmemiş.</p>' :
            notlar.map(not => `
                        <div class="not-item">
                            <div class="not-header">
                                <strong>${new Date(not.tarih).toLocaleString('tr-TR')}</strong>
                            </div>
                            <div class="not-body">
                                ${not.mesaj}
                            </div>
                        </div>
                    `).reverse().join('')
        }
            </div>
        </div>
    `;
}

function teklifOnizle() {
    // Mevcut form verilerinden geçici teklif oluştur
    const secilenHizmetler = [];
    document.querySelectorAll('.hizmet-checkbox:checked').forEach(checkbox => {
        const hizmetId = parseInt(checkbox.getAttribute('data-hizmet-id'));
        const miktar = parseInt(document.querySelector(`.hizmet-miktar[data-hizmet-id="${hizmetId}"]`).value) || 1;

        hizmetler.forEach(kategori => {
            const hizmet = kategori.items.find(h => h.id === hizmetId);
            if (hizmet) {
                secilenHizmetler.push({
                    id: hizmet.id,
                    ad: hizmet.ad,
                    metod: hizmet.metod,
                    birim: hizmet.birim,
                    fiyat: hizmet.fiyat,
                    miktar: miktar,
                    toplam: hizmet.fiyat * miktar,
                    kategori: kategori.kategori
                });
            }
        });
    });

    const araToplam = secilenHizmetler.reduce((sum, h) => sum + h.toplam, 0);
    const kdv = araToplam * 0.20;

    const geciciTeklif = {
        teklifNo: 'ÖNİZLEME',
        musteriId: parseInt(document.getElementById('teklif-musteri').value),
        teklifTarihi: document.getElementById('teklif-tarih').value,
        gecerlilik: parseInt(document.getElementById('teklif-gecerlilik').value),
        konu: document.getElementById('teklif-konu').value,
        hizmetler: secilenHizmetler,
        araToplam,
        kdv,
        genelToplam: araToplam + kdv
    };

    teklifOnizleModal(geciciTeklif);
}

function teklifOnizleModal(teklif) {
    const musteri = musteriler.find(m => m.id === teklif.musteriId);
    if (!musteri) {
        showToast('Müşteri bilgisi bulunamadı', 'error');
        return;
    }

    // Hizmetleri kategorilere göre grupla
    const hizmetlerKategoriye = {};
    teklif.hizmetler.forEach(hizmet => {
        if (!hizmetlerKategoriye[hizmet.kategori]) {
            hizmetlerKategoriye[hizmet.kategori] = [];
        }
        hizmetlerKategoriye[hizmet.kategori].push(hizmet);
    });

    const modalHTML = `
        <div class="modal-overlay" onclick="closeModal(event)">
            <div class="modal" onclick="event.stopPropagation()" style="max-width: 900px;">
                <div class="modal-header">
                    <h3>Teklif Önizleme</h3>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="teklif-onizleme" id="teklif-onizleme-content">
                        <!-- Header -->
                        <div class="teklif-header">
                            <div class="firma-bilgi">
                                <h1>${firmaBilgi.ad}</h1>
                                <p>${firmaBilgi.adres}</p>
                                <p>Tel: ${firmaBilgi.telefon}</p>
                                <p>Email: ${firmaBilgi.email}</p>
                            </div>
                            <div class="teklif-bilgi">
                                <h2>FİYAT TEKLİFİ</h2>
                                <p><strong>Teklif No:</strong> ${teklif.teklifNo}</p>
                                <p><strong>Tarih:</strong> ${formatTarihTR(teklif.teklifTarihi)}</p>
                                <p><strong>Geçerlilik:</strong> ${teklif.gecerlilik} Gün</p>
                            </div>
                        </div>

                        <!-- Müşteri Bilgileri -->
                        <div class="musteri-bilgi-section">
                            <h3>MÜŞTERİ BİLGİLERİ</h3>
                            <p><strong>Ünvan:</strong> ${musteri.unvan}</p>
                            ${musteri.adres ? `<p><strong>Adres:</strong> ${musteri.adres}</p>` : ''}
                            ${musteri.vergiNo ? `<p><strong>Vergi No:</strong> ${musteri.vergiNo}</p>` : ''}
                            ${musteri.telefon ? `<p><strong>Telefon:</strong> ${musteri.telefon}</p>` : ''}
                            ${musteri.yetkiliKisi ? `<p><strong>Yetkili:</strong> ${musteri.yetkiliKisi}</p>` : ''}
                        </div>

                        <!-- Konu -->
                        <p><strong>Konu:</strong> ${teklif.konu}</p>
                        <br>

                        <!-- Hizmetler Tablosu -->
                        <table class="teklif-table">
                            <thead>
                                <tr>
                                    <th style="width: 40%">HİZMET ADI</th>
                                    <th style="width: 30%">METOD/STANDART</th>
                                    <th style="width: 10%">BİRİM</th>
                                    <th style="width: 10%">MİKTAR</th>
                                    <th style="width: 10%">TOPLAM</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${Object.keys(hizmetlerKategoriye).map(kategori => `
                                    <tr class="kategori-row">
                                        <td colspan="5">${kategori}</td>
                                    </tr>
                                    ${hizmetlerKategoriye[kategori].map(hizmet => `
                                        <tr>
                                            <td>${hizmet.ad}</td>
                                            <td><small>${hizmet.metod}</small></td>
                                            <td>${hizmet.birim}</td>
                                            <td>${hizmet.miktar}</td>
                                            <td><strong>${formatParaTR(hizmet.toplam)}</strong></td>
                                        </tr>
                                    `).join('')}
                                `).join('')}
                            </tbody>
                        </table>

                        <!-- Fiyat Özeti -->
                        <div class="fiyat-ozet" style="margin-top: 20px;">
                            <div class="fiyat-satir">
                                <span>Ara Toplam:</span>
                                <strong>${formatParaTR(teklif.araToplam)}</strong>
                            </div>
                            <div class="fiyat-satir">
                                <span>KDV (%20):</span>
                                <strong>${formatParaTR(teklif.kdv)}</strong>
                            </div>
                            <div class="fiyat-satir toplam">
                                <span>GENEL TOPLAM:</span>
                                <strong>${formatParaTR(teklif.genelToplam)}</strong>
                            </div>
                        </div>

                        <!-- İmza Alanları -->
                        <div class="imza-alanlari">
                            <div class="imza-alani">
                                <div class="imza-cizgi"></div>
                                <p><strong>Firma Onayı</strong></p>
                                <p>${musteri.unvan}</p>
                            </div>
                            <div class="imza-alani">
                                <div class="imza-cizgi"></div>
                                <p><strong>${firmaBilgi.ad}</strong></p>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeModal()">Kapat</button>
                    <button class="btn btn-success" onclick="teklifPDFIndir()">📄 PDF İndir</button>
                    <button class="btn btn-primary" onclick="teklifEmailGonder(${teklif.id || 0})">📧 Email Gönder</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('modal-container').innerHTML = modalHTML;
}

async function teklifPDFOlustur(id) {
    showLoading();

    try {
        const response = await authenticatedFetch(`${API_BASE}/teklifler/${id}/pdf`);

        if (!response.ok) {
            throw new Error('PDF oluşturulamadı');
        }

        // Blob olarak indir
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');

        // Dosya adını al
        const contentDisposition = response.headers.get('content-disposition');
        let fileName = `Teklif_${id}.pdf`;

        if (contentDisposition) {
            const fileNameMatch = contentDisposition.match(/filename="(.+)"/);
            if (fileNameMatch && fileNameMatch[1]) {
                fileName = fileNameMatch[1];
            }
        }

        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();

        // Temizlik
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showToast('PDF başarıyla indirildi', 'success');
    } catch (error) {
        console.error('PDF oluşturma hatası:', error);
        showToast('PDF oluşturulamadı', 'error');
    } finally {
        hideLoading();
    }
}

function teklifPDFIndir() {
    // Artık bu fonksiyona ihtiyaç yok
    const teklifId = parseInt(document.getElementById('modal-container').querySelector('[data-teklif-id]')?.getAttribute('data-teklif-id') || '0');
    if (teklifId) {
        teklifPDFOlustur(teklifId);
    }
}

async function teklifExcelOlustur(id) {
    showLoading();

    try {
        const response = await authenticatedFetch(`${API_BASE}/teklifler/${id}/excel`);

        if (!response.ok) {
            throw new Error('Excel oluşturulamadı');
        }

        // Blob olarak indir
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');

        // Dosya adını response header'dan al
        const contentDisposition = response.headers.get('content-disposition');
        let fileName = `Teklif_${id}.xlsx`;

        if (contentDisposition) {
            const fileNameMatch = contentDisposition.match(/filename="(.+)"/);
            if (fileNameMatch && fileNameMatch[1]) {
                fileName = fileNameMatch[1];
            }
        }

        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();

        // Temizlik
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showToast('Excel dosyası başarıyla indirildi', 'success');
    } catch (error) {
        console.error('Excel oluşturma hatası:', error);
        showToast('Excel dosyası oluşturulamadı', 'error');
    } finally {
        hideLoading();
    }
}

function teklifEmailGonder(teklifId) {
    if (teklifId === 0) {
        showToast('Önce teklifi kaydetmelisiniz', 'warning');
        return;
    }

    const teklif = teklifler.find(t => t.id === teklifId);
    if (!teklif) return;

    const musteri = teklif.customer || musteriler.find(m => m.id === teklif.customerId);
    if (!musteri || !musteri.email || musteri.email === '-') {
        showToast('Müşterinin email adresi tanımlı değil', 'warning');
        return;
    }

    // Email gönderim modalı aç
    openEmailModal(teklifId, musteri.email);
}

// Email gönderim modalı
function openEmailModal(teklifId, email) {
    const modalHtml = `
        <div class="modal-overlay" id="email-modal-overlay">
            <div class="modal" style="max-width: 500px;">
                <div class="modal-header">
                    <h3>Teklifi E-posta ile Gönder</h3>
                    <button class="modal-close" onclick="closeEmailModal()">×</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Alıcı E-posta</label>
                        <input type="email" id="email-to" value="${email}" class="form-control" readonly>
                    </div>
                    <div class="form-group">
                        <label>Ek Mesaj (Opsiyonel)</label>
                        <textarea id="email-message" class="form-control" rows="4" placeholder="Müşteriye iletmek istediğiniz özel mesaj..."></textarea>
                    </div>
                    <p style="color: #666; font-size: 12px;">
                        <strong>Not:</strong> Teklif PDF olarak eklenecektir.
                    </p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeEmailModal()">İptal</button>
                    <button class="btn btn-primary" onclick="sendTeklifEmail(${teklifId})">
                        📧 Gönder
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeEmailModal() {
    const modal = document.getElementById('email-modal-overlay');
    if (modal) modal.remove();
}

async function sendTeklifEmail(teklifId) {
    const customMessage = document.getElementById('email-message')?.value || '';

    showLoading();
    closeEmailModal();

    try {
        const response = await authenticatedFetch(`/api/teklifler/${teklifId}/send-email`, {
            method: 'POST',
            body: JSON.stringify({ customMessage })
        });

        const result = await response.json();

        if (response.ok) {
            showToast('Teklif başarıyla gönderildi: ' + result.to, 'success');
            // Teklif listesini yenile
            await loadTeklifler();
        } else {
            showToast(result.error || 'Email gönderilemedi', 'error');
        }
    } catch (error) {
        console.error('Email gönderme hatası:', error);
        showToast('Email gönderilirken bir hata oluştu', 'error');
    } finally {
        hideLoading();
    }
}

// Excel formatına uygun PDF indir
async function teklifPDFExcelFormat(id) {
    showLoading();
    try {
        const response = await fetch(`${API_BASE}/teklifler/${id}/pdf`, {
            headers: { 'Authorization': 'Bearer ' + authToken }
        });

        if (!response.ok) throw new Error('PDF oluşturulamadı');

        // Dosya adını header'dan al
        const contentDisposition = response.headers.get('Content-Disposition');
        let fileName = `Teklif-${id}.pdf`;
        if (contentDisposition) {
            const match = contentDisposition.match(/filename="(.+)"/);
            if (match) fileName = match[1];
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();

        showToast('PDF indirildi', 'success');
    } catch (error) {
        console.error('PDF hatası:', error);
        showToast('PDF oluşturulamadı', 'error');
    } finally {
        hideLoading();
    }
}

// ========================================
// DASHBOARD FONKSİYONLARI
// ========================================

function renderSonTeklifler(sonTeklifler) {
    const tbody = document.querySelector('#son-teklifler-table tbody');

    if (!sonTeklifler || sonTeklifler.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Henüz teklif oluşturulmamış</td></tr>';
        return;
    }

    // Durum değerlerini Türkçe'ye çevir
    const durumMap = {
        'TASLAK': 'Taslak',
        'GONDERILDI': 'Gönderildi',
        'ONAYLANDI': 'Onaylandı',
        'REDDEDILDI': 'Reddedildi',
        'IPTAL': 'İptal'
    };

    // Badge renkleri
    const badgeClassMap = {
        'TASLAK': 'warning',
        'GONDERILDI': 'info',
        'ONAYLANDI': 'success',
        'REDDEDILDI': 'danger',
        'IPTAL': 'secondary'
    };

    tbody.innerHTML = sonTeklifler.map(teklif => {
        const musteriAdi = teklif.customer?.unvan || 'Bilinmeyen Müşteri';
        const durumText = durumMap[teklif.durum] || teklif.durum;
        const badgeClass = badgeClassMap[teklif.durum] || 'primary';

        return `
            <tr>
                <td><strong>${teklif.teklifNo}</strong></td>
                <td>${formatTarihTR(teklif.tarih || teklif.createdAt)}</td>
                <td>${musteriAdi}</td>
                <td><strong>${formatParaTR(parseFloat(teklif.genelToplam) || 0)}</strong></td>
                <td><span class="badge badge-${badgeClass}">${durumText}</span></td>
            </tr>
        `;
    }).join('');
}

// ========================================
// AYARLAR FONKSİYONLARI
// ========================================

function renderFirmaBilgileri() {
    const container = document.getElementById('firma-bilgileri');
    if (!container) return;

    container.innerHTML = `
        <p><strong>Firma Adı:</strong> ${firmaBilgi.ad}</p>
        <p><strong>Adres:</strong> ${firmaBilgi.adres}</p>
        <p><strong>Telefon:</strong> ${firmaBilgi.telefon}</p>
        <p><strong>Email:</strong> ${firmaBilgi.email}</p>
    `;
}

async function loadEmailAyarlar() {
    try {
        const container = document.getElementById('email-ayarlari');
        if (!container) return;

        let data = { host: '', port: 587, secure: false, user: '', configured: false };

        try {
            const response = await authenticatedFetch('/api/email-ayarlar');
            if (response.ok) {
                const result = await response.json();
                if (result) data = { ...data, ...result };
            }
        } catch (e) {
            console.log('E-posta ayarları henüz yapılandırılmamış');
        }

        container.innerHTML = `
            <form id="email-ayarlar-form">
                <div class="form-group">
                    <label class="form-label">SMTP Sunucu</label>
                    <input type="text" class="form-input" id="email-host" value="${data.host || ''}" placeholder="örn: smtp.gmail.com">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Port</label>
                        <input type="number" class="form-input" id="email-port" value="${data.port || 587}" placeholder="587">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Güvenli Bağlantı</label>
                        <select class="form-select" id="email-secure">
                            <option value="false" ${!data.secure ? 'selected' : ''}>Hayır (TLS)</option>
                            <option value="true" ${data.secure ? 'selected' : ''}>Evet (SSL)</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">E-posta Adresi</label>
                    <input type="email" class="form-input" id="email-user" value="${data.user || ''}" placeholder="your-email@gmail.com">
                </div>
                <div class="form-group">
                    <label class="form-label">Uygulama Şifresi</label>
                    <input type="password" class="form-input" id="email-pass" placeholder="••••••••••••••••">
                    <small style="color: #666; display: block; margin-top: 5px;">
                        Gmail için: Hesap ayarları > Güvenlik > 2 adımlı doğrulama > Uygulama şifreleri
                    </small>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button type="submit" class="btn btn-primary">Kaydet</button>
                    <button type="button" class="btn btn-secondary" onclick="testEmailGonder()">Test E-postası Gönder</button>
                </div>
            </form>
            ${data.configured ? '<p style="color: var(--success); margin-top: 10px;">✓ E-posta ayarları yapılandırıldı</p>' : '<p style="color: var(--warning); margin-top: 10px;">⚠ E-posta ayarları henüz yapılandırılmadı</p>'}
        `;

        document.getElementById('email-ayarlar-form').onsubmit = emailAyarlariKaydet;
    } catch (error) {
        console.error('E-posta ayarları yüklenemedi:', error);
    }
}

async function emailAyarlariKaydet(event) {
    event.preventDefault();

    const host = document.getElementById('email-host').value;
    const port = document.getElementById('email-port').value;
    const secure = document.getElementById('email-secure').value === 'true';
    const user = document.getElementById('email-user').value;
    const pass = document.getElementById('email-pass').value;

    if (!host || !user || !pass) {
        showToast('Tüm alanları doldurun', 'warning');
        return;
    }

    try {
        showLoading('E-posta ayarları kaydediliyor...');

        const response = await authenticatedFetch('/api/email-ayarlar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host, port, secure, user, pass })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Ayarlar kaydedilemedi');
        }

        showToast('E-posta ayarları başarıyla kaydedildi', 'success');
        await loadEmailAyarlar();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function testEmailGonder() {
    const email = prompt('Test e-postası göndermek için e-posta adresi girin:');
    if (!email) return;

    try {
        showLoading('Test e-postası gönderiliyor...');

        const response = await authenticatedFetch('/api/email-test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'E-posta gönderilemedi');
        }

        showToast('Test e-postası başarıyla gönderildi', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

// ========================================
// PERSONEL YÖNETİMİ
// ========================================

let personeller = [];

async function loadPersoneller() {
    try {
        const response = await authenticatedFetch('/api/personeller');
        personeller = await response.json();
        renderPersonelListesi();
    } catch (error) {
        console.error('Personel yükleme hatası:', error);
        const container = document.getElementById('personel-listesi');
        if (container) {
            container.innerHTML = '<p class="text-danger">Personeller yüklenemedi</p>';
        }
    }
}

function renderPersonelListesi() {
    const container = document.getElementById('personel-listesi');
    if (!container) return;

    if (personeller.length === 0) {
        container.innerHTML = '<p class="text-muted">Henüz personel tanımlanmamış</p>';
        return;
    }

    const aktifPersoneller = personeller.filter(p => p.aktif);
    const pasifPersoneller = personeller.filter(p => !p.aktif);

    container.innerHTML = `
        <div style="background: #f0f7ff; padding: 10px; border-radius: 8px; margin-bottom: 15px; display: flex; justify-content: space-around; text-align: center;">
            <div>
                <div style="font-size: 24px; font-weight: bold; color: #2C5F8D;">${personeller.length}</div>
                <div style="color: #666; font-size: 12px;">Toplam</div>
            </div>
            <div>
                <div style="font-size: 24px; font-weight: bold; color: #28a745;">${aktifPersoneller.length}</div>
                <div style="color: #666; font-size: 12px;">Aktif</div>
            </div>
            <div>
                <div style="font-size: 24px; font-weight: bold; color: #999;">${pasifPersoneller.length}</div>
                <div style="color: #666; font-size: 12px;">Pasif</div>
            </div>
        </div>

        <table class="table" style="font-size: 13px;">
            <thead>
                <tr>
                    <th>Ad Soyad</th>
                    <th>Ünvan</th>
                    <th>Sertifika No</th>
                    <th>Telefon</th>
                    <th>Durum</th>
                    <th>İşlemler</th>
                </tr>
            </thead>
            <tbody>
                ${personeller.map(personel => `
                    <tr style="${!personel.aktif ? 'opacity: 0.6;' : ''}">
                        <td><strong>${personel.adSoyad}</strong></td>
                        <td>${personel.unvan}</td>
                        <td>${personel.sertifikaNo || '-'}</td>
                        <td>${personel.telefon || '-'}</td>
                        <td>
                            <span class="badge ${personel.aktif ? 'badge-onaylandı' : 'badge-reddedildi'}">
                                ${personel.aktif ? 'Aktif' : 'Pasif'}
                            </span>
                        </td>
                        <td>
                            <button class="btn btn-sm btn-secondary" onclick="personelDuzenle(${personel.id})" title="Düzenle">✏️</button>
                            <button class="btn btn-sm btn-danger" onclick="personelSil(${personel.id}, '${personel.adSoyad}')" title="Sil">🗑️</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function yeniPersonelModal() {
    document.getElementById('personel-modal-baslik').textContent = 'Yeni Personel';
    document.getElementById('personel-id').value = '';
    document.getElementById('personel-ad-soyad').value = '';
    document.getElementById('personel-unvan').value = '';
    document.getElementById('personel-sertifika-no').value = '';
    document.getElementById('personel-telefon').value = '';
    document.getElementById('personel-email').value = '';
    document.getElementById('personel-aktif').checked = true;
    document.getElementById('personel-modal').style.display = 'block';
}

function closePersonelModal() {
    document.getElementById('personel-modal').style.display = 'none';
}

function personelDuzenle(personelId) {
    const personel = personeller.find(p => p.id === personelId);
    if (!personel) return;

    document.getElementById('personel-modal-baslik').textContent = 'Personeli Düzenle';
    document.getElementById('personel-id').value = personel.id;
    document.getElementById('personel-ad-soyad').value = personel.adSoyad;
    document.getElementById('personel-unvan').value = personel.unvan;
    document.getElementById('personel-sertifika-no').value = personel.sertifikaNo || '';
    document.getElementById('personel-telefon').value = personel.telefon || '';
    document.getElementById('personel-email').value = personel.email || '';
    document.getElementById('personel-aktif').checked = personel.aktif;
    document.getElementById('personel-modal').style.display = 'block';
}

async function personelKaydet() {
    const id = document.getElementById('personel-id').value;
    const adSoyad = document.getElementById('personel-ad-soyad').value.trim();
    const unvan = document.getElementById('personel-unvan').value.trim();
    const sertifikaNo = document.getElementById('personel-sertifika-no').value.trim();
    const telefon = document.getElementById('personel-telefon').value.trim();
    const email = document.getElementById('personel-email').value.trim();
    const aktif = document.getElementById('personel-aktif').checked;

    if (!adSoyad || !unvan) {
        showToast('Ad Soyad ve Ünvan zorunludur', 'warning');
        return;
    }

    const personelData = { adSoyad, unvan, sertifikaNo, telefon, email, aktif };

    try {
        showLoading();
        const url = id ? `/api/personeller/${id}` : '/api/personeller';
        const method = id ? 'PUT' : 'POST';

        const response = await authenticatedFetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(personelData)
        });

        if (response.ok) {
            showToast(id ? 'Personel güncellendi' : 'Personel eklendi', 'success');
            closePersonelModal();
            await loadPersoneller();
        } else {
            const error = await response.json();
            showToast('Hata: ' + error.error, 'error');
        }
    } catch (error) {
        console.error('Personel kaydetme hatası:', error);
        showToast('Kaydetme sırasında hata oluştu', 'error');
    } finally {
        hideLoading();
    }
}

async function personelSil(personelId, adSoyad) {
    if (!confirm(`"${adSoyad}" personelini silmek istediğinize emin misiniz?`)) {
        return;
    }

    try {
        showLoading();
        const response = await authenticatedFetch(`/api/personeller/${personelId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('Personel silindi', 'success');
            await loadPersoneller();
        } else {
            const error = await response.json();
            showToast('Hata: ' + error.error, 'error');
        }
    } catch (error) {
        console.error('Personel silme hatası:', error);
        showToast('Silme sırasında hata oluştu', 'error');
    } finally {
        hideLoading();
    }
}

// ========================================
// SERTİFİKA ŞABLON YÖNETİMİ
// ========================================

let sertifikaSablonlari = [];

async function loadSertifikaSablonlari() {
    try {
        const response = await authenticatedFetch('/api/sertifika-sablonlari');
        if (response.ok) {
            const data = await response.json();
            sertifikaSablonlari = Array.isArray(data) ? data : [];
        } else {
            sertifikaSablonlari = [];
        }
        renderSertifikaSablonlari();
    } catch (error) {
        console.error('Şablon yükleme hatası:', error);
        sertifikaSablonlari = [];
        const container = document.getElementById('sertifika-sablonlari');
        if (container) {
            container.innerHTML = '<p class="text-muted">Şablonlar henüz yapılandırılmamış</p>';
        }
    }
}

function renderSertifikaSablonlari() {
    const container = document.getElementById('sertifika-sablonlari');
    if (!container) return;

    if (!sertifikaSablonlari || sertifikaSablonlari.length === 0) {
        container.innerHTML = '<p class="text-muted">Henüz şablon tanımlanmamış</p>';
        return;
    }

    // Kategoriye göre grupla (kategori yoksa kod veya 'Genel' kullan)
    const kategoriGruplari = {};
    sertifikaSablonlari.forEach(sablon => {
        const kategori = sablon.kategori || sablon.kod || 'Genel';
        if (!kategoriGruplari[kategori]) {
            kategoriGruplari[kategori] = [];
        }
        kategoriGruplari[kategori].push(sablon);
    });

    // İstatistikler
    const toplamSablon = sertifikaSablonlari.length;
    const aktifSablon = sertifikaSablonlari.filter(s => s.aktif).length;

    container.innerHTML = `
        <div style="background: #f0f7ff; padding: 15px; border-radius: 8px; margin-bottom: 20px; display: flex; justify-content: space-around; text-align: center;">
            <div>
                <div style="font-size: 32px; font-weight: bold; color: #2C5F8D;">${toplamSablon}</div>
                <div style="color: #666; font-size: 14px;">Toplam Şablon</div>
            </div>
            <div>
                <div style="font-size: 32px; font-weight: bold; color: #28a745;">${aktifSablon}</div>
                <div style="color: #666; font-size: 14px;">Aktif</div>
            </div>
            <div>
                <div style="font-size: 32px; font-weight: bold; color: #666;">${Object.keys(kategoriGruplari).length}</div>
                <div style="color: #666; font-size: 14px;">Kategori</div>
            </div>
        </div>

        <div style="margin-bottom: 15px;">
            <input type="text" id="sablon-ayar-arama" class="form-input" placeholder="🔍 Şablon ara..."
                   onkeyup="filterAyarlarSablonlar()" style="max-width: 400px;">
        </div>

        ${Object.entries(kategoriGruplari).map(([kategori, sablonlar]) => `
            <div style="margin-bottom: 20px; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #2C5F8D 0%, #1a3a5c 100%); color: white; padding: 15px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;"
                     onclick="toggleKategori('kategori-${kategori.replace(/\s/g, '-')}')">
                    <div>
                        <strong style="font-size: 16px;">📁 ${kategori}</strong>
                        <span style="margin-left: 10px; font-size: 14px; opacity: 0.9;">(${sablonlar.length} şablon)</span>
                    </div>
                    <span id="icon-kategori-${kategori.replace(/\s/g, '-')}" style="font-size: 20px; transition: transform 0.3s;">▼</span>
                </div>
                <div id="kategori-${kategori.replace(/\s/g, '-')}" style="display: none; padding: 15px; background: #fafafa;">
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px;">
                        ${sablonlar.map(sablon => `
                            <div class="sablon-kart" style="
                                background: white;
                                border: 2px solid ${sablon.aktif ? '#e3f2fd' : '#f5f5f5'};
                                border-radius: 8px;
                                padding: 15px;
                                transition: all 0.2s;
                                position: relative;
                            " onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'; this.style.transform='translateY(-2px)'"
                               onmouseout="this.style.boxShadow='none'; this.style.transform='translateY(0)'">
                                <div style="position: absolute; top: 10px; right: 10px;">
                                    <span class="badge ${sablon.aktif ? 'badge-onaylandı' : 'badge-reddedildi'}" style="font-size: 10px;">
                                        ${sablon.aktif ? '✓ Aktif' : '✗ Pasif'}
                                    </span>
                                </div>
                                <h4 style="margin: 0 0 10px 0; color: #2C5F8D; font-size: 14px; padding-right: 60px;">
                                    ${sablon.ad}
                                </h4>
                                <p style="margin: 0 0 10px 0; font-size: 12px; color: #666; line-height: 1.4;">
                                    ${sablon.aciklama || 'Açıklama yok'}
                                </p>
                                <div style="display: flex; gap: 5px; margin-bottom: 10px; flex-wrap: wrap;">
                                    ${sablon.teknikAlanlar && sablon.teknikAlanlar.length > 0 ? `
                                        <span style="background: #e8f5e9; color: #2e7d32; padding: 3px 8px; border-radius: 12px; font-size: 11px;">
                                            🔧 ${sablon.teknikAlanlar.length} teknik alan
                                        </span>
                                    ` : ''}
                                    ${sablon.testAlanlar && sablon.testAlanlar.length > 0 ? `
                                        <span style="background: #fff3e0; color: #ef6c00; padding: 3px 8px; border-radius: 12px; font-size: 11px;">
                                            📊 ${sablon.testAlanlar.length} test alanı
                                        </span>
                                    ` : ''}
                                    <span style="background: #e3f2fd; color: #1565c0; padding: 3px 8px; border-radius: 12px; font-size: 11px;">
                                        📋 ${sablon.kod || 'N/A'}
                                    </span>
                                </div>
                                <div style="display: flex; gap: 5px; margin-top: 10px;">
                                    <button class="btn btn-sm btn-secondary" onclick="sertifikaSablonDuzenle(${sablon.id})" title="Düzenle" style="flex: 1;">
                                        ✏️ Düzenle
                                    </button>
                                    <button class="btn btn-sm btn-danger" onclick="sertifikaSablonSil(${sablon.id})" title="Sil">
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `).join('')}
    `;
}

function toggleKategori(kategoriId) {
    const element = document.getElementById(kategoriId);
    const icon = document.getElementById('icon-' + kategoriId);

    if (element.style.display === 'none') {
        element.style.display = 'block';
        icon.style.transform = 'rotate(180deg)';
    } else {
        element.style.display = 'none';
        icon.style.transform = 'rotate(0deg)';
    }
}

function filterAyarlarSablonlar() {
    const arama = document.getElementById('sablon-ayar-arama').value.toLowerCase();
    const kartlar = document.querySelectorAll('.sablon-kart');

    kartlar.forEach(kart => {
        const text = kart.textContent.toLowerCase();
        if (text.includes(arama)) {
            kart.style.display = 'block';
        } else {
            kart.style.display = 'none';
        }
    });
}

function yeniSertifikaSablonModal() {
    document.getElementById('sablon-modal-baslik').textContent = 'Yeni Sertifika Şablonu';
    document.getElementById('sablon-id').value = '';
    document.getElementById('sablon-adi').value = '';
    document.getElementById('sablon-kategori').value = '';
    document.getElementById('sablon-aciklama').value = '';
    document.getElementById('sablon-teknik-alanlar').value = '';
    document.getElementById('sablon-test-alanlar').value = '';
    document.getElementById('sablon-aktif').checked = true;
    document.getElementById('sertifika-sablon-modal').style.display = 'block';
}

function closeSertifikaSablonModal() {
    document.getElementById('sertifika-sablon-modal').style.display = 'none';
}

function sertifikaSablonDuzenle(sablonId) {
    const sablon = sertifikaSablonlari.find(s => s.id === sablonId);
    if (!sablon) return;

    document.getElementById('sablon-modal-baslik').textContent = 'Şablonu Düzenle';
    document.getElementById('sablon-id').value = sablon.id;
    document.getElementById('sablon-adi').value = sablon.ad;
    document.getElementById('sablon-kategori').value = sablon.kategori;
    document.getElementById('sablon-aciklama').value = sablon.aciklama || '';
    document.getElementById('sablon-teknik-alanlar').value = sablon.teknikAlanlar ? sablon.teknikAlanlar.join(', ') : '';
    document.getElementById('sablon-test-alanlar').value = sablon.testAlanlar ? sablon.testAlanlar.join(', ') : '';
    document.getElementById('sablon-aktif').checked = sablon.aktif;
    document.getElementById('sertifika-sablon-modal').style.display = 'block';
}

async function sertifikaSablonKaydet() {
    const id = document.getElementById('sablon-id').value;
    const ad = document.getElementById('sablon-adi').value.trim();
    const kategori = document.getElementById('sablon-kategori').value;
    const aciklama = document.getElementById('sablon-aciklama').value.trim();
    const teknikAlanlarStr = document.getElementById('sablon-teknik-alanlar').value.trim();
    const testAlanlarStr = document.getElementById('sablon-test-alanlar').value.trim();
    const aktif = document.getElementById('sablon-aktif').checked;

    if (!ad || !kategori) {
        showToast('Şablon adı ve kategori zorunludur', 'warning');
        return;
    }

    const sablonData = {
        ad,
        kategori,
        aciklama,
        teknikAlanlar: teknikAlanlarStr ? teknikAlanlarStr.split(',').map(s => s.trim()).filter(Boolean) : [],
        testAlanlar: testAlanlarStr ? testAlanlarStr.split(',').map(s => s.trim()).filter(Boolean) : [],
        aktif
    };

    try {
        showLoading();
        const url = id ? `/api/sertifika-sablonlari/${id}` : '/api/sertifika-sablonlari';
        const method = id ? 'PUT' : 'POST';

        const response = await authenticatedFetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sablonData)
        });

        if (response.ok) {
            showToast(id ? 'Şablon güncellendi' : 'Şablon oluşturuldu', 'success');
            closeSertifikaSablonModal();
            await loadSertifikaSablonlari();
        } else {
            const error = await response.json();
            showToast('Hata: ' + error.error, 'error');
        }
    } catch (error) {
        console.error('Şablon kaydetme hatası:', error);
        showToast('Kaydetme sırasında hata oluştu', 'error');
    } finally {
        hideLoading();
    }
}

async function sertifikaSablonSil(sablonId) {
    const sablon = sertifikaSablonlari.find(s => s.id === sablonId);
    if (!sablon) return;

    if (!confirm(`"${sablon.ad}" şablonunu silmek istediğinize emin misiniz?`)) {
        return;
    }

    try {
        showLoading();
        const response = await authenticatedFetch(`/api/sertifika-sablonlari/${sablonId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('Şablon silindi', 'success');
            await loadSertifikaSablonlari();
        } else {
            const error = await response.json();
            showToast('Hata: ' + error.error, 'error');
        }
    } catch (error) {
        console.error('Şablon silme hatası:', error);
        showToast('Silme sırasında hata oluştu', 'error');
    } finally {
        hideLoading();
    }
}

// ========================================
// TEKLİF NOT SİSTEMİ
// ========================================

async function teklifNotEkle(event, teklifId) {
    event.preventDefault();

    const notMesaji = document.getElementById('yeni-not').value.trim();
    if (!notMesaji) {
        showToast('Not mesajı boş olamaz', 'warning');
        return;
    }

    const teklif = teklifler.find(t => t.id === teklifId);
    if (!teklif) return;

    // Notlar dizisini başlat
    if (!teklif.notlar) {
        teklif.notlar = [];
    }

    // Yeni notu ekle
    teklif.notlar.push({
        id: Date.now(),
        mesaj: notMesaji,
        tarih: new Date().toISOString()
    });

    showLoading();

    try {
        const response = await authenticatedFetch(`${API_BASE}/teklifler/${teklifId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(teklif)
        });

        if (response.ok) {
            showToast('Not başarıyla eklendi', 'success');

            // Formu temizle
            document.getElementById('yeni-not').value = '';

            // Notlar listesini yenile
            const notlarDiv = document.querySelector('.notlar-liste');
            if (notlarDiv) {
                notlarDiv.innerHTML = renderTeklifNotlar(teklif).match(/<div class="notlar-liste">([\s\S]*)<\/div>/)[1];
            }
        } else {
            showToast('Not eklenirken hata oluştu', 'error');
        }
    } catch (error) {
        console.error('Not ekleme hatası:', error);
        showToast('Not eklenirken hata oluştu', 'error');
    } finally {
        hideLoading();
    }
}

// ========================================
// DASHBOARD GRAFİKLERİ
// ========================================

function drawDurumChart() {
    const canvas = document.getElementById('durum-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Durumları say - API'den gelen enum değerleri
    const durumSayilari = {
        'TASLAK': 0,
        'GONDERILDI': 0,
        'ONAYLANDI': 0,
        'REDDEDILDI': 0,
        'IPTAL': 0
    };

    teklifler.forEach(teklif => {
        if (durumSayilari.hasOwnProperty(teklif.durum)) {
            durumSayilari[teklif.durum]++;
        }
    });

    const toplam = teklifler.length;

    // Eğer hiç teklif yoksa
    if (toplam === 0) {
        ctx.font = '16px Arial';
        ctx.fillStyle = '#666';
        ctx.textAlign = 'center';
        ctx.fillText('Henüz teklif bulunmuyor', canvas.width / 2, canvas.height / 2);
        return;
    }

    // Renk tanımlamaları
    const renkler = {
        'TASLAK': '#ffc107',
        'GONDERILDI': '#17a2b8',
        'ONAYLANDI': '#28a745',
        'REDDEDILDI': '#dc3545',
        'IPTAL': '#6c757d'
    };

    // Türkçe etiketler
    const durumEtiketleri = {
        'TASLAK': 'Taslak',
        'GONDERILDI': 'Gönderildi',
        'ONAYLANDI': 'Onaylandı',
        'REDDEDILDI': 'Reddedildi',
        'IPTAL': 'İptal'
    };

    // Canvas boyutlarını ayarla
    canvas.width = 300;
    canvas.height = 300;

    // Pasta grafik çiz
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 100;
    let currentAngle = -Math.PI / 2; // Üstten başla

    Object.keys(durumSayilari).forEach(durum => {
        const sayı = durumSayilari[durum];
        if (sayı > 0) {
            const sliceAngle = (sayı / toplam) * 2 * Math.PI;

            // Dilimi çiz
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
            ctx.closePath();
            ctx.fillStyle = renkler[durum];
            ctx.fill();

            // Kenar çizgisi
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Yüzde yazısı
            const yuzde = Math.round((sayı / toplam) * 100);
            const textAngle = currentAngle + sliceAngle / 2;
            const textX = centerX + Math.cos(textAngle) * (radius * 0.7);
            const textY = centerY + Math.sin(textAngle) * (radius * 0.7);

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${yuzde}%`, textX, textY);

            currentAngle += sliceAngle;
        }
    });

    // Merkez boşluk (donut efekti)
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.4, 0, 2 * Math.PI);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // Merkeze toplam sayı yaz
    ctx.fillStyle = '#333';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(toplam, centerX, centerY - 10);
    ctx.font = '14px Arial';
    ctx.fillText('Toplam', centerX, centerY + 10);

    // Detay listesini güncelle
    const detayHtml = Object.keys(durumSayilari).map(durum => {
        const sayı = durumSayilari[durum];
        const yuzde = toplam > 0 ? Math.round((sayı / toplam) * 100) : 0;
        const durumAdi = durumEtiketleri[durum] || durum;

        return `
            <div class="durum-item" style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;">
                <div class="durum-label" style="display: flex; align-items: center; gap: 8px;">
                    <div class="durum-color" style="width: 16px; height: 16px; border-radius: 4px; background-color: ${renkler[durum]}"></div>
                    <span>${durumAdi}</span>
                </div>
                <div>
                    <span class="durum-count" style="font-weight: bold;">${sayı}</span>
                    <span style="color: #666; font-size: 14px;"> (%${yuzde})</span>
                </div>
            </div>
        `;
    }).join('');

    const detayDiv = document.getElementById('durum-detay-liste');
    if (detayDiv) {
        detayDiv.innerHTML = detayHtml;
    }
}

// ========================================
// SİSTEM FONKSİYONLARI
// ========================================

async function sistemdenCik() {
    if (confirm('Sistemden çıkmak istediğinizden emin misiniz?')) {
        showToast('Çıkış yapılıyor...', 'info');

        try {
            // Logout API çağrısı
            await authenticatedFetch(`${API_BASE}/auth/logout`, {
                method: 'POST'
            });
        } catch (error) {
            console.error('Logout hatası:', error);
        }

        // Token ve kullanıcı bilgilerini temizle
        localStorage.removeItem('token');
        localStorage.removeItem('user');

        // Login sayfasına yönlendir
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 1000);
    }
}

// ========================================
// TEKLİF DURUM YÖNETİMİ
// ========================================

function teklifDurumDegistirModal(teklifId) {
    const teklif = teklifler.find(t => t.id === teklifId);
    if (!teklif) return;

    const modalHTML = `
        <div class="modal-overlay" onclick="closeModal(event)">
            <div class="modal" onclick="event.stopPropagation()" style="max-width: 500px;">
                <div class="modal-header">
                    <h3>Teklif Durumu Değiştir</h3>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="teklif-bilgi">
                        <p><strong>Teklif No:</strong> ${teklif.teklifNo}</p>
                        <p><strong>Müşteri:</strong> ${musteriler.find(m => m.id === teklif.musteriId)?.unvan || 'Bilinmiyor'}</p>
                        <p><strong>Tutar:</strong> ${formatParaTR(teklif.genelToplam)}</p>
                        <p><strong>Mevcut Durum:</strong> <span class="badge badge-${teklif.durum.toLowerCase().replace('ı', 'i')}">${teklif.durum}</span></p>
                    </div>
                    
                    <form id="durum-form" onsubmit="teklifDurumGuncelle(event, ${teklifId})">
                        <div class="form-group">
                            <label class="form-label required">Yeni Durum</label>
                            <select class="form-select" id="yeni-durum" required>
                                <option value="">Seçiniz</option>
                                <option value="Bekleyen" ${teklif.durum === 'Bekleyen' ? 'disabled' : ''}>Bekleyen</option>
                                <option value="Onaylandı" ${teklif.durum === 'Onaylandı' ? 'disabled' : ''}>Onaylandı ✅</option>
                                <option value="Reddedildi" ${teklif.durum === 'Reddedildi' ? 'disabled' : ''}>Reddedildi ❌</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Not (Opsiyonel)</label>
                            <textarea class="form-textarea" id="durum-not" rows="3" placeholder="Durum değişikliği ile ilgili not ekleyebilirsiniz..."></textarea>
                        </div>

                        ${teklif.durum === 'Bekleyen' && `
                            <div class="alert alert-info">
                                <strong>💡 İpucu:</strong> Teklifi onaylamadan önce müşteri ile görüşmenizi öneririz.
                            </div>
                        `}
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeModal()">İptal</button>
                    <button class="btn btn-primary" onclick="document.getElementById('durum-form').requestSubmit()">Durumu Güncelle</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('modal-container').innerHTML = modalHTML;
}

async function teklifDurumGuncelle(event, teklifId) {
    event.preventDefault();

    const yeniDurum = document.getElementById('yeni-durum').value;
    const not = document.getElementById('durum-not').value;

    if (!yeniDurum) {
        showToast('Yeni durum seçmelisiniz', 'warning');
        return;
    }

    const teklif = teklifler.find(t => t.id === teklifId);
    if (!teklif) return;

    // Eski durumu kaydet
    const eskiDurum = teklif.durum;

    // Yeni durumu ata
    teklif.durum = yeniDurum;

    // Tarih ve not ekle (ileride log sistemi için)
    if (!teklif.durumGecmisi) {
        teklif.durumGecmisi = [];
    }

    teklif.durumGecmisi.push({
        eskiDurum: eskiDurum,
        yeniDurum: yeniDurum,
        tarih: new Date().toISOString(),
        not: not
    });

    showLoading();

    try {
        // PATCH endpoint kullan - otomatik iş emri oluşturma bu endpoint'te
        const response = await authenticatedFetch(`${API_BASE}/teklifler/${teklifId}/durum`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ durum: yeniDurum })
        });

        if (response.ok) {
            showToast(`Teklif durumu "${yeniDurum}" olarak güncellendi`, 'success');
            closeModal();

            // Teklifleri yeniden yükle
            await loadTeklifler();

            // Dashboard istatistiklerini güncelle
            if (document.getElementById('page-dashboard').classList.contains('active')) {
                loadDashboardStats();
            }

            // Durum değişikliği bildirimi
            if (yeniDurum === 'Onaylandı') {
                showToast('🎉 Teklif onaylandı! İş emri otomatik oluşturuldu.', 'success');
            } else if (yeniDurum === 'Reddedildi') {
                showToast('Teklif reddedildi. Müşteri ile görüşmeyi düşünebilirsiniz.', 'info');
            }
        } else {
            const error = await response.json();
            showToast(error.error || 'Durum güncellenirken hata oluştu', 'error');
        }
    } catch (error) {
        console.error('Durum güncelleme hatası:', error);
        showToast('Durum güncellenirken hata oluştu', 'error');
    } finally {
        hideLoading();
    }
}

// ========================================
// HİZMET YÖNETİMİ
// ========================================

function openHizmetEkleModal() {
    // Mevcut kategorileri al
    const kategoriler = hizmetler.map(k => k.kategori);

    const modalHTML = `
        <div class="modal-overlay" onclick="closeModal(event)">
            <div class="modal" onclick="event.stopPropagation()" style="max-width: 600px;">
                <div class="modal-header">
                    <h3>Yeni Hizmet Ekle</h3>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="hizmet-ekle-form" onsubmit="hizmetEkle(event)">
                        <div class="form-group">
                            <label class="form-label required">Kategori</label>
                            <div style="display: flex; gap: 10px;">
                                <select class="form-input" id="hizmet-kategori" onchange="kategoriSecimDegisti()" style="flex: 1;">
                                    <option value="">Kategori Seçin</option>
                                    ${kategoriler.map(k => `<option value="${k}">${k}</option>`).join('')}
                                    <option value="__yeni__">➕ Yeni Kategori Oluştur</option>
                                </select>
                                <input type="text" class="form-input" id="yeni-kategori" placeholder="Yeni kategori adı" style="flex: 1; display: none;">
                            </div>
                        </div>

                        <div class="form-group">
                            <label class="form-label required">Hizmet Adı</label>
                            <input type="text" class="form-input" id="hizmet-ad" required>
                        </div>

                        <div class="form-group">
                            <label class="form-label required">Metod / Standart</label>
                            <input type="text" class="form-input" id="hizmet-metod" placeholder="ör: İş Ekipmanların Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği" required>
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label required">Birim</label>
                                <select class="form-input" id="hizmet-birim" required>
                                    <option value="Adet">Adet</option>
                                    <option value="Nokta">Nokta</option>
                                </select>
                            </div>

                            <div class="form-group">
                                <label class="form-label required">Birim Fiyat (₺)</label>
                                <input type="number" class="form-input" id="hizmet-fiyat" min="0" step="0.01" required>
                            </div>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeModal()">İptal</button>
                    <button class="btn btn-primary" onclick="document.getElementById('hizmet-ekle-form').requestSubmit()">Hizmet Ekle</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('modal-container').innerHTML = modalHTML;
}

function kategoriSecimDegisti() {
    const kategoriSelect = document.getElementById('hizmet-kategori');
    const yeniKategoriInput = document.getElementById('yeni-kategori');

    if (kategoriSelect.value === '__yeni__') {
        yeniKategoriInput.style.display = 'block';
        yeniKategoriInput.required = true;
        kategoriSelect.style.display = 'none';
    }
}

async function hizmetEkle(event) {
    event.preventDefault();

    const kategoriSelect = document.getElementById('hizmet-kategori');
    const yeniKategoriInput = document.getElementById('yeni-kategori');

    let kategori = kategoriSelect.value;
    if (kategori === '__yeni__') {
        kategori = yeniKategoriInput.value.trim();
        if (!kategori) {
            showToast('Yeni kategori adı girmelisiniz', 'warning');
            return;
        }
    }

    if (!kategori) {
        showToast('Kategori seçmelisiniz', 'warning');
        return;
    }

    const hizmetData = {
        kategori: kategori,
        ad: document.getElementById('hizmet-ad').value.trim(),
        metod: document.getElementById('hizmet-metod').value.trim(),
        birim: document.getElementById('hizmet-birim').value,
        fiyat: parseFloat(document.getElementById('hizmet-fiyat').value)
    };

    showLoading();

    try {
        const response = await authenticatedFetch(`${API_BASE}/hizmetler`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(hizmetData)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showToast('Hizmet başarıyla eklendi', 'success');
            closeModal();

            // Hizmetleri yeniden yükle
            await loadHizmetler();

            // Teklif modalındaki hizmet listesini güncelle
            const hizmetSecimiDiv = document.getElementById('hizmet-secimi');
            if (hizmetSecimiDiv) {
                hizmetSecimiDiv.innerHTML = renderHizmetSecimi([]);

                // Event listener'ları yeniden ekle
                document.querySelectorAll('.hizmet-checkbox').forEach(checkbox => {
                    checkbox.addEventListener('change', hesaplaFiyat);
                });
                document.querySelectorAll('.hizmet-miktar').forEach(input => {
                    input.addEventListener('input', hesaplaFiyat);
                });
                document.querySelectorAll('.hizmet-fiyat').forEach(input => {
                    input.addEventListener('input', hesaplaFiyat);
                });

                hesaplaFiyat();
            }
        } else {
            showToast(result.error || 'Hizmet eklenirken hata oluştu', 'error');
        }
    } catch (error) {
        console.error('Hizmet ekleme hatası:', error);
        showToast('Hizmet eklenirken hata oluştu', 'error');
    } finally {
        hideLoading();
    }
}

// ========================================
// YARDIMCI FONKSİYONLAR
// ========================================

function formatParaTR(tutar) {
    if (tutar === null || tutar === undefined || isNaN(tutar)) {
        return '₺0,00';
    }
    return '₺' + Number(tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTarihTR(tarih) {
    const date = new Date(tarih);
    const gun = date.getDate().toString().padStart(2, '0');
    const ay = (date.getMonth() + 1).toString().padStart(2, '0');
    const yil = date.getFullYear();
    return `${gun}.${ay}.${yil}`;
}

// ========================================
// PAGİNATİON HELPER FUNCTIONS
// ========================================

function generatePaginationHTML(currentPage, totalItems, moduleName) {
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

    if (totalPages <= 1) {
        return ''; // Tek sayfa varsa pagination gösterme
    }

    const startItem = (currentPage - 1) * ITEMS_PER_PAGE + 1;
    const endItem = Math.min(currentPage * ITEMS_PER_PAGE, totalItems);

    return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px 0; border-top: 1px solid #e0e0e0; margin-top: 15px;">
            <div style="color: #666; font-size: 14px;">
                <strong>${startItem}-${endItem}</strong> / ${totalItems} kayıt gösteriliyor
            </div>
            <div style="display: flex; gap: 5px; align-items: center;">
                <button
                    onclick="changePage${moduleName}(${currentPage - 1})"
                    class="btn btn-sm btn-secondary"
                    ${currentPage === 1 ? 'disabled' : ''}
                    style="padding: 5px 12px;">
                    ◀ Önceki
                </button>

                <div style="display: flex; gap: 3px;">
                    ${generatePageNumbers(currentPage, totalPages, moduleName)}
                </div>

                <button
                    onclick="changePage${moduleName}(${currentPage + 1})"
                    class="btn btn-sm btn-secondary"
                    ${currentPage === totalPages ? 'disabled' : ''}
                    style="padding: 5px 12px;">
                    Sonraki ▶
                </button>
            </div>
        </div>
    `;
}

function generatePageNumbers(currentPage, totalPages, moduleName) {
    let pages = [];

    // Her zaman ilk sayfayı göster
    pages.push(1);

    // Mevcut sayfanın etrafındaki sayfaları hesapla
    let start = Math.max(2, currentPage - 1);
    let end = Math.min(totalPages - 1, currentPage + 1);

    // İlk sayfa ile başlangıç arasında boşluk varsa "..." ekle
    if (start > 2) {
        pages.push('...');
    }

    // Orta sayfaları ekle
    for (let i = start; i <= end; i++) {
        pages.push(i);
    }

    // Bitiş ile son sayfa arasında boşluk varsa "..." ekle
    if (end < totalPages - 1) {
        pages.push('...');
    }

    // Son sayfayı ekle (eğer 1'den büyükse)
    if (totalPages > 1) {
        pages.push(totalPages);
    }

    return pages.map(page => {
        if (page === '...') {
            return '<span style="padding: 5px 10px; color: #999;">...</span>';
        }

        const isActive = page === currentPage;
        return `
            <button
                onclick="changePage${moduleName}(${page})"
                class="btn btn-sm ${isActive ? 'btn-primary' : 'btn-secondary'}"
                style="padding: 5px 12px; min-width: 36px; ${isActive ? 'font-weight: bold;' : ''}">
                ${page}
            </button>
        `;
    }).join('');
}

function showLoading() {
    document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}

function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');

    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    const titles = {
        success: 'Başarılı',
        error: 'Hata',
        warning: 'Uyarı',
        info: 'Bilgi'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-icon">${icons[type]}</div>
        <div class="toast-content">
            <div class="toast-title">${titles[type]}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;

    toastContainer.appendChild(toast);

    // 5 saniye sonra kaldır
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            toastContainer.removeChild(toast);
        }, 300);
    }, 5000);
}

function closeModal(event) {
    // Eğer overlay'e tıklanmışsa veya fonksiyon doğrudan çağrılmışsa
    if (!event || event.target.classList.contains('modal-overlay')) {
        document.getElementById('modal-container').innerHTML = '';
    }
}

// ========================================
// KONSOL KARŞILAMA MESAJI
// ========================================
// ========================================
// İŞ EMRİ YÖNETİMİ
// ========================================

let isEmirleri = [];
let currentIsEmriFilter = 'all';
let currentPageIsEmri = 1;

async function loadIsEmirleri() {
    try {
        // Müşterileri yükle (tabloda müşteri adı göstermek için gerekli)
        if (musteriler.length === 0) {
            const musteriResponse = await authenticatedFetch('/api/musteriler');
            musteriler = await musteriResponse.json();
            console.log('✅ Müşteriler yüklendi:', musteriler.length);
        }

        // Personelleri de yükle (kalem personel ataması için gerekli)
        if (personeller.length === 0) {
            const personelResponse = await authenticatedFetch('/api/personeller');
            personeller = await personelResponse.json();
            console.log('✅ Personeller yüklendi:', personeller.length);
        }

        const response = await authenticatedFetch(`${API_BASE}/is-emirleri`);
        isEmirleri = await response.json();
        renderIsEmriTable();
    } catch (error) {
        console.error('İş emri yükleme hatası:', error);
        showToast('İş emirleri yüklenirken hata oluştu', 'error');
    }
}

function renderIsEmriTable() {
    const tbody = document.querySelector('#is-emri-table tbody');
    if (!tbody) return;

    const container = document.querySelector('#is-emri-table').parentElement;
    tbody.innerHTML = '';

    // Filtre uygula
    let filteredIsEmirleri = isEmirleri;
    if (currentIsEmriFilter !== 'all') {
        filteredIsEmirleri = isEmirleri.filter(ie => ie.durum === currentIsEmriFilter);
    }

    if (filteredIsEmirleri.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Henüz iş emri bulunmamaktadır</td></tr>';
        // Pagination'ı temizle
        const existingPagination = container.querySelector('.pagination-container');
        if (existingPagination) existingPagination.remove();
        return;
    }

    // Pagination hesapla
    const startIndex = (currentPageIsEmri - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const paginatedIsEmirleri = filteredIsEmirleri.slice(startIndex, endIndex);

    paginatedIsEmirleri.forEach(isEmri => {
        // Müşteri adını al
        const musteriAdi = isEmri.customer?.unvan ||
                          (musteriler.find(m => m.id === isEmri.customerId)?.unvan) ||
                          '-';

        // Görev sayısı
        const gorevSayisi = isEmri.altGorevler?.length || 0;

        // Durum badge renkleri (BEKLIYOR=gri, ATANDI=mavi, SAHADA=turuncu, TAMAMLANDI=yeşil, RAPOR_YAZILDI=mor, TESLIM_EDILDI=koyu yeşil)
        const durumStyles = {
            'BEKLIYOR': 'background: #6c757d; color: white;',
            'ATANDI': 'background: #0d6efd; color: white;',
            'SAHADA': 'background: #fd7e14; color: white;',
            'TAMAMLANDI': 'background: #198754; color: white;',
            'RAPOR_YAZILDI': 'background: #6f42c1; color: white;',
            'TESLIM_EDILDI': 'background: #0f5132; color: white;',
            'IPTAL': 'background: #dc3545; color: white;'
        };
        const durumStyle = durumStyles[isEmri.durum] || 'background: #6c757d; color: white;';

        // Durum Türkçe karşılığı
        const durumText = {
            'BEKLIYOR': 'Bekliyor',
            'ATANDI': 'Atandı',
            'SAHADA': 'Sahada',
            'TAMAMLANDI': 'Tamamlandı',
            'RAPOR_YAZILDI': 'Rapor Yazıldı',
            'TESLIM_EDILDI': 'Teslim Edildi',
            'IPTAL': 'İptal'
        }[isEmri.durum] || isEmri.durum;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${isEmri.isEmriNo}</strong></td>
            <td>${musteriAdi}</td>
            <td>${isEmri.teklif?.teklifNo || '-'}</td>
            <td>${isEmri.planliTarih ? formatTarihTR(isEmri.planliTarih) : '-'}</td>
            <td><span class="badge badge-info">${gorevSayisi} görev</span></td>
            <td><span class="badge" style="${durumStyle} padding: 4px 8px; border-radius: 4px;">${durumText}</span></td>
            <td>
                <div class="action-buttons">
                    <button onclick="viewIsEmri(${isEmri.id})" class="btn btn-sm btn-info" title="Detay">
                        👁️
                    </button>
                    <button onclick="deleteIsEmri(${isEmri.id})" class="btn btn-sm btn-danger" title="Sil">
                        🗑️
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Pagination kontrollerini ekle/güncelle
    let paginationDiv = container.querySelector('.pagination-container');
    if (!paginationDiv) {
        paginationDiv = document.createElement('div');
        paginationDiv.className = 'pagination-container';
        container.appendChild(paginationDiv);
    }
    paginationDiv.innerHTML = generatePaginationHTML(currentPageIsEmri, filteredIsEmirleri.length, 'IsEmri');
}

function changePageIsEmri(page) {
    currentPageIsEmri = page;
    renderIsEmriTable();
    // Sayfayı en üste kaydır
    document.querySelector('#is-emri-table').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function isEmriFiltrele(filter) {
    currentIsEmriFilter = filter;
    currentPageIsEmri = 1; // Filtre değişince ilk sayfaya dön

    // Filtre butonlarını güncelle
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    renderIsEmriTable();
}

// İş Emri Detay Sayfası
let currentIsEmriId = null;
let isEmriListeHTML = null; // Orijinal liste HTML'ini sakla

async function viewIsEmri(isEmriId) {
    await renderIsEmriDetay(isEmriId);
}

// İş Emirleri liste sayfasına geri dön
function isEmriListeyeDon() {
    const mainContent = document.getElementById('page-is-emirleri');
    if (mainContent && isEmriListeHTML) {
        mainContent.innerHTML = isEmriListeHTML;
    }
    currentIsEmriId = null;
    loadIsEmirleri();
}

// İş Emirleri orijinal sayfa yapısını oluştur
function getIsEmriListeHTML() {
    return `
        <div class="page-header">
            <h2>İş Emri Yönetimi</h2>
            <p>Onaylanan tekliflerden oluşturulan iş emirleri</p>
        </div>

        <div class="table-container">
            <div class="table-header">
                <h3>İş Emirleri</h3>
                <div class="filter-buttons">
                    <button class="filter-btn active" onclick="isEmriFiltrele('all')">Tümü</button>
                    <button class="filter-btn" onclick="isEmriFiltrele('BEKLIYOR')">Bekliyor</button>
                    <button class="filter-btn" onclick="isEmriFiltrele('SAHADA')">Sahada</button>
                    <button class="filter-btn" onclick="isEmriFiltrele('TAMAMLANDI')">Tamamlandı</button>
                    <button class="filter-btn" onclick="isEmriFiltrele('TESLIM_EDILDI')">Teslim Edildi</button>
                </div>
            </div>
            <table id="is-emri-table">
                <thead>
                    <tr>
                        <th>İş Emri No</th>
                        <th>Müşteri</th>
                        <th>Teklif No</th>
                        <th>Planlı Tarih</th>
                        <th>Görev</th>
                        <th>Durum</th>
                        <th>İşlemler</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td colspan="7" class="text-center">Yükleniyor...</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

async function renderIsEmriDetay(id) {
    showLoading();
    currentIsEmriId = id;

    // Orijinal liste HTML'ini sakla
    const mainContent = document.getElementById('page-is-emirleri');
    if (mainContent && !isEmriListeHTML) {
        isEmriListeHTML = getIsEmriListeHTML();
    }

    try {
        const response = await authenticatedFetch(`/api/is-emirleri/${id}`);
        const isEmri = await response.json();

        if (!response.ok) {
            showToast('İş emri bulunamadı', 'error');
            hideLoading();
            return;
        }

        const durumRenk = {
            'BEKLIYOR': '#6c757d',
            'ATANDI': '#0d6efd',
            'SAHADA': '#fd7e14',
            'TAMAMLANDI': '#198754',
            'RAPOR_YAZILDI': '#6f42c1',
            'TESLIM_EDILDI': '#0f5132'
        };

        const durumText = {
            'BEKLIYOR': 'Bekliyor',
            'ATANDI': 'Atandı',
            'SAHADA': 'Sahada',
            'TAMAMLANDI': 'Tamamlandı',
            'RAPOR_YAZILDI': 'Rapor Yazıldı',
            'TESLIM_EDILDI': 'Teslim Edildi'
        };

        const content = `
            <div class="page-header" style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h2>📋 ${isEmri.isEmriNo}</h2>
                    <p>İş Emri Detayları</p>
                </div>
                <button class="btn btn-secondary" onclick="isEmriListeyeDon();">
                    ← Geri Dön
                </button>
            </div>

            <!-- Üst Bilgi Kartları -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
                <div class="info-card" style="padding: 15px;">
                    <strong>Müşteri</strong><br>
                    <span style="font-size: 14px;">${isEmri.customer?.unvan || '-'}</span>
                </div>
                <div class="info-card" style="padding: 15px;">
                    <strong>Teklif No</strong><br>
                    <span style="font-size: 14px;">${isEmri.teklif?.teklifNo || '-'}</span>
                </div>
                <div class="info-card" style="padding: 15px;">
                    <strong>Planlı Tarih</strong><br>
                    <span style="font-size: 14px;">${isEmri.planliTarih ? formatTarihTR(isEmri.planliTarih) : '-'}</span>
                </div>
                <div class="info-card" style="padding: 15px;">
                    <strong>Durum</strong><br>
                    <span class="badge" style="background: ${durumRenk[isEmri.durum] || '#6c757d'}; color: white; padding: 4px 8px; border-radius: 4px;">
                        ${durumText[isEmri.durum] || isEmri.durum}
                    </span>
                </div>
                <div class="info-card" style="padding: 15px;">
                    <strong>Durum Değiştir</strong><br>
                    <select class="form-input" style="width: 100%; margin-top: 5px;" onchange="isEmriDurumDegistir(${isEmri.id}, this.value)">
                        <option value="BEKLIYOR" ${isEmri.durum === 'BEKLIYOR' ? 'selected' : ''}>Bekliyor</option>
                        <option value="ATANDI" ${isEmri.durum === 'ATANDI' ? 'selected' : ''}>Atandı</option>
                        <option value="SAHADA" ${isEmri.durum === 'SAHADA' ? 'selected' : ''}>Sahada</option>
                        <option value="TAMAMLANDI" ${isEmri.durum === 'TAMAMLANDI' ? 'selected' : ''}>Tamamlandı</option>
                        <option value="RAPOR_YAZILDI" ${isEmri.durum === 'RAPOR_YAZILDI' ? 'selected' : ''}>Rapor Yazıldı</option>
                        <option value="TESLIM_EDILDI" ${isEmri.durum === 'TESLIM_EDILDI' ? 'selected' : ''}>Teslim Edildi</option>
                    </select>
                </div>
            </div>

            <!-- Alt Görevler Tablosu -->
            <div class="table-container">
                <div class="table-header">
                    <h3>📦 Alt Görevler (${isEmri.altGorevler?.length || 0})</h3>
                </div>
                <table class="table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Hizmet</th>
                            <th>Ekipman</th>
                            <th>Konum</th>
                            <th>Personel</th>
                            <th>Durum</th>
                            <th>Rapor No</th>
                            <th>İşlem</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${isEmri.altGorevler?.map((gorev, index) => `
                            <tr>
                                <td>${index + 1}</td>
                                <td><strong>${gorev.hizmetAdi || '-'}</strong></td>
                                <td>${gorev.ekipmanAdi || '-'}</td>
                                <td>${gorev.ekipmanKonum || '-'}</td>
                                <td>${gorev.personelAdi || '<span style="color:#999;">Atanmadı</span>'}</td>
                                <td>
                                    <span class="badge" style="background: ${durumRenk[gorev.durum] || '#6c757d'}; color: white; padding: 3px 6px; border-radius: 3px; font-size: 11px;">
                                        ${durumText[gorev.durum] || gorev.durum}
                                    </span>
                                </td>
                                <td>${gorev.raporNo || '-'}</td>
                                <td>
                                    <button class="btn btn-sm btn-primary" onclick="altGorevDuzenle(${gorev.id})" title="Düzenle">
                                        ✏️
                                    </button>
                                </td>
                            </tr>
                        `).join('') || '<tr><td colspan="8" class="text-center">Alt görev bulunmamaktadır</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;

        // Ana içerik alanını güncelle
        if (mainContent) {
            mainContent.innerHTML = content;
        }
    } catch (error) {
        console.error('İş emri detay hatası:', error);
        showToast('Hata: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// İş Emri Durum Değiştir
async function isEmriDurumDegistir(id, durum) {
    try {
        const response = await authenticatedFetch(`/api/is-emirleri/${id}/durum`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ durum })
        });

        if (response.ok) {
            showToast('Durum güncellendi', 'success');
            renderIsEmriDetay(id);
        } else {
            const error = await response.json();
            showToast(error.error || 'Hata oluştu', 'error');
        }
    } catch (error) {
        showToast('Hata: ' + error.message, 'error');
    }
}

// Alt Görev Düzenleme Modal
async function altGorevDuzenle(gorevId) {
    try {
        // Personelleri al
        const persResponse = await authenticatedFetch('/api/personeller');
        const personeller = await persResponse.json();

        // Alt görevi al
        const gorevResponse = await authenticatedFetch(`/api/alt-gorevler/${gorevId}`);
        const gorev = gorevResponse.ok ? await gorevResponse.json() : {};

        const modalHtml = `
            <div class="modal-overlay" onclick="closeModal(event)">
                <div class="modal" onclick="event.stopPropagation()" style="max-width: 500px;">
                    <div class="modal-header">
                        <h3>Alt Görev Düzenle</h3>
                        <button class="modal-close" onclick="closeModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label">Ekipman Adı</label>
                            <input type="text" class="form-input" id="agEkipmanAdi" value="${gorev.ekipmanAdi || ''}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Seri No</label>
                            <input type="text" class="form-input" id="agSeriNo" value="${gorev.ekipmanSeriNo || ''}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Konum</label>
                            <input type="text" class="form-input" id="agKonum" value="${gorev.ekipmanKonum || ''}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Kapasite</label>
                            <input type="text" class="form-input" id="agKapasite" value="${gorev.ekipmanKapasite || ''}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Personel</label>
                            <select class="form-input" id="agPersonel">
                                <option value="">Seçiniz</option>
                                ${personeller.map(p => `
                                    <option value="${p.id}" ${gorev.personelId === p.id ? 'selected' : ''}>
                                        ${p.adSoyad} (${p.kategori})
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Durum</label>
                            <select class="form-input" id="agDurum">
                                <option value="BEKLIYOR" ${gorev.durum === 'BEKLIYOR' ? 'selected' : ''}>Bekliyor</option>
                                <option value="DEVAM_EDIYOR" ${gorev.durum === 'DEVAM_EDIYOR' ? 'selected' : ''}>Devam Ediyor</option>
                                <option value="TAMAMLANDI" ${gorev.durum === 'TAMAMLANDI' ? 'selected' : ''}>Tamamlandı</option>
                                <option value="RAPOR_YAZILDI" ${gorev.durum === 'RAPOR_YAZILDI' ? 'selected' : ''}>Rapor Yazıldı</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Rapor No</label>
                            <input type="text" class="form-input" id="agRaporNo" value="${gorev.raporNo || ''}">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="closeModal()">İptal</button>
                        <button class="btn btn-primary" onclick="altGorevKaydet(${gorevId})">Kaydet</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('modal-container').innerHTML = modalHtml;
    } catch (error) {
        showToast('Hata: ' + error.message, 'error');
    }
}

// Alt Görev Kaydet
async function altGorevKaydet(gorevId) {
    const personelSelect = document.getElementById('agPersonel');
    const personelId = personelSelect.value ? parseInt(personelSelect.value) : null;
    const personelAdi = personelId ? personelSelect.options[personelSelect.selectedIndex].text.split(' (')[0] : null;

    const data = {
        ekipmanAdi: document.getElementById('agEkipmanAdi').value,
        ekipmanSeriNo: document.getElementById('agSeriNo').value,
        ekipmanKonum: document.getElementById('agKonum').value,
        ekipmanKapasite: document.getElementById('agKapasite').value,
        personelId: personelId,
        personelAdi: personelAdi,
        durum: document.getElementById('agDurum').value,
        raporNo: document.getElementById('agRaporNo').value
    };

    try {
        const response = await authenticatedFetch(`/api/alt-gorevler/${gorevId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            closeModal();
            showToast('Alt görev kaydedildi', 'success');
            // Detay sayfasını yenile
            if (currentIsEmriId) {
                renderIsEmriDetay(currentIsEmriId);
            }
        } else {
            const error = await response.json();
            showToast(error.error || 'Hata oluştu', 'error');
        }
    } catch (error) {
        showToast('Hata: ' + error.message, 'error');
    }
}

function renderPersonelAtamalari(atamaList) {
    if (!atamaList || atamaList.length === 0) {
        return '<p class="text-muted">Henüz personel atanmamış</p>';
    }

    return `
        <table class="table">
            <thead>
                <tr>
                    <th>Personel</th>
                    <th>Ünvan</th>
                    <th>Görev</th>
                    <th>Atama Tarihi</th>
                    <th>İşlemler</th>
                </tr>
            </thead>
            <tbody>
                ${atamaList.map(atama => `
                    <tr>
                        <td><strong>${atama.personel?.adSoyad || '-'}</strong></td>
                        <td>${atama.personel?.unvan || '-'}</td>
                        <td>${atama.gorev || '-'}</td>
                        <td>${formatTarihTR(atama.atamaTarihi)}</td>
                        <td>
                            <button onclick="removePersonelAtama(${atama.id})" class="btn btn-sm btn-danger" title="Kaldır">
                                🗑️
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function showPersonelAtamaModal(isEmriId) {
    const modalContent = `
        <div class="modal-overlay" onclick="closeModal(event)">
            <div class="modal" onclick="event.stopPropagation()" style="max-width: 500px;">
                <div class="modal-header">
                    <h3>Personel Ata</h3>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label required">Personel Seç</label>
                        <select id="atama-personel-id" class="form-input" required>
                            <option value="">Seçiniz...</option>
                            ${personeller.filter(p => p.aktif).map(p => `
                                <option value="${p.id}">${p.adSoyad} - ${p.unvan}</option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Görev Tanımı</label>
                        <textarea id="atama-gorev" class="form-input" rows="3"></textarea>
                    </div>
                    <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                        <button onclick="closeModal()" class="btn btn-secondary">İptal</button>
                        <button onclick="savePersonelAtama(${isEmriId})" class="btn btn-primary">Ata</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('modal-container').innerHTML = modalContent;
}

async function savePersonelAtama(isEmriId) {
    const personelId = parseInt(document.getElementById('atama-personel-id').value);
    const gorev = document.getElementById('atama-gorev').value;

    if (!personelId) {
        showToast('Lütfen personel seçiniz', 'warning');
        return;
    }

    try {
        showLoading();
        const response = await authenticatedFetch(`/api/is-emirleri/${isEmriId}/personel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ personelId, gorev })
        });

        if (response.ok) {
            showToast('Personel başarıyla atandı', 'success');
            closeModal();
            // İş emri detayını yenile
            await viewIsEmri(isEmriId);
        } else {
            const error = await response.json();
            showToast('Hata: ' + error.error, 'error');
        }
    } catch (error) {
        console.error('Personel atama hatası:', error);
        showToast('Personel atanırken hata oluştu', 'error');
    } finally {
        hideLoading();
    }
}

async function removePersonelAtama(atamaId) {
    if (!confirm('Bu personel atamasını kaldırmak istediğinize emin misiniz?')) {
        return;
    }

    try {
        showLoading();
        const response = await authenticatedFetch(`/api/personel-atamalari/${atamaId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('Personel ataması kaldırıldı', 'success');
            // Sayfayı yenile
            const currentModal = document.querySelector('.modal-overlay');
            if (currentModal) {
                // Modal içindeyiz, detayı yenile
                const isEmriId = parseInt(currentModal.querySelector('button[onclick*="updateIsEmri"]').getAttribute('onclick').match(/\d+/)[0]);
                await viewIsEmri(isEmriId);
            }
        } else {
            const error = await response.json();
            showToast('Hata: ' + error.error, 'error');
        }
    } catch (error) {
        console.error('Personel atama kaldırma hatası:', error);
        showToast('Atama kaldırılırken hata oluştu', 'error');
    } finally {
        hideLoading();
    }
}

async function updateIsEmri(isEmriId) {
    const durum = document.getElementById('is-emri-durum').value;
    const notlar = document.getElementById('is-emri-notlar').value;

    try {
        showLoading();
        const response = await authenticatedFetch(`/api/is-emirleri/${isEmriId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ durum, notlar })
        });

        if (response.ok) {
            showToast('İş emri güncellendi', 'success');
            await loadIsEmirleri();
            closeModal();
        } else {
            const error = await response.json();
            showToast('Hata: ' + error.error, 'error');
        }
    } catch (error) {
        console.error('İş emri güncelleme hatası:', error);
        showToast('İş emri güncellenirken hata oluştu', 'error');
    } finally {
        hideLoading();
    }
}

async function deleteIsEmri(isEmriId) {
    if (!confirm('Bu iş emrini silmek istediğinize emin misiniz?')) {
        return;
    }

    try {
        showLoading();
        const response = await authenticatedFetch(`/api/is-emirleri/${isEmriId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('İş emri silindi', 'success');
            await loadIsEmirleri();
        } else {
            const error = await response.json();
            showToast('Hata: ' + error.error, 'error');
        }
    } catch (error) {
        console.error('İş emri silme hatası:', error);
        showToast('İş emri silinirken hata oluştu', 'error');
    } finally {
        hideLoading();
    }
}

// Kalem personel gösterimi
function renderKalemPersoneller(kalem, kalemIndex, isEmriId) {
    if (!kalem.atananPersoneller || kalem.atananPersoneller.length === 0) {
        return '<span class="text-muted" style="font-size: 11px;">Henüz personel atanmadı</span>';
    }

    return kalem.atananPersoneller.map(personelId => {
        const personel = personeller.find(p => p.id === personelId);
        if (!personel) return '';

        return `
            <div style="display: flex; align-items: center; justify-content: space-between; background: #f0f7ff; padding: 4px 8px; border-radius: 4px; font-size: 11px;">
                <span><strong>${personel.adSoyad}</strong> - ${personel.unvan}</span>
                <button
                    onclick="removeKalemPersonel(${isEmriId}, ${kalemIndex}, ${personelId})"
                    class="btn btn-sm btn-danger"
                    style="padding: 2px 6px; font-size: 10px;"
                    title="Kaldır">
                    ✕
                </button>
            </div>
        `;
    }).join('');
}

// Kaleme personel atama modalı
function showKalemPersonelModal(isEmriId, kalemIndex, hizmetAdi) {
    const modalContent = `
        <div class="modal-overlay" onclick="closeModal(event)">
            <div class="modal" onclick="event.stopPropagation()" style="max-width: 500px;">
                <div class="modal-header">
                    <h3>Personel Ata</h3>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label"><strong>İş Kalemi:</strong></label>
                        <p>${hizmetAdi}</p>
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Personel Seç</label>
                        <select id="kalem-personel-id" class="form-input" required>
                            <option value="">Seçiniz...</option>
                            ${personeller.filter(p => p.aktif).map(p => `
                                <option value="${p.id}">${p.adSoyad} - ${p.unvan}</option>
                            `).join('')}
                        </select>
                    </div>
                    <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                        <button onclick="closeModal()" class="btn btn-secondary">İptal</button>
                        <button onclick="saveKalemPersonel(${isEmriId}, ${kalemIndex})" class="btn btn-primary">Ata</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('modal-container').innerHTML = modalContent;
}

// Kaleme personel kaydet
async function saveKalemPersonel(isEmriId, kalemIndex) {
    const personelId = parseInt(document.getElementById('kalem-personel-id').value);

    if (!personelId) {
        showToast('Lütfen personel seçiniz', 'warning');
        return;
    }

    try {
        showLoading();
        const response = await authenticatedFetch(`/api/is-emirleri/${isEmriId}/kalemler/${kalemIndex}/personel`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ personelId })
        });

        if (response.ok) {
            showToast('Personel başarıyla atandı', 'success');
            closeModal();
            // İş emri detayını yenile
            await viewIsEmri(isEmriId);
        } else {
            const error = await response.json();
            showToast('Hata: ' + error.error, 'error');
        }
    } catch (error) {
        console.error('Personel atama hatası:', error);
        showToast('Personel atanırken hata oluştu', 'error');
    } finally {
        hideLoading();
    }
}

// Kalemden personel kaldır
async function removeKalemPersonel(isEmriId, kalemIndex, personelId) {
    if (!confirm('Bu personeli kalemden kaldırmak istediğinize emin misiniz?')) {
        return;
    }

    try {
        showLoading();
        const response = await authenticatedFetch(`/api/is-emirleri/${isEmriId}/kalemler/${kalemIndex}/personel/${personelId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('Personel kaldırıldı', 'success');
            // İş emri detayını yenile
            await viewIsEmri(isEmriId);
        } else {
            const error = await response.json();
            showToast('Hata: ' + error.error, 'error');
        }
    } catch (error) {
        console.error('Personel kaldırma hatası:', error);
        showToast('Personel kaldırılırken hata oluştu', 'error');
    } finally {
        hideLoading();
    }
}

// Kalem durumunu güncelle
async function updateKalemDurum(isEmriId, kalemIndex, durum) {
    try {
        showLoading();
        const response = await authenticatedFetch(`/api/is-emirleri/${isEmriId}/kalemler/${kalemIndex}/durum`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ durum })
        });

        if (response.ok) {
            const result = await response.json();
            showToast(`Kalem durumu güncellendi. İş emri durumu: ${result.isEmriDurum}`, 'success');
            // Liste ve detayı yenile
            await loadIsEmirleri();
            await viewIsEmri(isEmriId);
        } else {
            const error = await response.json();
            showToast('Hata: ' + error.error, 'error');
        }
    } catch (error) {
        console.error('Durum güncelleme hatası:', error);
        showToast('Durum güncellenirken hata oluştu', 'error');
    } finally {
        hideLoading();
    }
}

function createSertifikaFromIsEmri(isEmriId) {
    showToast('Sertifika oluşturma özelliği yakında eklenecek', 'info');
    // TODO: Sertifika oluşturma modalı açılacak
}

// ========================================
// SERTİFİKA FONKSİYONLARI
// ========================================

let sertifikalar = [];

async function loadSertifikalar() {
    try {
        const response = await authenticatedFetch('/api/sertifikalar');
        sertifikalar = await response.json();
        renderSertifikaTable();
    } catch (error) {
        console.error('Sertifika yükleme hatası:', error);
        showToast('Sertifikalar yüklenirken hata oluştu', 'error');
    }
}

function renderSertifikaTable() {
    const tbody = document.querySelector('#sertifika-table tbody');
    if (!tbody) return;

    const container = document.querySelector('#sertifika-table').parentElement;
    tbody.innerHTML = '';

    if (sertifikalar.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Henüz sertifika oluşturulmamış</td></tr>';
        // Pagination'ı temizle
        const existingPagination = container.querySelector('.pagination-container');
        if (existingPagination) existingPagination.remove();
        return;
    }

    // Pagination hesapla
    const startIndex = (currentPageSertifika - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const paginatedSertifikalar = sertifikalar.slice(startIndex, endIndex);

    paginatedSertifikalar.forEach(sertifika => {
        const musteri = musteriler.find(m => m.id === sertifika.musteriId);
        const durumClass = {
            'Taslak': 'badge-warning',
            'Onaylandı': 'badge-success',
            'Teslim Edildi': 'badge-primary'
        }[sertifika.durum] || 'badge-secondary';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${sertifika.sertifikaNo}</strong></td>
            <td>${sertifika.teklifNo}</td>
            <td>${musteri?.unvan || '-'}</td>
            <td>${sertifika.hizmetAdi}</td>
            <td>${sertifika.sertifikaTipi}</td>
            <td><span class="badge ${durumClass}">${sertifika.durum}</span></td>
            <td>${formatTarihTR(sertifika.olusturmaTarihi)}</td>
            <td>
                <div class="action-buttons">
                    <button onclick="viewSertifika(${sertifika.id})" class="btn btn-sm btn-info" title="Detaylar">
                        👁️
                    </button>
                    <button onclick="downloadSertifikaPDF(${sertifika.id})" class="btn btn-sm btn-success" title="PDF İndir">
                        📄
                    </button>
                    ${sertifika.durum === 'Taslak' ? `
                        <button onclick="deleteSertifika(${sertifika.id})" class="btn btn-sm btn-danger" title="Sil">
                            🗑️
                        </button>
                    ` : ''}
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Pagination kontrollerini ekle/güncelle
    let paginationDiv = container.querySelector('.pagination-container');
    if (!paginationDiv) {
        paginationDiv = document.createElement('div');
        paginationDiv.className = 'pagination-container';
        container.appendChild(paginationDiv);
    }
    paginationDiv.innerHTML = generatePaginationHTML(currentPageSertifika, sertifikalar.length, 'Sertifika');
}

function changePageSertifika(page) {
    currentPageSertifika = page;
    renderSertifikaTable();
    // Sayfayı en üste kaydır
    document.querySelector('#sertifika-table').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function viewSertifika(sertifikaId) {
    // Modal'ı aç ve yükleniyor göster
    document.getElementById('sertifika-detay-content').innerHTML = '<div class="text-center" style="padding: 20px;">Yükleniyor...</div>';
    document.getElementById('sertifika-detay-modal').style.display = 'block';

    try {
        const response = await authenticatedFetch(`/api/sertifikalar/${sertifikaId}`);

        if (!response.ok) {
            throw new Error('Sertifika bilgileri alınamadı');
        }

        const data = await response.json();
        const sertifika = data;
        const muayene = data.muayene;
        const musteri = data.musteri;

        const durumClass = {
            'Taslak': 'badge-warning',
            'Onaylandı': 'badge-success',
            'Teslim Edildi': 'badge-primary'
        }[sertifika.durum] || 'badge-secondary';

        const content = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                <div>
                    <div class="info-card">
                        <h3>📋 Temel Bilgiler</h3>
                        <p><strong>Sertifika No:</strong> ${sertifika.sertifikaNo}</p>
                        <p><strong>Teklif No:</strong> ${sertifika.teklifNo}</p>
                        <p><strong>Müşteri:</strong> ${musteri?.unvan || '-'}</p>
                        <p><strong>Hizmet:</strong> ${sertifika.hizmetAdi}</p>
                        <p><strong>Sertifika Tipi:</strong> ${sertifika.sertifikaTipi}</p>
                        <p><strong>Durum:</strong> <span class="badge ${durumClass}">${sertifika.durum}</span></p>
                        <p><strong>Oluşturan:</strong> ${sertifika.olusturanKullanici}</p>
                        <p><strong>Oluşturma:</strong> ${formatTarihTR(sertifika.olusturmaTarihi)}</p>
                    </div>
                </div>

                <div>
                    <div class="info-card">
                        <h3>⚙️ Durum Güncelle</h3>
                        <div style="margin-bottom: 15px;">
                            <label><strong>Durum:</strong></label>
                            <select id="sertifika-durum-${sertifikaId}" class="form-control">
                                <option value="Taslak" ${sertifika.durum === 'Taslak' ? 'selected' : ''}>Taslak</option>
                                <option value="Onaylandı" ${sertifika.durum === 'Onaylandı' ? 'selected' : ''}>Onaylandı</option>
                                <option value="Teslim Edildi" ${sertifika.durum === 'Teslim Edildi' ? 'selected' : ''}>Teslim Edildi</option>
                            </select>
                        </div>
                        <button onclick="updateSertifikaDurum(${sertifikaId})" class="btn btn-primary btn-block">
                            💾 Durum Kaydet
                        </button>

                        <hr style="margin: 20px 0;">

                        <button onclick="downloadSertifikaPDF(${sertifikaId})" class="btn btn-success btn-block">
                            📄 PDF İndir
                        </button>

                        ${sertifika.durum === 'Onaylandı' ? `
                            <button onclick="eImzayaGonder(${sertifikaId})" class="btn btn-primary btn-block" style="margin-top: 10px;">
                                ✍️ E-İmzaya Gönder
                            </button>
                        ` : ''}

                        ${sertifika.durum === 'Taslak' ? `
                            <button onclick="deleteSertifika(${sertifikaId})" class="btn btn-danger btn-block" style="margin-top: 10px;">
                                🗑️ Sertifikayı Sil
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>

            <!-- Teknik Özellikler -->
            ${Object.keys(sertifika.teknikOzellikler || {}).length > 0 ? `
                <div class="info-card">
                    <h3>🔧 Teknik Özellikler</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        ${Object.entries(sertifika.teknikOzellikler).map(([key, value]) => `
                            <div style="padding: 10px; background: #f9f9f9; border-radius: 4px;">
                                <strong>${key}:</strong> ${value}
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            <!-- Test Sonuçları -->
            ${Object.keys(sertifika.testSonuclari || {}).length > 0 ? `
                <div class="info-card" style="margin-top: 15px;">
                    <h3>📊 Test Sonuçları</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        ${Object.entries(sertifika.testSonuclari).map(([key, value]) => `
                            <div style="padding: 10px; background: #f9f9f9; border-radius: 4px;">
                                <strong>${key}:</strong> ${value}
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        `;

        document.getElementById('sertifika-detay-content').innerHTML = content;
    } catch (error) {
        console.error('Sertifika detay yükleme hatası:', error);
        showToast('Sertifika detayları yüklenirken hata oluştu', 'error');

        // Hata durumunda modal içeriğini güncelle
        document.getElementById('sertifika-detay-content').innerHTML = `
            <div style="text-align: center; padding: 20px; color: #721c24;">
                <h3>⚠️ Bir Hata Oluştu</h3>
                <p>Sertifika detayları yüklenemedi.</p>
                <p style="font-size: 0.9em; margin-top: 10px;">${error.message}</p>
                <button onclick="closeSertifikaDetayModal()" class="btn btn-secondary" style="margin-top: 15px;">Kapat</button>
            </div>
        `;
    }
}

function closeSertifikaDetayModal() {
    document.getElementById('sertifika-detay-modal').style.display = 'none';
}

async function updateSertifikaDurum(sertifikaId) {
    const durum = document.getElementById(`sertifika-durum-${sertifikaId}`).value;

    try {
        const response = await authenticatedFetch(`/api/sertifikalar/${sertifikaId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ durum })
        });

        if (response.ok) {
            showToast('Durum güncellendi', 'success');
            await loadSertifikalar();
            viewSertifika(sertifikaId);
        } else {
            const error = await response.json();
            showToast('Hata: ' + error.error, 'error');
        }
    } catch (error) {
        console.error('Durum güncelleme hatası:', error);
        showToast('Güncelleme sırasında hata oluştu', 'error');
    }
}

async function deleteSertifika(sertifikaId) {
    if (!confirm('Bu sertifikayı silmek istediğinizden emin misiniz?')) return;

    try {
        const response = await authenticatedFetch(`/api/sertifikalar/${sertifikaId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('Sertifika silindi', 'success');
            closeSertifikaDetayModal();
            await loadSertifikalar();
        } else {
            const error = await response.json();
            showToast('Hata: ' + error.error, 'error');
        }
    } catch (error) {
        console.error('Sertifika silme hatası:', error);
        showToast('Silme sırasında hata oluştu', 'error');
    }
}

function eImzayaGonder(sertifikaId) {
    // Placeholder - Gelecekte e-imza entegrasyonu
    showToast('E-imza sistemi entegre edilecek. Şu anda bu özellik aktif değil.', 'info');

    // TODO: E-imza API entegrasyonu
    console.log('E-imzaya gönderilecek sertifika ID:', sertifikaId);

    // Örnek akış:
    // 1. PDF'i al
    // 2. E-imza servisine gönder (ör: E-Tugra, Türktrust)
    // 3. İmza durumunu takip et
    // 4. İmzalanan PDF'i kaydet
}

async function downloadSertifikaWord(sertifikaId) {
    showToast('Word dosyası indiriliyor...', 'info');

    try {
        const response = await authenticatedFetch(`/api/sertifikalar/${sertifikaId}/word`);

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Sertifika_${sertifikaId}.docx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showToast('Word dosyası indirildi', 'success');
        } else {
            const error = await response.json();
            showToast('Hata: ' + error.error, 'warning');
        }
    } catch (error) {
        console.error('Word indirme hatası:', error);
        showToast('Word indirilemedi', 'error');
    }
}

async function downloadSertifikaPDF(sertifikaId) {
    showToast('PDF oluşturuluyor...', 'info');

    try {
        const response = await authenticatedFetch(`/api/sertifikalar/${sertifikaId}/pdf`);

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Sertifika_${sertifikaId}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showToast('PDF indirildi', 'success');
        } else {
            showToast('PDF oluşturulamadı', 'error');
        }
    } catch (error) {
        console.error('PDF indirme hatası:', error);
        showToast('PDF indirilemedi', 'error');
    }
}

// Global değişkenler - sertifika oluşturma için
let mevcutMuayene = null;
let mevcutHizmet = null;
let secilenSablon = null;
let filtreliSablonlar = [];

// Hizmetten sertifika oluştur (Muayene detay sayfasından çağrılacak) - ŞİMDİ MODAL AÇIYOR
async function createSertifikaFromHizmet(muayeneId, hizmetId) {
    // Muayene ve hizmet bilgilerini kaydet
    mevcutMuayene = muayeneler.find(m => m.id === muayeneId);
    if (!mevcutMuayene) {
        showToast('Muayene bulunamadı', 'error');
        return;
    }

    mevcutHizmet = mevcutMuayene.hizmetler.find(h => h.id === hizmetId);
    if (!mevcutHizmet) {
        showToast('Hizmet bulunamadı', 'error');
        return;
    }

    // Hidden inputları doldur
    document.getElementById('sertifika-muayene-id').value = muayeneId;
    document.getElementById('sertifika-hizmet-id').value = hizmetId;

    // Şablonları yükle
    await loadSertifikaSablonlari();

    // Kategori filtresini doldur
    const kategoriler = [...new Set(sertifikaSablonlari.filter(s => s.aktif).map(s => s.kategori))];
    const kategoriSelect = document.getElementById('sablon-kategori-filtre');
    kategoriSelect.innerHTML = '<option value="">Tüm Kategoriler</option>' +
        kategoriler.map(k => `<option value="${k}">${k}</option>`).join('');

    // Hizmet kategorisiyle eşleşen şablonları öne çıkar
    if (mevcutHizmet.kategori) {
        kategoriSelect.value = mevcutHizmet.kategori;
    }

    // Şablonları filtrele ve göster
    filterSablonlar();

    // Modalı aç
    document.getElementById('sablon-secim-adim').style.display = 'block';
    document.getElementById('veri-giris-adim').style.display = 'none';
    document.getElementById('sertifika-olustur-modal').style.display = 'block';
}

function closeSertifikaOlusturModal() {
    document.getElementById('sertifika-olustur-modal').style.display = 'none';
    mevcutMuayene = null;
    mevcutHizmet = null;
    secilenSablon = null;
}

function filterSablonlar() {
    const kategoriFiltre = document.getElementById('sablon-kategori-filtre').value;
    const aramaText = document.getElementById('sablon-arama').value.toLowerCase();

    filtreliSablonlar = sertifikaSablonlari.filter(s => {
        if (!s.aktif) return false;
        if (kategoriFiltre && s.kategori !== kategoriFiltre) return false;
        if (aramaText && !s.ad.toLowerCase().includes(aramaText)) return false;
        return true;
    });

    renderSablonListe();
}

function renderSablonListe() {
    const container = document.getElementById('sablon-liste');

    if (filtreliSablonlar.length === 0) {
        container.innerHTML = '<p class="text-center text-muted">Şablon bulunamadı</p>';
        return;
    }

    container.innerHTML = filtreliSablonlar.map(sablon => `
        <div class="sablon-item" onclick="sablonSec(${sablon.id})" style="
            padding: 15px;
            margin-bottom: 10px;
            border: 2px solid #ddd;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
        " onmouseover="this.style.borderColor='#2C5F8D'; this.style.background='#f8f9fa'"
           onmouseout="this.style.borderColor='#ddd'; this.style.background='white'">
            <h5 style="margin: 0 0 5px 0; color: #2C5F8D;">${sablon.ad}</h5>
            <p style="margin: 0; font-size: 12px; color: #666;">
                <span style="background: #e3f2fd; padding: 2px 8px; border-radius: 3px; margin-right: 5px;">${sablon.kategori}</span>
                ${sablon.aciklama || ''}
            </p>
            <p style="margin: 5px 0 0 0; font-size: 11px; color: #999;">
                ${sablon.teknikAlanlar.length} teknik alan, ${sablon.testAlanlar.length} test alanı
            </p>
        </div>
    `).join('');
}

function sablonSec(sablonId) {
    secilenSablon = sertifikaSablonlari.find(s => s.id === sablonId);
    if (!secilenSablon) return;

    // Adım 2'ye geç
    document.getElementById('sablon-secim-adim').style.display = 'none';
    document.getElementById('veri-giris-adim').style.display = 'block';

    document.getElementById('secili-sablon-adi').textContent = secilenSablon.ad;

    // Otomatik alanları göster
    renderOtomatikAlanlar();

    // Teknik özellik alanlarını oluştur
    renderTeknikAlanlar();

    // Test sonuç alanlarını oluştur
    renderTestAlanlar();
}

function renderOtomatikAlanlar() {
    const musteri = musteriler.find(m => m.id === mevcutMuayene.musteriId);
    const teklif = teklifler.find(t => t.id === mevcutMuayene.teklifId);

    const otomatikVeriler = {
        'Sertifika No': `CERT-${Date.now()}`,
        'Tarih': new Date().toLocaleDateString('tr-TR'),
        'Firma Ünvanı': musteri?.unvan || '-',
        'Firma Adresi': musteri?.adres || '-',
        'Teklif No': teklif?.teklifNo || '-',
        'Hizmet': mevcutHizmet.ad,
        'Muayene Tarihi': mevcutHizmet.muayeneTarihi ? new Date(mevcutHizmet.muayeneTarihi).toLocaleDateString('tr-TR') : '-',
        'Atanan Personel': mevcutHizmet.atananPersonel || '-'
    };

    document.getElementById('otomatik-alanlar-liste').innerHTML = Object.entries(otomatikVeriler)
        .map(([key, value]) => `
            <div style="display: flex; padding: 5px 0; border-bottom: 1px solid #e0e0e0;">
                <strong style="min-width: 150px;">${key}:</strong>
                <span>${value}</span>
            </div>
        `).join('');
}

function renderTeknikAlanlar() {
    const container = document.getElementById('teknik-alanlar-form');

    if (!secilenSablon.teknikAlanlar || secilenSablon.teknikAlanlar.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <h5>Teknik Özellikler</h5>
        ${secilenSablon.teknikAlanlar.map((alan, index) => `
            <div class="form-group">
                <label>${alan}:</label>
                <input type="text" class="form-input teknik-alan" data-alan="${alan}" placeholder="${alan} giriniz">
            </div>
        `).join('')}
    `;
}

function renderTestAlanlar() {
    const container = document.getElementById('test-alanlar-form');

    if (!secilenSablon.testAlanlar || secilenSablon.testAlanlar.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <h5>Test ve Deney Sonuçları</h5>
        ${secilenSablon.testAlanlar.map((alan, index) => `
            <div class="form-group">
                <label>${alan}:</label>
                <input type="text" class="form-input test-alan" data-alan="${alan}" placeholder="${alan} sonucu giriniz">
            </div>
        `).join('')}
    `;
}

function geriSablonSecim() {
    document.getElementById('sablon-secim-adim').style.display = 'block';
    document.getElementById('veri-giris-adim').style.display = 'none';
    secilenSablon = null;
}

async function sertifikaKaydet() {
    if (!secilenSablon || !mevcutMuayene || !mevcutHizmet) {
        showToast('Gerekli bilgiler eksik', 'error');
        return;
    }

    // Teknik özellikler
    const teknikOzellikler = {};
    document.querySelectorAll('.teknik-alan').forEach(input => {
        const alan = input.getAttribute('data-alan');
        teknikOzellikler[alan] = input.value.trim();
    });

    // Test sonuçları
    const testSonuclari = {};
    document.querySelectorAll('.test-alan').forEach(input => {
        const alan = input.getAttribute('data-alan');
        testSonuclari[alan] = input.value.trim();
    });

    // API'ye gönder
    try {
        showLoading();
        const response = await authenticatedFetch('/api/sertifikalar/sablon-ile-olustur', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                muayeneId: mevcutMuayene.id,
                hizmetId: mevcutHizmet.id,
                sablonId: secilenSablon.id,
                teknikOzellikler,
                testSonuclari
            })
        });

        if (response.ok) {
            const result = await response.json();
            showToast('Sertifika oluşturuldu!', 'success');
            closeSertifikaOlusturModal();
            await loadIsEmirleri();
            await loadSertifikalar();
            viewSertifika(result.sertifika.id);
        } else {
            const error = await response.json();
            showToast('Hata: ' + error.error, 'error');
        }
    } catch (error) {
        console.error('Sertifika kaydetme hatası:', error);
        showToast('Kaydetme sırasında hata oluştu', 'error');
    } finally {
        hideLoading();
    }
}

// ========================================

console.log(`
%c🏭 PERİYODİK MUAYENE YÖNETİM SİSTEMİ
%cv1.0.0 - ÖNDER MUAYENE KURULUŞU

%cMüşteri, Teklif ve Muayene Modülü
%cGeliştirici: Claude Code
%cDurum: Aktif ✅
`,
    'color: #2C5F8D; font-size: 20px; font-weight: bold;',
    'color: #FF8C42; font-size: 14px;',
    'color: #666; font-size: 12px;',
    'color: #666; font-size: 12px;',
    'color: #28a745; font-size: 12px; font-weight: bold;'
);
