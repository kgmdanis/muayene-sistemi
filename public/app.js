// ========================================
// GLOBAL DEĞİŞKENLER
// ========================================

// API base URL'i dinamik olarak belirle (localhost veya IP)
const API_BASE = window.location.origin + '/api';
let musteriler = [];
let teklifler = [];
let hizmetler = [];
let hizmetlerDuz = []; // Hizmet yönetimi için ham (düz) liste
let firmaBilgi = {};
let currentFilter = 'all';
let editingMusteri = null;
let editingTeklif = null;
let currentUser = null;
let authToken = null;

// Pagination değişkenleri
const ITEMS_PER_PAGE = 20;
const ITEMS_PER_PAGE_MUSTERI = 10; // Müşteriler için son 10
let currentPageMusteri = 1;
let currentPageTeklif = 1;
let currentPageMuayene = 1;
let currentPageSertifika = 1;
let showAllMusteriler = false; // Tüm müşterileri göster

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
    const userRole = localStorage.getItem('userRole');
    const loginType = localStorage.getItem('loginType');

    if (!authToken) {
        // Login sayfasına yönlendir
        window.location.href = '/login.html';
        return;
    }

    // Tekniker girişi için özel kontrol
    if (loginType === 'tekniker') {
        currentUser = JSON.parse(userStr || '{}');
        currentUser.role = userRole || 'tekniker';
        currentUser.kategori = localStorage.getItem('userKategori');

        // Sidebar'ı oluştur ve uygulamayı başlat
        renderSidebar();
        updateUserInfo();
        initializeApp();
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

        // Sidebar'ı oluştur
        renderSidebar();

        // Kullanıcı bilgisini göster
        updateUserInfo();

        // Uygulamayı başlat
        initializeApp();

    } catch (error) {
        console.error('Auth hatası:', error);
        // Token'ları temizle ve login'e yönlendir
        sistemdenCik();
    }
}

// Sidebar'ı role göre render et
function renderSidebar() {
    const sidebarNav = document.getElementById('sidebar-nav');
    if (!sidebarNav) return;

    const userRole = localStorage.getItem('userRole') || currentUser?.role || 'admin';

    // Admin menü öğeleri
    const adminMenuItems = [
        { icon: '🏠', text: 'Dashboard', page: 'dashboard' },
        { icon: '👥', text: 'Müşteriler', page: 'musteriler' },
        { icon: '📄', text: 'Teklifler', page: 'teklifler' },
        { icon: '📋', text: 'İş Emirleri', page: 'is-emirleri' },
        { icon: '📊', text: 'Raporlar', page: 'raporlar' },
        { icon: '🔧', text: 'Ölçüm Cihazları', page: 'olcum-cihazlari' },
        { icon: '👤', text: 'Profilim', page: 'profil' },
        { icon: '⚙️', text: 'Ayarlar', page: 'ayarlar' }
    ];

    // Tekniker menü öğeleri
    const teknikerMenuItems = [
        { icon: '✅', text: 'Görevlerim', page: 'gorevlerim' },
        { icon: '📊', text: 'Raporlar', page: 'raporlar' },
        { icon: '👤', text: 'Profilim', page: 'profil' }
    ];

    const menuItems = userRole === 'tekniker' ? teknikerMenuItems : adminMenuItems;

    sidebarNav.innerHTML = menuItems.map((item, index) => `
        <a href="#" class="nav-item ${index === 0 ? 'active' : ''}" data-page="${item.page}">
            <span class="nav-icon">${item.icon}</span>
            <span class="nav-text">${item.text}</span>
        </a>
    `).join('');
}

async function initializeApp() {
    const userRole = localStorage.getItem('userRole') || currentUser?.role || 'admin';

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
        if (ayarlarLink) {
            navContainer.insertBefore(firmaLink, ayarlarLink);
        }
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

    // Veri yükle (tekniker için sadece görevleri yükle)
    if (userRole === 'tekniker') {
        // Tekniker için görevlerim sayfasını göster
        navigateToPage('gorevlerim');
    } else {
        // Admin için tüm verileri yükle
        await loadAllData();
        // URL hash varsa o sayfaya git, yoksa dashboard
        const hash = window.location.hash.replace('#', '');
        navigateToPage(hash || 'dashboard');
    }
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

        // Yönetim ekranı için düz liste (ham alanlarla) sakla
        hizmetlerDuz = rawHizmetler;

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
                metod: hizmet.metodKapsam || hizmet.standartYonetmelik || '',
                birim: hizmet.birim,
                fiyat: parseFloat(hizmet.birimFiyat) || 0,
                sablonKodlari: hizmet.sablonKodlari || ''
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
// SAYFA YENİLE
// ========================================
async function sayfaYenile(sayfa) {
    try {
        showToast('Veriler yenileniyor...', 'info');
        if (sayfa === 'dashboard') {
            await loadDashboardStats();
        } else if (sayfa === 'musteriler') {
            await loadMusteriler();
        } else if (sayfa === 'teklifler') {
            await loadTeklifler();
        } else if (sayfa === 'is-emirleri') {
            await loadIsEmirleri();
        } else if (sayfa === 'gorevlerim') {
            await loadGorevlerim();
        } else if (sayfa === 'sertifikalar') {
            await loadSertifikalar();
        } else if (sayfa === 'raporlar') {
            await raporlariYukle();
        } else if (sayfa === 'ayarlar') {
            await loadFirmaBilgi();
            await loadPersoneller();
        }
        showToast('Veriler yenilendi', 'success');
    } catch (error) {
        console.error('Yenileme hatası:', error);
        showToast('Yenileme sırasında hata oluştu', 'error');
    }
}

// ========================================
// SAYFA NAVİGASYONU
// ========================================

function navigateToPage(page) {
    const userRole = localStorage.getItem('userRole') || currentUser?.role || 'admin';

    // Tekniker kısıtlı sayfalara giremez
    const adminOnlyPages = ['dashboard', 'musteriler', 'teklifler', 'ayarlar'];
    if (userRole === 'tekniker' && adminOnlyPages.includes(page)) {
        page = 'gorevlerim'; // Tekniker için varsayılan sayfa
    }

    // Sayfa element kontrolü
    const pageElement = document.getElementById(`page-${page}`);
    if (!pageElement) {
        console.error(`Sayfa bulunamadı: page-${page}`);
        return;
    }

    // Tüm sayfaları gizle
    document.querySelectorAll('.page-content').forEach(p => p.classList.remove('active'));

    // Tüm nav itemları deaktif et
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

    // Seçili sayfayı göster
    pageElement.classList.add('active');

    // Seçili nav item'ı aktif et
    const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (navItem) navItem.classList.add('active');

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
    } else if (page === 'olcum-cihazlari') {
        loadOlcumCihazlari();
    } else if (page === 'ayarlar') {
        renderFirmaBilgileri();
        loadEmailAyarlar();
        loadPersoneller();
        loadSertifikaSablonlari();
        loadHizmetler().then(() => renderHizmetYonetimListesi());
    } else if (page === 'gorevlerim') {
        loadGorevlerim();
    } else if (page === 'raporlar') {
        raporlariYukle();
    } else if (page === 'profil') {
        loadProfilBilgileri();
    }

    console.log(`📄 Sayfa değiştirildi: ${page}`);
}

// ========================================
// MÜŞTERİ FONKSİYONLARI
// ========================================

function renderMusteriTable() {
    const tbody = document.querySelector('#musteri-table tbody');
    const container = document.querySelector('#musteri-table').parentElement;

    // Müşterileri tarihe göre sırala (en yeni önce)
    let sortedMusteriler = [...musteriler].sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.createdAt || 0);
        const dateB = new Date(b.updatedAt || b.createdAt || 0);
        return dateB - dateA;
    });

    // Arama filtresini uygula
    let filteredMusteriler = sortedMusteriler;
    if (musteriSearchTerm) {
        filteredMusteriler = sortedMusteriler.filter(musteri => {
            return musteri.unvan.toLowerCase().includes(musteriSearchTerm) ||
                (musteri.vergiNo && musteri.vergiNo.toLowerCase().includes(musteriSearchTerm)) ||
                (musteri.telefon && musteri.telefon.toLowerCase().includes(musteriSearchTerm)) ||
                (musteri.email && musteri.email.toLowerCase().includes(musteriSearchTerm)) ||
                (musteri.yetkiliKisi && musteri.yetkiliKisi.toLowerCase().includes(musteriSearchTerm));
        });
    }

    if (filteredMusteriler.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Müşteri bulunamadı</td></tr>';
        const existingPagination = container.querySelector('.pagination-container');
        if (existingPagination) existingPagination.remove();
        return;
    }

    // Arama varsa veya tümünü göster aktifse tüm sonuçları sayfalama ile göster
    // Yoksa sadece son 10 müşteriyi göster
    const itemsPerPage = (musteriSearchTerm || showAllMusteriler) ? ITEMS_PER_PAGE : ITEMS_PER_PAGE_MUSTERI;
    const showPagination = musteriSearchTerm || showAllMusteriler || filteredMusteriler.length <= ITEMS_PER_PAGE_MUSTERI;

    let displayMusteriler;
    if (musteriSearchTerm || showAllMusteriler) {
        // Sayfalama ile göster
        const startIndex = (currentPageMusteri - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        displayMusteriler = filteredMusteriler.slice(startIndex, endIndex);
    } else {
        // Sadece son 10 müşteriyi göster
        displayMusteriler = filteredMusteriler.slice(0, ITEMS_PER_PAGE_MUSTERI);
    }

    tbody.innerHTML = displayMusteriler.map(musteri => `
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

    // Pagination veya "Tümünü Göster" butonu
    let paginationDiv = container.querySelector('.pagination-container');
    if (!paginationDiv) {
        paginationDiv = document.createElement('div');
        paginationDiv.className = 'pagination-container';
        container.appendChild(paginationDiv);
    }

    // Üstteki toggle butonunu güncelle
    const toggleBtnContainer = document.getElementById('musteri-toggle-btn');
    if (toggleBtnContainer) {
        if (filteredMusteriler.length > ITEMS_PER_PAGE_MUSTERI && !musteriSearchTerm) {
            if (showAllMusteriler) {
                toggleBtnContainer.innerHTML = `<button class="btn" style="background:#6c757d;color:#fff;white-space:nowrap;" onclick="toggleShowAllMusteriler()">📋 Son 10 Müşteri</button>`;
            } else {
                toggleBtnContainer.innerHTML = `<button class="btn" style="background:#28a745;color:#fff;white-space:nowrap;" onclick="toggleShowAllMusteriler()">📋 Tümünü Göster (${filteredMusteriler.length})</button>`;
            }
        } else {
            toggleBtnContainer.innerHTML = '';
        }
    }

    // Alt kısımda sayfalama veya bilgi
    if (musteriSearchTerm || showAllMusteriler) {
        paginationDiv.innerHTML = generatePaginationHTML(currentPageMusteri, filteredMusteriler.length, 'Musteri');
    } else if (filteredMusteriler.length > ITEMS_PER_PAGE_MUSTERI) {
        paginationDiv.innerHTML = `<div style="text-align:center;color:#666;margin-top:10px;">Son ${ITEMS_PER_PAGE_MUSTERI} müşteri gösteriliyor</div>`;
    } else {
        paginationDiv.innerHTML = '';
    }
}

function toggleShowAllMusteriler() {
    showAllMusteriler = !showAllMusteriler;
    currentPageMusteri = 1;
    renderMusteriTable();
}

function changePageMusteri(page) {
    currentPageMusteri = page;
    renderMusteriTable();
    // Sayfayı en üste kaydır
    document.querySelector('#musteri-table').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function musteriAra() {
    musteriSearchTerm = document.getElementById('musteri-arama').value.toLowerCase().trim();
    currentPageMusteri = 1;
    // Arama temizlendiğinde varsayılan görünüme dön
    if (!musteriSearchTerm) {
        showAllMusteriler = false;
    }
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
        showAllMusteriler = false; // Yeni/güncellenen müşteri en üstte görünsün
        await loadMusteriler();
    } catch (error) {
        console.error('❌ Müşteri kaydetme hatası:', error);
        closeModal();
        showAllMusteriler = false;
        await loadMusteriler();
    } finally {
        hideLoading();
    }
}

// Teklif modalından müşteri ekleme (nested modal - item 1).
// Teklif modalını bozmadan üstüne açar, kayıt sonrası dropdown'a ekleyip seçer.
function musteriEkleNested() {
    const modalHTML = `
        <div class="modal-overlay" onclick="if(event.target.classList.contains('modal-overlay'))closeSecondaryModal('musteri-ekle-modal')">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>Yeni Müşteri Ekle</h3>
                    <button class="modal-close" onclick="closeSecondaryModal('musteri-ekle-modal')">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="musteri-nested-form" onsubmit="musteriKaydetNested(event)">
                        <div class="form-group">
                            <label class="form-label required">Ünvan</label>
                            <input type="text" class="form-input" id="n-musteri-unvan" required>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Vergi No</label>
                                <input type="text" class="form-input" id="n-musteri-vergiNo">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Telefon</label>
                                <input type="text" class="form-input" id="n-musteri-telefon">
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Email</label>
                            <input type="email" class="form-input" id="n-musteri-email">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Adres</label>
                            <textarea class="form-textarea" id="n-musteri-adres"></textarea>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Yetkili Kişi</label>
                            <input type="text" class="form-input" id="n-musteri-yetkiliKisi">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Notlar</label>
                            <textarea class="form-textarea" id="n-musteri-notlar"></textarea>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeSecondaryModal('musteri-ekle-modal')">İptal</button>
                    <button class="btn btn-primary" onclick="document.getElementById('musteri-nested-form').requestSubmit()">Kaydet</button>
                </div>
            </div>
        </div>
    `;
    openSecondaryModal('musteri-ekle-modal', modalHTML);
}

async function musteriKaydetNested(event) {
    event.preventDefault();
    const musteriData = {
        unvan: document.getElementById('n-musteri-unvan').value,
        vergiNo: document.getElementById('n-musteri-vergiNo').value,
        telefon: document.getElementById('n-musteri-telefon').value,
        email: document.getElementById('n-musteri-email').value,
        adres: document.getElementById('n-musteri-adres').value,
        yetkiliKisi: document.getElementById('n-musteri-yetkiliKisi').value,
        notlar: document.getElementById('n-musteri-notlar').value
    };
    showLoading();
    try {
        const response = await authenticatedFetch(`${API_BASE}/musteriler`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(musteriData)
        });
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            showToast(result.error || 'Müşteri eklenemedi', 'error');
            return;
        }
        const yeniMusteri = await response.json();
        showToast('Müşteri eklendi ve teklife seçildi', 'success');
        closeSecondaryModal('musteri-ekle-modal');

        // Global listeyi tazele ve teklif dropdown'ına ekleyip seç
        await loadMusteriler();
        const select = document.getElementById('teklif-musteri');
        if (select && yeniMusteri && yeniMusteri.id) {
            const exists = Array.from(select.options).some(o => o.value == yeniMusteri.id);
            if (!exists) {
                const opt = document.createElement('option');
                opt.value = yeniMusteri.id;
                opt.textContent = yeniMusteri.unvan;
                select.appendChild(opt);
            }
            select.value = yeniMusteri.id;
        }
    } catch (error) {
        console.error('❌ Nested müşteri kaydetme hatası:', error);
        showToast('Müşteri eklenirken hata oluştu', 'error');
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
            'REVIZE': 'Revize Edildi',
            'ONAYLANDI': 'Onaylandı',
            'REDDEDILDI': 'Reddedildi',
            'IPTAL': 'İptal',
        };
        let durumText = durumMap[teklif.durum] || teklif.durum;
        if (teklif.durum === 'REVIZE' && teklif.revizeNo) durumText += ` (R${teklif.revizeNo})`;

        // Badge renkleri
        const badgeClass = {
            'TASLAK': 'warning',
            'GONDERILDI': 'info',
            'REVIZE': 'warning',
            'ONAYLANDI': 'success',
            'REDDEDILDI': 'danger',
            'IPTAL': 'secondary'
        }[teklif.durum] || 'primary';

        return `
            <tr>
                <td><strong>${teklif.teklifNo}</strong></td>
                <td>${formatTarihTR(teklif.teklifTarihi || teklif.createdAt)}</td>
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
                    <div class="action-buttons action-buttons-right">
                        <button class="btn btn-primary btn-small" onclick="teklifGoruntule(${teklif.id})" title="Görüntüle">👁️</button>
                        <button class="btn btn-secondary btn-small" onclick="teklifDuzenle(${teklif.id})" title="Düzenle">✏️</button>
                        <button class="btn btn-success btn-small" onclick="teklifPDFExcelFormat(${teklif.id})" title="PDF (Excel Format)">📄</button>
                        <button class="btn btn-info btn-small" onclick="teklifEmailGonder(${teklif.id})" title="E-posta Gönder">📧</button>
                        <button class="btn btn-danger btn-small" onclick="teklifSil(${teklif.id})" title="Sil">🗑️</button>
                    </div>
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
    window.location.href = '/forms/teklif-form.html?v=2';
}

function teklifDuzenle(id) {
    window.location.href = '/forms/teklif-form.html?id=' + id + '&v=2';
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
                                <div style="display: flex; gap: 8px;">
                                    <select class="form-select" id="teklif-musteri" required style="flex: 1;">
                                        <option value="">Müşteri Seçin</option>
                                        ${musteriler.map(m => `
                                            <option value="${m.id}" ${(teklif && teklif.musteriId === m.id) || (!teklif && preSelectedMusteriId === m.id) ? 'selected' : ''}>
                                                ${m.unvan}
                                            </option>
                                        `).join('')}
                                    </select>
                                    <button type="button" class="btn btn-secondary btn-small" onclick="musteriEkleNested()" title="Yeni müşteri ekle" style="white-space: nowrap;">➕ Müşteri</button>
                                </div>
                            </div>
                            <div class="form-group">
                                <label class="form-label required">Teklif Tarihi</label>
                                <input type="date" class="form-input" id="teklif-tarih" value="${teklif ? (teklif.teklifTarihi || '').substring(0, 10) : today}" required>
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
                                    <option value="Taslak" ${(!teklif || teklif.durum === 'TASLAK') ? 'selected' : ''}>Taslak</option>
                                    <option value="Gönderildi" ${teklif && teklif.durum === 'GONDERILDI' ? 'selected' : ''}>Gönderildi</option>
                                    <option value="Revize" ${teklif && teklif.durum === 'REVIZE' ? 'selected' : ''}>Revize Edildi</option>
                                    <option value="Onaylandı" ${teklif && teklif.durum === 'ONAYLANDI' ? 'selected' : ''}>Onaylandı</option>
                                    <option value="Reddedildi" ${teklif && teklif.durum === 'REDDEDILDI' ? 'selected' : ''}>Reddedildi</option>
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
                                    <label for="sahadaOnay">Onay telefon ile alınmıştır</label>
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
        teklifTarihi: document.getElementById('teklif-tarih').value,
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

            // İş emri senkron bilgisi (item 7)
            if (result._isEmriSync && result._isEmriSync.synced) {
                const s = result._isEmriSync;
                if (s.eklenen || s.silinen) {
                    showToast(`İş emri güncellendi: ${s.eklenen} eklendi, ${s.silinen} kaldırıldı${s.korunan ? `, ${s.korunan} tamamlanmış korundu` : ''}`, 'info');
                }
            }

            // Revize hatırlatması (item 8): daha önce mail atılmış teklif revize edildiyse
            if (result._revizeUyari) {
                showToast('⚠️ Bu teklif revize edildi. Daha önce mail atılmıştı — güncel teklifi tekrar mail atmayı unutmayın!', 'warning');
            }

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
    const defaultEmail = (musteri?.email && musteri.email !== '-') ? musteri.email : '';

    // Email gönderim modalı aç
    openEmailModal(teklifId, defaultEmail);
}

// Email gönderim modalı
function openEmailModal(teklifId, defaultEmail) {
    const modalHtml = `
        <div class="modal-overlay" id="email-modal-overlay">
            <div class="modal" style="max-width: 550px;">
                <div class="modal-header">
                    <h3>📧 Teklifi E-posta ile Gönder</h3>
                    <button class="modal-close" onclick="closeEmailModal()">×</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label><strong>Alıcılar</strong></label>
                        <div id="email-list-container">
                            <div class="email-row" style="display:flex;gap:8px;margin-bottom:8px;">
                                <input type="email" class="form-control email-input" value="${defaultEmail}" placeholder="ornek@email.com" style="flex:1;">
                                <button type="button" class="btn btn-danger btn-small" onclick="removeEmailRow(this)" title="Kaldır">✕</button>
                            </div>
                        </div>
                        <button type="button" class="btn btn-secondary btn-small" onclick="addEmailRow()" style="margin-top:5px;">
                            + E-posta Ekle
                        </button>
                    </div>
                    <div class="form-group">
                        <label>Ek Mesaj (Opsiyonel)</label>
                        <textarea id="email-message" class="form-control" rows="3" placeholder="Müşteriye iletmek istediğiniz özel mesaj..."></textarea>
                    </div>
                    <p style="color: #666; font-size: 12px;">
                        <strong>Not:</strong> Teklif PDF olarak tüm alıcılara gönderilecektir.
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

function addEmailRow() {
    const container = document.getElementById('email-list-container');
    const row = document.createElement('div');
    row.className = 'email-row';
    row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;';
    row.innerHTML = `
        <input type="email" class="form-control email-input" placeholder="ornek@email.com" style="flex:1;">
        <button type="button" class="btn btn-danger btn-small" onclick="removeEmailRow(this)" title="Kaldır">✕</button>
    `;
    container.appendChild(row);
    row.querySelector('input').focus();
}

function removeEmailRow(btn) {
    const container = document.getElementById('email-list-container');
    const rows = container.querySelectorAll('.email-row');
    if (rows.length > 1) {
        btn.closest('.email-row').remove();
    } else {
        // Son satırsa sadece temizle
        btn.closest('.email-row').querySelector('input').value = '';
    }
}

function closeEmailModal() {
    const modal = document.getElementById('email-modal-overlay');
    if (modal) modal.remove();
}

async function sendTeklifEmail(teklifId) {
    // Tüm email inputlarını al
    const emailInputs = document.querySelectorAll('#email-list-container .email-input');
    const emails = [];
    emailInputs.forEach(input => {
        const email = input.value.trim();
        if (email && email.includes('@')) {
            emails.push(email);
        }
    });

    if (emails.length === 0) {
        showToast('En az bir geçerli e-posta adresi girin', 'warning');
        return;
    }

    const customMessage = document.getElementById('email-message')?.value || '';

    showLoading();
    closeEmailModal();

    try {
        const response = await authenticatedFetch(`/api/teklifler/${teklifId}/send-email`, {
            method: 'POST',
            body: JSON.stringify({
                customMessage,
                emails: emails // Birden fazla email gönder
            })
        });

        const result = await response.json();

        // SADECE gerçekten gönderildiyse başarı göster (item 6 - sahte başarı düzeltildi)
        if (response.ok && result.success) {
            const sentCount = (result.results || []).filter(r => r.success).length || emails.length;
            const sentTo = result.sentTo || emails.join(', ');
            showToast(`Teklif ${sentCount} kişiye gönderildi: ${sentTo}`, 'success');
            if (result.failedTo) {
                showToast(`Gönderilemeyen: ${result.failedTo}`, 'warning');
            }
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
                <td>${formatTarihTR(teklif.teklifTarihi || teklif.createdAt)}</td>
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

    const aktifPersoneller = personeller.filter(p => p.isActive !== false);
    const pasifPersoneller = personeller.filter(p => p.isActive === false);

    // Kategori renkleri
    const kategoriRenk = {
        'Mekanik': '#3498db',
        'Elektriksel': '#e74c3c',
        'IsHijyeni': '#2ecc71'
    };

    container.innerHTML = `
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 15px 20px; border-radius: 12px; margin-bottom: 20px; display: flex; justify-content: space-around; text-align: center; color: white;">
            <div>
                <div style="font-size: 28px; font-weight: bold;">${personeller.length}</div>
                <div style="opacity: 0.9; font-size: 12px;">Toplam</div>
            </div>
            <div>
                <div style="font-size: 28px; font-weight: bold;">${aktifPersoneller.length}</div>
                <div style="opacity: 0.9; font-size: 12px;">Aktif</div>
            </div>
            <div>
                <div style="font-size: 28px; font-weight: bold;">${pasifPersoneller.length}</div>
                <div style="opacity: 0.9; font-size: 12px;">Pasif</div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;">
            ${personeller.map(personel => {
                const kategoriColor = kategoriRenk[personel.kategori] || '#6c757d';
                const isActive = personel.isActive !== false;
                return `
                <div style="background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden; ${!isActive ? 'opacity: 0.6;' : ''}">
                    <div style="background: ${kategoriColor}; color: white; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 600;">${personel.adSoyad}</span>
                        <span style="background: rgba(255,255,255,0.2); padding: 3px 10px; border-radius: 10px; font-size: 11px;">
                            ${isActive ? '✓ Aktif' : '✗ Pasif'}
                        </span>
                    </div>
                    <div style="padding: 14px 16px;">
                        <div style="font-size: 13px; color: #666; margin-bottom: 8px;">
                            <strong>${personel.unvan || '-'}</strong>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; color: #888;">
                            <div>📁 ${personel.kategori || '-'}</div>
                            <div>📧 ${personel.email || '-'}</div>
                            <div>📱 ${personel.telefon || '-'}</div>
                            <div>👤 ${personel.username || '-'}</div>
                        </div>
                        <div style="margin-top: 8px; padding: 6px 10px; background: ${personel.password ? '#e8f5e9' : '#fff3e0'}; border-radius: 4px; font-size: 11px; color: ${personel.password ? '#2e7d32' : '#e65100'};">
                            ${personel.password ? '🔑 Giriş aktif' : '⚠️ Şifre tanımlı değil'}
                        </div>
                    </div>
                    <div style="padding: 10px 16px; background: #f8f9fa; border-top: 1px solid #eee; display: flex; gap: 8px;">
                        <button class="btn btn-sm btn-primary" onclick="personelDuzenle(${personel.id})" style="flex: 1;">✏️ Düzenle</button>
                        <button class="btn btn-sm btn-outline-danger" onclick="personelSil(${personel.id}, '${personel.adSoyad}')">🗑️</button>
                    </div>
                </div>
            `}).join('')}
        </div>
    `;
}

function yeniPersonelModal() {
    document.getElementById('personel-modal-baslik').textContent = 'Yeni Personel';
    document.getElementById('personel-id').value = '';
    document.getElementById('personel-ad-soyad').value = '';
    document.getElementById('personel-kategori').value = '';
    document.getElementById('personel-unvan').value = '';
    document.getElementById('personel-meslek').value = '';
    document.getElementById('personel-email').value = '';
    document.getElementById('personel-username').value = '';
    document.getElementById('personel-sifre').value = '';
    document.getElementById('personel-sifre').required = true;
    document.getElementById('personel-sifre-label').textContent = '*';
    document.getElementById('personel-sifre-help').textContent = 'Yeni personel için şifre zorunludur';
    document.getElementById('personel-diploma-tarihi').value = '';
    document.getElementById('personel-diploma-no').value = '';
    document.getElementById('personel-ekipnet-no').value = '';
    document.getElementById('personel-telefon').value = '';
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
    document.getElementById('personel-ad-soyad').value = personel.adSoyad || '';
    document.getElementById('personel-kategori').value = personel.kategori || '';
    document.getElementById('personel-unvan').value = personel.unvan || '';
    document.getElementById('personel-meslek').value = personel.meslek || '';
    document.getElementById('personel-email').value = personel.email || '';
    document.getElementById('personel-username').value = personel.username || '';
    document.getElementById('personel-sifre').value = '';
    document.getElementById('personel-sifre').required = false;
    document.getElementById('personel-sifre-label').textContent = '(Değiştirmek için)';
    document.getElementById('personel-sifre-help').textContent = 'Boş bırakırsanız mevcut şifre korunur';
    // Diploma tarihi formatı: DB'de "08.07.2004" şeklinde saklanıyor, input için "2004-07-08" olmalı
    if (personel.diplomaTarihi) {
        const parts = personel.diplomaTarihi.split('.');
        if (parts.length === 3) {
            document.getElementById('personel-diploma-tarihi').value = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else {
            document.getElementById('personel-diploma-tarihi').value = personel.diplomaTarihi;
        }
    } else {
        document.getElementById('personel-diploma-tarihi').value = '';
    }
    document.getElementById('personel-diploma-no').value = personel.diplomaNo || '';
    document.getElementById('personel-ekipnet-no').value = personel.ekipnetNo || '';
    document.getElementById('personel-telefon').value = personel.telefon || '';
    document.getElementById('personel-aktif').checked = personel.isActive !== false;
    document.getElementById('personel-modal').style.display = 'block';
}

async function personelKaydet() {
    const id = document.getElementById('personel-id').value;
    const adSoyad = document.getElementById('personel-ad-soyad').value.trim();
    const kategori = document.getElementById('personel-kategori').value;
    const unvan = document.getElementById('personel-unvan').value.trim();
    const meslek = document.getElementById('personel-meslek').value.trim();
    const email = document.getElementById('personel-email').value.trim();
    const username = document.getElementById('personel-username').value.trim();
    const sifre = document.getElementById('personel-sifre').value;
    const diplomaTarihiInput = document.getElementById('personel-diploma-tarihi').value;
    const diplomaNo = document.getElementById('personel-diploma-no').value.trim();
    const ekipnetNo = document.getElementById('personel-ekipnet-no').value.trim();
    const telefon = document.getElementById('personel-telefon').value.trim();
    const isActive = document.getElementById('personel-aktif').checked;

    // Validasyon
    if (!adSoyad || !unvan || !kategori) {
        showToast('Ad Soyad, Kategori ve Ünvan zorunludur', 'warning');
        return;
    }

    if (!email) {
        showToast('Email zorunludur (sisteme giriş için kullanılacak)', 'warning');
        return;
    }

    // Yeni personel için şifre zorunlu
    if (!id && !sifre) {
        showToast('Yeni personel için şifre zorunludur', 'warning');
        return;
    }

    if (sifre && sifre.length < 6) {
        showToast('Şifre en az 6 karakter olmalıdır', 'warning');
        return;
    }

    // Diploma tarihi formatla (2004-07-08 -> 08.07.2004)
    let diplomaTarihi = '';
    if (diplomaTarihiInput) {
        const parts = diplomaTarihiInput.split('-');
        if (parts.length === 3) {
            diplomaTarihi = `${parts[2]}.${parts[1]}.${parts[0]}`;
        }
    }

    const personelData = {
        adSoyad,
        kategori,
        unvan,
        meslek,
        email,
        username: username || null,
        telefon,
        diplomaTarihi,
        diplomaNo,
        ekipnetNo,
        isActive
    };

    // Şifre varsa ekle
    if (sifre) {
        personelData.password = sifre;
    }

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
                                <option value="Taslak" ${teklif.durum === 'TASLAK' ? 'disabled' : ''}>Taslak</option>
                                <option value="Gönderildi" ${teklif.durum === 'GONDERILDI' ? 'disabled' : ''}>Gönderildi</option>
                                <option value="Onaylandı" ${teklif.durum === 'ONAYLANDI' ? 'disabled' : ''}>Onaylandı ✅</option>
                                <option value="Reddedildi" ${teklif.durum === 'REDDEDILDI' ? 'disabled' : ''}>Reddedildi ❌</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Not (Opsiyonel)</label>
                            <textarea class="form-textarea" id="durum-not" rows="3" placeholder="Durum değişikliği ile ilgili not ekleyebilirsiniz..."></textarea>
                        </div>

                        ${teklif.durum === 'TASLAK' ? `
                            <div class="alert alert-info">
                                <strong>💡 İpucu:</strong> Teklifi onaylamadan önce müşteri ile görüşmenizi öneririz.
                            </div>
                        ` : ''}
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

async function openHizmetEkleModal() {
    // Mevcut kategorileri al
    const kategoriler = hizmetler.map(k => k.kategori);

    // Metod/standart listesi ve rapor şablonlarını yükle (item 3 & 9)
    let metodlar = [], standartlar = [], sablonlar = [];
    try {
        const [mResp, sResp] = await Promise.all([
            authenticatedFetch('/api/hizmet-metodlar'),
            authenticatedFetch('/api/rapor-sablonu')
        ]);
        if (mResp.ok) { const d = await mResp.json(); metodlar = d.metodlar || []; standartlar = d.standartlar || []; }
        if (sResp.ok) { sablonlar = await sResp.json(); }
    } catch (e) { console.warn('Metod/şablon listesi yüklenemedi:', e); }

    const modalHTML = `
        <div class="modal-overlay" onclick="if(event.target.classList.contains('modal-overlay'))closeSecondaryModal('hizmet-ekle-modal')">
            <div class="modal" onclick="event.stopPropagation()" style="max-width: 600px;">
                <div class="modal-header">
                    <h3>Yeni Hizmet Ekle</h3>
                    <button class="modal-close" onclick="closeSecondaryModal('hizmet-ekle-modal')">&times;</button>
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
                            <input type="text" class="form-input" id="hizmet-metod" list="metod-listesi" placeholder="Listeden seç veya yeni yaz" required>
                            <datalist id="metod-listesi">
                                ${[...new Set([...metodlar, ...standartlar])].map(m => `<option value="${(m || '').replace(/"/g, '&quot;')}"></option>`).join('')}
                            </datalist>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Rapor Şablonu (ölçüm açılınca bu açılır)</label>
                            <select class="form-input" id="hizmet-sablonlar" multiple size="5" style="height:auto;">
                                ${sablonlar.map(s => `<option value="${s.sablonKodu}">${s.sablonKodu} - ${s.sablonAdi}</option>`).join('')}
                            </select>
                            <small class="text-muted">Birden fazla seçilebilir (Ctrl/Cmd ile). Tek seçilirse ölçümde direkt açılır.</small>
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
                    <button class="btn btn-secondary" onclick="closeSecondaryModal('hizmet-ekle-modal')">İptal</button>
                    <button class="btn btn-primary" onclick="document.getElementById('hizmet-ekle-form').requestSubmit()">Hizmet Ekle</button>
                </div>
            </div>
        </div>
    `;

    openSecondaryModal('hizmet-ekle-modal', modalHTML);
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

    // Seçili rapor şablonları (item 9)
    const sablonSelect = document.getElementById('hizmet-sablonlar');
    const sablonKodlari = sablonSelect
        ? Array.from(sablonSelect.selectedOptions).map(o => o.value).join(',')
        : '';

    const hizmetData = {
        kategori: kategori,
        ad: document.getElementById('hizmet-ad').value.trim(),
        metod: document.getElementById('hizmet-metod').value.trim(),
        birim: document.getElementById('hizmet-birim').value,
        fiyat: parseFloat(document.getElementById('hizmet-fiyat').value),
        sablonKodlari: sablonKodlari || null
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

            // Teklif modalındaki mevcut seçimleri koru (item 5)
            const seciliHizmetler = captureHizmetSecimi();

            // Hizmet ekleme modalını kapat (teklif modalı ayakta kalır)
            closeSecondaryModal('hizmet-ekle-modal');

            // Hizmetleri yeniden yükle
            await loadHizmetler();

            // Teklif modalındaki hizmet listesini güncelle (seçimleri koruyarak)
            const hizmetSecimiDiv = document.getElementById('hizmet-secimi');
            if (hizmetSecimiDiv) {
                hizmetSecimiDiv.innerHTML = renderHizmetSecimi(seciliHizmetler);

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

            // Ayarlar sayfasındaki hizmet yönetim listesini de tazele
            if (document.getElementById('hizmet-yonetim-listesi')) {
                renderHizmetYonetimListesi(document.getElementById('hizmet-yonetim-arama')?.value || '');
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

// Teklif modalındaki mevcut hizmet seçimlerini DOM'dan yakala (yeniden render için).
function captureHizmetSecimi() {
    const secilenler = [];
    document.querySelectorAll('#hizmet-secimi .hizmet-checkbox:checked').forEach(cb => {
        const id = parseInt(cb.getAttribute('data-hizmet-id'));
        const miktarEl = document.querySelector(`.hizmet-miktar[data-hizmet-id="${id}"]`);
        const fiyatEl = document.querySelector(`.hizmet-fiyat[data-hizmet-id="${id}"]`);
        secilenler.push({
            id,
            miktar: parseInt(miktarEl?.value) || 1,
            fiyat: parseFloat(fiyatEl?.value) || 0
        });
    });
    return secilenler;
}

// ========================================
// HİZMET YÖNETİMİ (Ayarlar sayfası - item 9)
// ========================================

function openHizmetEkleModalStandalone() {
    openHizmetEkleModal();
}

function renderHizmetYonetimListesi(filter = '') {
    const container = document.getElementById('hizmet-yonetim-listesi');
    if (!container) return;
    const f = (filter || '').toLocaleLowerCase('tr');
    const liste = (hizmetlerDuz || []).filter(h => !f || (h.ad || '').toLocaleLowerCase('tr').includes(f));
    if (liste.length === 0) {
        container.innerHTML = '<p class="text-muted">Hizmet bulunamadı</p>';
        return;
    }
    container.innerHTML = `
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
            <thead>
                <tr style="text-align:left; border-bottom:2px solid #eee;">
                    <th style="padding:8px;">Hizmet</th>
                    <th style="padding:8px;">Kategori</th>
                    <th style="padding:8px;">Rapor Şablonu</th>
                    <th style="padding:8px; text-align:right;">İşlem</th>
                </tr>
            </thead>
            <tbody>
                ${liste.map(h => {
                    const kodlar = (h.sablonKodlari || '').split(',').map(k => k.trim()).filter(Boolean);
                    const sablonRozet = kodlar.length
                        ? kodlar.map(k => `<span class="badge badge-info">${k}</span>`).join(' ')
                        : '<span class="badge badge-warning">atanmamış</span>';
                    return `
                        <tr style="border-bottom:1px solid #f0f0f0;">
                            <td style="padding:8px;"><strong>${h.ad}</strong></td>
                            <td style="padding:8px;">${h.kategori?.ad || '-'}</td>
                            <td style="padding:8px;">${sablonRozet}</td>
                            <td style="padding:8px; text-align:right;">
                                <button class="btn btn-secondary btn-small" onclick="hizmetDuzenleModal(${h.id})">✏️ Düzenle</button>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

async function hizmetDuzenleModal(id) {
    const h = (hizmetlerDuz || []).find(x => x.id === id);
    if (!h) { showToast('Hizmet bulunamadı', 'error'); return; }

    // Şablon ve metod listelerini yükle
    let sablonlar = [], metodlar = [], standartlar = [];
    try {
        const [sResp, mResp] = await Promise.all([
            authenticatedFetch('/api/rapor-sablonu'),
            authenticatedFetch('/api/hizmet-metodlar')
        ]);
        if (sResp.ok) sablonlar = await sResp.json();
        if (mResp.ok) { const d = await mResp.json(); metodlar = d.metodlar || []; standartlar = d.standartlar || []; }
    } catch (e) { console.warn('Liste yüklenemedi:', e); }

    const seciliKodlar = (h.sablonKodlari || '').split(',').map(k => k.trim()).filter(Boolean);

    const modalHTML = `
        <div class="modal-overlay" onclick="if(event.target.classList.contains('modal-overlay'))closeSecondaryModal('hizmet-duzenle-modal')">
            <div class="modal" onclick="event.stopPropagation()" style="max-width: 600px;">
                <div class="modal-header">
                    <h3>Hizmet Düzenle</h3>
                    <button class="modal-close" onclick="closeSecondaryModal('hizmet-duzenle-modal')">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="hizmet-duzenle-form" onsubmit="hizmetGuncelle(event, ${h.id})">
                        <div class="form-group">
                            <label class="form-label required">Hizmet Adı</label>
                            <input type="text" class="form-input" id="d-hizmet-ad" value="${(h.ad || '').replace(/"/g, '&quot;')}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Metod / Standart</label>
                            <input type="text" class="form-input" id="d-hizmet-metod" list="d-metod-listesi" value="${(h.metodKapsam || '').replace(/"/g, '&quot;')}">
                            <datalist id="d-metod-listesi">
                                ${[...new Set([...metodlar, ...standartlar])].map(m => `<option value="${(m || '').replace(/"/g, '&quot;')}"></option>`).join('')}
                            </datalist>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Birim</label>
                                <select class="form-input" id="d-hizmet-birim">
                                    <option value="Adet" ${h.birim === 'Adet' ? 'selected' : ''}>Adet</option>
                                    <option value="Nokta" ${h.birim === 'Nokta' ? 'selected' : ''}>Nokta</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Birim Fiyat (₺)</label>
                                <input type="number" class="form-input" id="d-hizmet-fiyat" min="0" step="0.01" value="${parseFloat(h.birimFiyat) || 0}">
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Rapor Şablonu (ölçümde açılır)</label>
                            <select class="form-input" id="d-hizmet-sablonlar" multiple size="8" style="height:auto;">
                                ${sablonlar.map(s => `<option value="${s.sablonKodu}" ${seciliKodlar.includes(s.sablonKodu) ? 'selected' : ''}>${s.sablonKodu} - ${s.sablonAdi}</option>`).join('')}
                            </select>
                            <small class="text-muted">Birden fazla seçilebilir (Ctrl/Cmd). Tek seçilirse ölçümde direkt açılır.</small>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeSecondaryModal('hizmet-duzenle-modal')">İptal</button>
                    <button class="btn btn-primary" onclick="document.getElementById('hizmet-duzenle-form').requestSubmit()">Kaydet</button>
                </div>
            </div>
        </div>
    `;
    openSecondaryModal('hizmet-duzenle-modal', modalHTML);
}

async function hizmetGuncelle(event, id) {
    event.preventDefault();
    const sablonSelect = document.getElementById('d-hizmet-sablonlar');
    const sablonKodlari = sablonSelect
        ? Array.from(sablonSelect.selectedOptions).map(o => o.value).join(',')
        : '';
    const data = {
        ad: document.getElementById('d-hizmet-ad').value.trim(),
        metod: document.getElementById('d-hizmet-metod').value.trim(),
        birim: document.getElementById('d-hizmet-birim').value,
        fiyat: parseFloat(document.getElementById('d-hizmet-fiyat').value) || 0,
        sablonKodlari: sablonKodlari || null
    };
    showLoading();
    try {
        const response = await authenticatedFetch(`${API_BASE}/hizmetler/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (response.ok && result.success) {
            showToast('Hizmet güncellendi', 'success');
            closeSecondaryModal('hizmet-duzenle-modal');
            await loadHizmetler();
            renderHizmetYonetimListesi(document.getElementById('hizmet-yonetim-arama')?.value || '');
        } else {
            showToast(result.error || 'Güncellenemedi', 'error');
        }
    } catch (error) {
        console.error('Hizmet güncelleme hatası:', error);
        showToast('Hizmet güncellenirken hata oluştu', 'error');
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

function closeModal(eventOrId) {
    // String parametre ile çağrıldıysa (modal ID)
    if (typeof eventOrId === 'string') {
        const modal = document.getElementById(eventOrId);
        if (modal) modal.remove();
        return;
    }
    // Event ile çağrıldıysa veya parametresiz
    if (!eventOrId || !eventOrId.target || eventOrId.target.classList.contains('modal-overlay')) {
        const container = document.getElementById('modal-container');
        if (container) container.innerHTML = '';
        // Body'ye eklenen overlay'leri de temizle
        document.querySelectorAll('body > .modal-overlay').forEach(el => el.remove());
    }
}

// İkincil (nested) modal: ana modalı (örn. teklif modalını) yok etmeden üstüne açar.
// modal-container'a dokunmaz, body'ye ekler. (item 1 & 5)
function openSecondaryModal(id, innerHtml) {
    const old = document.getElementById(id);
    if (old) old.remove();
    const wrapper = document.createElement('div');
    wrapper.innerHTML = innerHtml.trim();
    const overlay = wrapper.firstElementChild;
    if (!overlay) return;
    overlay.id = id;
    overlay.style.zIndex = '11000';
    document.body.appendChild(overlay);
}

function closeSecondaryModal(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
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
            if (musteriResponse.ok) {
                musteriler = await musteriResponse.json();
            }
        }

        // Personelleri de yükle (kalem personel ataması için gerekli)
        if (personeller.length === 0) {
            const personelResponse = await authenticatedFetch('/api/personeller');
            if (personelResponse.ok) {
                personeller = await personelResponse.json();
            }
        }

        const response = await authenticatedFetch(`${API_BASE}/is-emirleri`);
        if (response.ok) {
            isEmirleri = await response.json();
        }
        renderIsEmriTable();
    } catch (error) {
        console.error('İş emri yükleme hatası:', error);
        showToast('İş emirleri yüklenirken hata oluştu', 'error');
    }
}

function renderIsEmriTable() {
    const container = document.getElementById('is-emirleri-cards');
    const paginationContainer = document.getElementById('is-emirleri-pagination');
    if (!container) return;

    // Filtre uygula
    let filteredIsEmirleri = isEmirleri;
    if (currentIsEmriFilter !== 'all') {
        filteredIsEmirleri = isEmirleri.filter(ie => ie.durum === currentIsEmriFilter);
    }

    if (filteredIsEmirleri.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: #666; grid-column: 1 / -1;">
                <div style="font-size: 48px; margin-bottom: 10px;">📋</div>
                <p>Bu filtrede iş emri bulunmamaktadır</p>
            </div>
        `;
        if (paginationContainer) paginationContainer.innerHTML = '';
        return;
    }

    // Pagination hesapla
    const startIndex = (currentPageIsEmri - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const paginatedIsEmirleri = filteredIsEmirleri.slice(startIndex, endIndex);

    // Durum renkleri
    const durumColors = {
        'BEKLIYOR': { bg: '#6c757d', icon: '⏳' },
        'ATANDI': { bg: '#0d6efd', icon: '👤' },
        'SAHADA': { bg: '#fd7e14', icon: '🚀' },
        'TAMAMLANDI': { bg: '#198754', icon: '✅' },
        'RAPOR_YAZILDI': { bg: '#6f42c1', icon: '📝' },
        'TESLIM_EDILDI': { bg: '#0f5132', icon: '📦' },
        'IPTAL': { bg: '#dc3545', icon: '❌' }
    };

    const durumText = {
        'BEKLIYOR': 'Bekliyor',
        'ATANDI': 'Atandı',
        'SAHADA': 'Sahada',
        'TAMAMLANDI': 'Tamamlandı',
        'RAPOR_YAZILDI': 'Rapor Yazıldı',
        'TESLIM_EDILDI': 'Teslim Edildi',
        'IPTAL': 'İptal'
    };

    container.innerHTML = paginatedIsEmirleri.map(isEmri => {
        const musteriAdi = isEmri.customer?.unvan || '-';
        const gorevSayisi = isEmri.altGorevler?.length || 0;
        const durum = durumColors[isEmri.durum] || { bg: '#6c757d', icon: '📋' };
        const durumLabel = durumText[isEmri.durum] || isEmri.durum;

        return `
            <div class="is-emri-card" style="background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden; transition: all 0.2s;"
                 onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.12)'; this.style.transform='translateY(-2px)';"
                 onmouseout="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)'; this.style.transform='';">

                <!-- Header -->
                <div style="background: ${durum.bg}; color: white; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 600; font-size: 15px;">${isEmri.isEmriNo}</span>
                    <span style="background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 12px; font-size: 12px;">${durum.icon} ${durumLabel}</span>
                </div>

                <!-- Body -->
                <div style="padding: 16px;">
                    <div style="font-weight: 600; font-size: 14px; color: #333; margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${musteriAdi}">
                        ${musteriAdi}
                    </div>
                    <div style="display: flex; gap: 16px; font-size: 13px; color: #666;">
                        <span>📄 ${isEmri.teklif?.teklifNo || '-'}</span>
                        <span>📦 ${gorevSayisi} görev</span>
                    </div>
                </div>

                <!-- Footer -->
                <div style="padding: 12px 16px; background: #f8f9fa; border-top: 1px solid #eee; display: flex; gap: 8px;">
                    <button onclick="viewIsEmri(${isEmri.id})" class="btn btn-sm btn-primary" style="flex: 1; padding: 8px; font-size: 13px;">
                        Detay
                    </button>
                    <button onclick="deleteIsEmri(${isEmri.id})" class="btn btn-sm btn-outline-danger" style="padding: 8px 12px; font-size: 13px;" title="Sil">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Pagination
    if (paginationContainer) {
        paginationContainer.innerHTML = generatePaginationHTML(currentPageIsEmri, filteredIsEmirleri.length, 'IsEmri');
    }
}

function changePageIsEmri(page) {
    currentPageIsEmri = page;
    renderIsEmriTable();
    document.getElementById('is-emirleri-cards')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    currentIsEmriId = null;
    isEmriListeHTML = null;
    // Orijinal liste HTML yapısını geri yükle
    const mainContent = document.getElementById('page-is-emirleri');
    if (mainContent) {
        mainContent.innerHTML = getIsEmriListeHTML();
    }
    navigateToPage('is-emirleri');
}

// İş Emirleri orijinal sayfa yapısını oluştur
function getIsEmriListeHTML() {
    return `
        <div class="page-header">
            <h2>İş Emirleri</h2>
            <button class="btn btn-outline" onclick="sayfaYenile('is-emirleri')" title="Yenile">🔄 Yenile</button>
        </div>

        <!-- Filtreler -->
        <div style="display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap;">
            <button class="filter-btn active" onclick="isEmriFiltrele('all')" style="padding: 8px 16px; border-radius: 20px; border: none; cursor: pointer; font-size: 13px;">Tümü</button>
            <button class="filter-btn" onclick="isEmriFiltrele('BEKLIYOR')" style="padding: 8px 16px; border-radius: 20px; border: none; cursor: pointer; font-size: 13px;">⏳ Bekliyor</button>
            <button class="filter-btn" onclick="isEmriFiltrele('SAHADA')" style="padding: 8px 16px; border-radius: 20px; border: none; cursor: pointer; font-size: 13px;">🚀 Sahada</button>
            <button class="filter-btn" onclick="isEmriFiltrele('TAMAMLANDI')" style="padding: 8px 16px; border-radius: 20px; border: none; cursor: pointer; font-size: 13px;">✅ Tamamlandı</button>
            <button class="filter-btn" onclick="isEmriFiltrele('TESLIM_EDILDI')" style="padding: 8px 16px; border-radius: 20px; border: none; cursor: pointer; font-size: 13px;">📦 Teslim Edildi</button>
        </div>

        <!-- İş Emirleri Kartları -->
        <div id="is-emirleri-cards" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;">
            <div style="text-align: center; padding: 40px; color: #666; grid-column: 1 / -1;">Yükleniyor...</div>
        </div>

        <!-- Pagination -->
        <div id="is-emirleri-pagination" style="margin-top: 20px;"></div>
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
        // Personel listesini yükle (inline dropdown için)
        if (personeller.length === 0) {
            try {
                const pRes = await authenticatedFetch('/api/personeller');
                personeller = await pRes.json();
            } catch(e) { console.error('Personel yükleme hatası:', e); }
        }

        const response = await authenticatedFetch(`/api/is-emirleri/${id}`);
        if (!response.ok) {
            showToast('İş emri bulunamadı', 'error');
            hideLoading();
            return;
        }
        const isEmri = await response.json();

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

        const userRole = localStorage.getItem('userRole') || currentUser?.role || 'admin';
        const isTekniker = userRole === 'tekniker';

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
                ${!isTekniker ? `<div class="info-card" style="padding: 15px;">
                    <strong>Teklif No</strong><br>
                    <span style="font-size: 14px;">${isEmri.teklif?.teklifNo || '-'}</span>
                </div>` : ''}
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
                ${!isTekniker ? `<div class="info-card" style="padding: 15px;">
                    <strong>Durum Değiştir</strong><br>
                    <select class="form-input" style="width: 100%; margin-top: 5px;" onchange="isEmriDurumDegistir(${isEmri.id}, this.value)">
                        <option value="BEKLIYOR" ${isEmri.durum === 'BEKLIYOR' ? 'selected' : ''}>Bekliyor</option>
                        <option value="ATANDI" ${isEmri.durum === 'ATANDI' ? 'selected' : ''}>Atandı</option>
                        <option value="SAHADA" ${isEmri.durum === 'SAHADA' ? 'selected' : ''}>Sahada</option>
                        <option value="TAMAMLANDI" ${isEmri.durum === 'TAMAMLANDI' ? 'selected' : ''}>Tamamlandı</option>
                        <option value="RAPOR_YAZILDI" ${isEmri.durum === 'RAPOR_YAZILDI' ? 'selected' : ''}>Rapor Yazıldı</option>
                        <option value="TESLIM_EDILDI" ${isEmri.durum === 'TESLIM_EDILDI' ? 'selected' : ''}>Teslim Edildi</option>
                    </select>
                </div>` : ''}
            </div>

            <!-- Firma Bilgileri -->
            <div style="margin-bottom: 20px; padding: 15px; background: #fff; border-radius: 8px; border: 1px solid #dee2e6; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <h4 style="margin: 0 0 15px 0; color: #333; font-size: 15px;">🏢 Firma Bilgileri</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                    <div>
                        <label style="font-weight: 500; margin-bottom: 6px; display: block; font-size: 13px; color: #555;">SGK Sicil No</label>
                        <input type="text" id="sgkSicilNoInput" class="form-input"
                            placeholder="SGK Sicil No"
                            value="${isEmri.firmaBilgi?.sgkSicilNo || ''}">
                    </div>
                    <div>
                        <label style="font-weight: 500; margin-bottom: 6px; display: block; font-size: 13px; color: #555;">İSG-KATİP Sözleşme ID - 1</label>
                        <input type="text" id="isgKatipIdInput" class="form-input"
                            placeholder="İSG-KATİP Sözleşme ID 1"
                            value="${isEmri.firmaBilgi?.isgKatipId || ''}">
                    </div>
                    <div>
                        <label style="font-weight: 500; margin-bottom: 6px; display: block; font-size: 13px; color: #555;">İSG-KATİP Sözleşme ID - 2</label>
                        <input type="text" id="isgKatipId2Input" class="form-input"
                            placeholder="İSG-KATİP Sözleşme ID 2"
                            value="${isEmri.firmaBilgi?.isgKatipId2 || ''}">
                    </div>
                    <div>
                        <label style="font-weight: 500; margin-bottom: 6px; display: block; font-size: 13px; color: #555;">İSG-KATİP Sözleşme ID - 3</label>
                        <input type="text" id="isgKatipId3Input" class="form-input"
                            placeholder="İSG-KATİP Sözleşme ID 3"
                            value="${isEmri.firmaBilgi?.isgKatipId3 || ''}">
                    </div>
                    <div>
                        <label style="font-weight: 500; margin-bottom: 6px; display: block; font-size: 13px; color: #555;">İSG-KATİP Sözleşme ID - 4</label>
                        <input type="text" id="isgKatipId4Input" class="form-input"
                            placeholder="İSG-KATİP Sözleşme ID 4"
                            value="${isEmri.firmaBilgi?.isgKatipId4 || ''}">
                    </div>
                    <div style="display: flex; align-items: end;">
                        <button class="btn btn-primary" onclick="saveFirmaBilgi(${isEmri.id})" style="white-space: nowrap;">
                            💾 Kaydet
                        </button>
                    </div>
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
                                <td>${!isTekniker ? `
                                    <select class="inline-personel-select" onchange="altGorevPersonelDegistir(${gorev.id}, this)" style="padding: 3px 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; max-width: 150px; background: white; cursor: pointer;">
                                        <option value="">Atanmadı</option>
                                        ${personeller.filter(p => p.isActive !== false).map(p => `<option value="${p.id}" ${gorev.personelId === p.id ? 'selected' : ''}>${p.adSoyad}</option>`).join('')}
                                    </select>
                                ` : (gorev.personelAdi || '<span style="color:#999;">Atanmadı</span>')}</td>
                                <td>
                                    <span class="badge" style="background: ${durumRenk[gorev.durum] || '#6c757d'}; color: white; padding: 3px 6px; border-radius: 3px; font-size: 11px;">
                                        ${durumText[gorev.durum] || gorev.durum}
                                    </span>
                                </td>
                                <td>${gorev.raporNo || '-'}</td>
                                <td>
                                    <button class="btn btn-sm btn-success" onclick="olcumYap(${gorev.id}, '${gorev.hizmetAdi}')" title="Ölçüm Yap">
                                        📊 Ölçüm
                                    </button>
                                    ${!isTekniker ? `<button class="btn btn-sm btn-primary" onclick="altGorevDuzenle(${gorev.id})" title="Düzenle">
                                        ✏️
                                    </button>` : ''}
                                </td>
                            </tr>
                        `).join('') || '<tr><td colspan="7" class="text-center">Alt görev bulunmamaktadır</td></tr>'}
                    </tbody>
                </table>
            </div>

            <!-- Dosyalar & PDF Birleştirme -->
            <div style="margin-top: 20px; padding: 20px; background: #fff; border-radius: 10px; border: 1px solid #dee2e6; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h4 style="margin: 0; color: #333; font-size: 16px;">📎 Dosyalar & PDF Birleştirme</h4>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-sm" onclick="dosyaYukleModal(${isEmri.id})" style="padding: 8px 16px; background: #3498db; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                            📤 Dosya Yükle
                        </button>
                        <button class="btn btn-sm" onclick="pdfBirlestirModal(${isEmri.id})" style="padding: 8px 16px; background: #8e44ad; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                            📑 PDF Birleştir
                        </button>
                    </div>
                </div>
                <div id="isemri-dosyalar-container" style="color: #666;">Dosyalar yükleniyor...</div>
            </div>
        `;

        // Ana içerik alanını güncelle
        if (mainContent) {
            mainContent.innerHTML = content;
        }

        // Dosyaları yükle
        loadIsEmriDosyalar(id);
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
        showLoading();
        const response = await authenticatedFetch(`/api/is-emirleri/${id}/durum`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ durum })
        });

        if (response.ok) {
            showToast('Durum güncellendi', 'success');
            await renderIsEmriDetay(id);
        } else {
            const error = await response.json();
            showToast(error.error || 'Hata oluştu', 'error');
            hideLoading();
        }
    } catch (error) {
        showToast('Hata: ' + error.message, 'error');
        hideLoading();
    }
}

// Firma Bilgisi Kaydet (SGK Sicil No, İSG-KATİP ID)
async function saveFirmaBilgi(isEmriId) {
    try {
        const data = {
            sgkSicilNo: document.getElementById('sgkSicilNoInput')?.value?.trim() || '',
            isgKatipId: document.getElementById('isgKatipIdInput')?.value?.trim() || '',
            isgKatipId2: document.getElementById('isgKatipId2Input')?.value?.trim() || '',
            isgKatipId3: document.getElementById('isgKatipId3Input')?.value?.trim() || '',
            isgKatipId4: document.getElementById('isgKatipId4Input')?.value?.trim() || ''
        };

        const response = await authenticatedFetch(`/api/is-emirleri/${isEmriId}/firma-bilgi`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            showToast('Firma bilgileri kaydedildi', 'success');
        } else {
            const error = await response.json();
            showToast(error.error || 'Kaydetme hatası', 'error');
        }
    } catch (error) {
        showToast('Hata: ' + error.message, 'error');
    }
}

// ============ ÖLÇÜM ŞABLON SİSTEMİ ============

// Ölçüm Yap - Şablon seçme modalını aç
async function olcumYap(altGorevId, hizmetAdi) {
    try {
        // Bu alt görevin hizmetine bağlı rapor şablonlarını kontrol et (item 9-10).
        // Tek şablon → direkt aç, çoklu → sadece onları listele, yok → tam liste.
        try {
            const agResp = await authenticatedFetch(`/api/alt-gorevler/${altGorevId}`);
            if (agResp.ok) {
                const ag = await agResp.json();
                const kodlar = (ag.hizmet?.sablonKodlari || '')
                    .split(',').map(k => k.trim()).filter(Boolean);
                if (kodlar.length === 1) {
                    // Tek şablon: doğrudan aç
                    olcumFormuAc(altGorevId, kodlar[0]);
                    return;
                }
                if (kodlar.length > 1) {
                    // Çoklu şablon: sadece eşleşenleri seçim modalında göster
                    olcumSablonSec(altGorevId, hizmetAdi, kodlar);
                    return;
                }
            }
        } catch (e) { console.warn('Hizmet şablon kontrolü başarısız, tam liste gösteriliyor:', e); }

        // Şablon config'lerini yükle
        const response = await authenticatedFetch('/api/rapor-sablonu');
        const sablonlar = response.ok ? await response.json() : [];

        // Kategorilere göre grupla
        const kategoriler = {};
        const kategoriIcons = {
            'kaldırma iletme': '🏗️',
            'basınçlı malzemeler': '🫙',
            'iş makineleri': '🚜',
            'makine tezgahlar': '⚙️',
            'endüstriyel raf ve kapılar': '🚪',
            'elektrik': '⚡',
            'tesisat': '🔌'
        };

        sablonlar.forEach(s => {
            const kat = s.kategori || 'diğer';
            if (!kategoriler[kat]) kategoriler[kat] = [];
            kategoriler[kat].push(s);
        });

        // Özel formları en üstte göster
        const ozelFormlar = [
            { kod: 'elektrik-topraklama', ad: 'Elektrik Topraklama Raporu', icon: '⚡', arama: 'elektrik topraklama ölçüm raporu FR7.2.36' },
            { kod: 'elektrik-ic-tesisat', ad: 'Elektrik İç Tesisat Raporu', icon: '⚡', arama: 'elektrik iç tesisat ölçüm raporu FR7.2.40' },
            { kod: 'kompresor', ad: 'Kompresör Raporu', icon: '🔧', arama: 'kompresör kompresor basınç raporu' },
            { kod: 'hava-tanki', ad: 'Hava Tankı Raporu', icon: '🛢️', arama: 'hava tankı basınçlı kap raporu' }
        ];

        let kategoriHTML = `
            <div style="margin-bottom: 10px;">
                <div style="font-weight: 600; margin-bottom: 5px; color: #555; font-size: 13px; text-transform: uppercase;">📌 ÖZEL FORMLAR (${ozelFormlar.length})</div>
                <div style="display: grid; gap: 5px; padding-left: 10px;">
                    ${ozelFormlar.map(s => `
                        <button class="btn btn-outline" data-search="${s.arama}" onclick="olcumFormuAc(${altGorevId}, '${s.kod}')" style="text-align: left; padding: 10px 15px; border: 2px solid #667eea; background: #f8f9ff; cursor: pointer; font-size: 13px;">
                            ${s.icon} <strong>${s.ad}</strong>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;

        // Kategori butonlarını oluştur
        for (const [kat, items] of Object.entries(kategoriler)) {
            const icon = kategoriIcons[kat] || '📄';
            kategoriHTML += `
                <div style="margin-bottom: 10px;">
                    <div style="font-weight: 600; margin-bottom: 5px; color: #555; font-size: 13px; text-transform: uppercase;">${icon} ${kat} (${items.length})</div>
                    <div style="display: grid; gap: 5px; padding-left: 10px;">
                        ${items.map(s => `
                            <button class="btn btn-outline" onclick="olcumFormuAc(${altGorevId}, '${s.sablonKodu}')" style="text-align: left; padding: 10px 15px; border: 1px solid #ddd; background: white; cursor: pointer; font-size: 13px;">
                                <strong>${s.sablonKodu}</strong> - ${s.sablonAdi}
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // Arama kutusu + şablon listesi
        const modalHtml = `
            <div class="modal-overlay" onclick="closeModal(event)">
                <div class="modal" onclick="event.stopPropagation()" style="max-width: 700px;">
                    <div class="modal-header">
                        <h3>📊 Ölçüm Şablonu Seç</h3>
                        <button class="modal-close" onclick="closeModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p style="margin-bottom: 10px;"><strong>Hizmet:</strong> ${hizmetAdi}</p>
                        <input type="text" id="sablonArama" placeholder="Şablon ara... (örn: forklift, kompresör)"
                               oninput="sablonFiltrele(this.value)"
                               style="width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 8px; margin-bottom: 15px; font-size: 14px;">
                        <div id="sablonListesi" style="max-height: 500px; overflow-y: auto;">
                            ${kategoriHTML}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="closeModal()">Kapat</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('modal-container').innerHTML = modalHtml;

        // Arama fonksiyonu
        window._sablonlarData = sablonlar;
        window._sablonAltGorevId = altGorevId;
    } catch (error) {
        console.error('Şablon yükleme hatası:', error);
        showToast('Şablonlar yüklenemedi', 'error');
    }
}

// Şablon arama filtresi
function sablonFiltrele(term) {
    const container = document.getElementById('sablonListesi');
    const buttons = container.querySelectorAll('button');
    const sections = container.querySelectorAll(':scope > div');
    const lowerTerm = term.toLowerCase();

    sections.forEach(section => {
        const btns = section.querySelectorAll('button');
        let anyVisible = false;
        btns.forEach(btn => {
            const text = btn.textContent.toLowerCase();
            const searchData = (btn.getAttribute('data-search') || '').toLowerCase();
            const match = !term || text.includes(lowerTerm) || searchData.includes(lowerTerm);
            btn.style.display = match ? '' : 'none';
            if (match) anyVisible = true;
        });
        section.style.display = anyVisible ? '' : 'none';
    });
}

// Bir hizmete bağlı şablon kodlarından SADECE eşleşenleri seçtiren modal (item 9 - çoklu format)
function olcumSablonSec(altGorevId, hizmetAdi, kodlar) {
    const butonlar = kodlar.map(kod => `
        <button class="btn btn-outline" onclick="olcumFormuAc(${altGorevId}, '${kod}')"
                style="text-align: left; padding: 12px 15px; border: 2px solid #667eea; background: #f8f9ff; cursor: pointer; font-size: 14px; width: 100%;">
            <strong>${kod}</strong>
        </button>
    `).join('');
    const modalHtml = `
        <div class="modal-overlay" onclick="closeModal(event)">
            <div class="modal" onclick="event.stopPropagation()" style="max-width: 500px;">
                <div class="modal-header">
                    <h3>📊 Rapor Formatı Seç</h3>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 12px;"><strong>Hizmet:</strong> ${hizmetAdi}</p>
                    <p style="margin-bottom: 12px; color: #666; font-size: 13px;">Bu hizmet için birden fazla rapor formatı var. Lütfen birini seçin:</p>
                    <div style="display: grid; gap: 8px;">${butonlar}</div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeModal()">Kapat</button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('modal-container').innerHTML = modalHtml;
}

// Şablon kodunu özel form tipine eşle (özel formlar generic'ten daha zengin)
const OZEL_FORM_KOD_MAP = {
    'FR7.2.36': 'elektrik-topraklama',
    'FR7.2.40': 'elektrik-ic-tesisat',
    'FR7.2.21': 'kompresor',
    'FR7.2.156': 'hava-tanki'
};

// Ölçüm Formunu Aç
function olcumFormuAc(altGorevId, formTipi) {
    closeModal();

    // FR kodu özel bir forma karşılık geliyorsa o forma yönlendir
    if (OZEL_FORM_KOD_MAP[formTipi]) {
        formTipi = OZEL_FORM_KOD_MAP[formTipi];
    }

    // Özel formlar
    if (formTipi === 'elektrik-topraklama') {
        window.open(`/forms/elektrik-topraklama-form-v2.html?altGorevId=${altGorevId}`, '_blank');
    } else if (formTipi === 'elektrik-ic-tesisat') {
        window.open(`/forms/elektrik-ic-tesisat-form.html?altGorevId=${altGorevId}`, '_blank');
    } else if (formTipi === 'kompresor') {
        window.open(`/forms/kompresor-form.html?altGorevId=${altGorevId}`, '_blank');
    } else if (formTipi === 'hava-tanki') {
        window.open(`/forms/hava-tanki-form.html?altGorevId=${altGorevId}`, '_blank');
    } else {
        // Generic form - şablon kodu ile aç
        window.open(`/forms/generic-rapor-form.html?sablon=${formTipi}&altGorevId=${altGorevId}`, '_blank');
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
                                <option value="ATANDI" ${gorev.durum === 'ATANDI' ? 'selected' : ''}>Atandı</option>
                                <option value="SAHADA" ${gorev.durum === 'SAHADA' ? 'selected' : ''}>Sahada</option>
                                <option value="TAMAMLANDI" ${gorev.durum === 'TAMAMLANDI' ? 'selected' : ''}>Tamamlandı</option>
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

    let durum = document.getElementById('agDurum').value;

    // Personel atama mantığı:
    // - Personel atandıysa ve durum BEKLIYOR ise → ATANDI yap
    // - Personel kaldırıldıysa → BEKLIYOR yap
    if (personelId && durum === 'BEKLIYOR') {
        durum = 'ATANDI';
    } else if (!personelId && (durum === 'ATANDI' || durum === 'SAHADA')) {
        durum = 'BEKLIYOR';
    }

    const data = {
        ekipmanAdi: document.getElementById('agEkipmanAdi').value,
        personelId: personelId,
        personelAdi: personelAdi,
        durum: durum,
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

// Alt Görev Personel Inline Değiştir
async function altGorevPersonelDegistir(gorevId, selectEl) {
    const personelId = selectEl.value ? parseInt(selectEl.value) : null;
    const personelAdi = personelId ? selectEl.options[selectEl.selectedIndex].text : null;

    // Durum mantığı: personel atandıysa ATANDI, kaldırıldıysa BEKLIYOR
    let durum = personelId ? 'ATANDI' : 'BEKLIYOR';

    try {
        selectEl.disabled = true;
        selectEl.style.opacity = '0.6';
        const response = await authenticatedFetch(`/api/alt-gorevler/${gorevId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ personelId, personelAdi, durum })
        });

        if (response.ok) {
            showToast(`${personelAdi ? personelAdi + ' atandı' : 'Personel kaldırıldı'}`, 'success');
            // Durum badge'ini güncelle - sayfayı yenilemeden
            const row = selectEl.closest('tr');
            if (row) {
                const durumCell = row.querySelector('.badge');
                if (durumCell) {
                    const durumRenk = { 'BEKLIYOR': '#f39c12', 'ATANDI': '#3498db', 'SAHADA': '#9b59b6', 'TAMAMLANDI': '#27ae60', 'RAPOR_YAZILDI': '#2980b9', 'TESLIM_EDILDI': '#16a085' };
                    const durumText = { 'BEKLIYOR': 'Bekliyor', 'ATANDI': 'Atandı', 'SAHADA': 'Sahada', 'TAMAMLANDI': 'Tamamlandı', 'RAPOR_YAZILDI': 'Rapor Yazıldı', 'TESLIM_EDILDI': 'Teslim Edildi' };
                    durumCell.style.background = durumRenk[durum] || '#6c757d';
                    durumCell.textContent = durumText[durum] || durum;
                }
            }
        } else {
            const error = await response.json();
            showToast(error.error || 'Hata oluştu', 'error');
        }
    } catch (error) {
        showToast('Hata: ' + error.message, 'error');
    } finally {
        selectEl.disabled = false;
        selectEl.style.opacity = '1';
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
            showToast(`Kalem durumu güncellendi`, 'success');
            await renderIsEmriDetay(isEmriId);
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
// ===================== ÖLÇÜM CİHAZLARI =====================

async function loadOlcumCihazlari() {
    showLoading();
    try {
        const response = await authenticatedFetch('/api/olcum-cihazlari');
        const cihazlar = await response.json();
        renderOlcumCihazlari(cihazlar);
    } catch (error) {
        console.error('Ölçüm cihazları yüklenemedi:', error);
        showToast('Cihazlar yüklenemedi', 'error');
    } finally {
        hideLoading();
    }
}

async function renderOlcumCihazlari(cihazlar) {
    const bugun = new Date();

    // Kalibrasyon uyarıları
    let uyarilar = [];
    try {
        const uyariResponse = await authenticatedFetch('/api/olcum-cihazlari-kalibrasyon-uyari');
        uyarilar = await uyariResponse.json();
    } catch (e) {
        console.error('Kalibrasyon uyarıları alınamadı:', e);
    }

    let html = `
        <div class="page-header">
            <h1>🔧 Ölçüm Cihazları</h1>
            <button class="btn btn-primary" onclick="yeniCihazModal()">+ Yeni Cihaz Ekle</button>
        </div>
    `;

    // Kalibrasyon uyarı kutusu
    if (uyarilar.length > 0) {
        html += `
            <div class="alert alert-warning" style="background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <h4 style="margin: 0 0 10px 0;">⚠️ Kalibrasyon Uyarıları</h4>
                <ul style="margin: 0; padding-left: 20px;">
        `;
        uyarilar.forEach(c => {
            const gecerlilik = new Date(c.kalibrasyonGecerlilik);
            const kalanGun = Math.ceil((gecerlilik - bugun) / (1000 * 60 * 60 * 24));
            const durum = kalanGun < 0 ? '❌ SÜRESİ DOLDU' : '⚠️ ' + kalanGun + ' gün kaldı';
            html += '<li><strong>' + c.cihazAdi + '</strong> - ' + durum + '</li>';
        });
        html += '</ul></div>';
    }

    // Hatırlatma email butonu
    if (uyarilar.length > 0) {
        html += `
            <div style="margin-bottom: 15px;">
                <button class="btn btn-warning" onclick="kalibrasyonHatirlatmaGonder()" style="background:#ffc107;color:#333;">
                    📧 Kalibrasyon Hatırlatma Emaili Gönder
                </button>
            </div>
        `;
    }

    // Cihaz tablosu
    html += `
        <table class="table">
            <thead>
                <tr>
                    <th>Cihaz Adı</th>
                    <th>Marka/Model</th>
                    <th>Seri No</th>
                    <th>Kategori</th>
                    <th>Cihaz Durumu</th>
                    <th>Kalibrasyon</th>
                    <th>Geçerlilik</th>
                    <th>Kalibrasyon Durumu</th>
                    <th>İşlem</th>
                </tr>
            </thead>
            <tbody>
    `;

    if (!cihazlar || cihazlar.length === 0) {
        html += '<tr><td colspan="9" style="text-align:center;">Henüz cihaz eklenmemiş</td></tr>';
    } else {
        cihazlar.forEach(c => {
            const gecerlilik = c.kalibrasyonGecerlilik ? new Date(c.kalibrasyonGecerlilik) : null;
            const kalanGun = gecerlilik ? Math.ceil((gecerlilik - bugun) / (1000 * 60 * 60 * 24)) : null;

            // Kalibrasyon durumu badge
            let kalDurumBadge = '<span class="badge" style="background:#6c757d">Belirsiz</span>';
            if (kalanGun !== null) {
                if (kalanGun < 0) {
                    kalDurumBadge = '<span class="badge" style="background:#dc3545">Süresi Doldu</span>';
                } else if (kalanGun <= 30) {
                    kalDurumBadge = '<span class="badge" style="background:#ffc107;color:#000">' + kalanGun + ' gün</span>';
                } else {
                    kalDurumBadge = '<span class="badge" style="background:#198754">Geçerli</span>';
                }
            }

            // Cihaz durumu badge
            const durumMap = {
                'AKTIF': { text: 'Aktif', color: '#198754', icon: '✅' },
                'SERVISTE': { text: 'Serviste', color: '#17a2b8', icon: '🔧' },
                'ARIZALI': { text: 'Arızalı', color: '#dc3545', icon: '❌' },
                'PASIF': { text: 'Pasif', color: '#6c757d', icon: '⏸️' }
            };
            const cihazDurum = durumMap[c.durum] || durumMap['AKTIF'];
            const cihazDurumBadge = '<span class="badge" style="background:' + cihazDurum.color + '">' + cihazDurum.icon + ' ' + cihazDurum.text + '</span>';

            const kategoriMap = {
                'TOPRAKLAMA': 'Topraklama',
                'IZOLASYON': 'İzolasyon',
                'CEVRIM_EMPEDANS': 'Çevrim Empedans',
                'RCD_TEST': 'RCD Test',
                'TERMAL_KAMERA': 'Termal Kamera',
                'MULTIMETRE': 'Multimetre',
                'PENS_AMPERMETRE': 'Pens Ampermetre',
                'DIGER': 'Diğer'
            };

            html += `
                <tr>
                    <td><strong>${c.cihazAdi || '-'}</strong></td>
                    <td>${c.marka || ''} ${c.model || ''}</td>
                    <td>${c.seriNo || '-'}</td>
                    <td>${kategoriMap[c.kategori] || c.kategori || '-'}</td>
                    <td>${cihazDurumBadge}</td>
                    <td>${c.kalibrasyonTarihi ? new Date(c.kalibrasyonTarihi).toLocaleDateString('tr-TR') : '-'}</td>
                    <td>${gecerlilik ? gecerlilik.toLocaleDateString('tr-TR') : '-'}</td>
                    <td>${kalDurumBadge}</td>
                    <td>
                        <button class="btn btn-sm btn-info" onclick="cihazDetayModal(${c.id})" title="Detay & Geçmiş">📋</button>
                        <button class="btn btn-sm" onclick="cihazDuzenleModal(${c.id})" title="Düzenle">✏️</button>
                        <button class="btn btn-sm btn-danger" onclick="cihazSil(${c.id})" title="Sil">🗑️</button>
                    </td>
                </tr>
            `;
        });
    }

    html += '</tbody></table>';

    document.getElementById('olcum-cihazlari-content').innerHTML = html;
}

// Yeni Cihaz Modal
function yeniCihazModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'cihazModal';
    modal.style.cssText = 'display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);justify-content:center;align-items:center;z-index:10000;';
    modal.innerHTML = `
        <div class="cihaz-modal-content" style="background:#fff;border-radius:12px;width:90%;max-width:650px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);animation:modalSlide 0.3s ease;">
            <div style="background:linear-gradient(135deg,#1a5f7a,#134b61);color:#fff;padding:20px 25px;border-radius:12px 12px 0 0;display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <h2 style="margin:0;font-size:20px;font-weight:600;">🔧 Yeni Ölçüm Cihazı</h2>
                    <p style="margin:5px 0 0;font-size:13px;opacity:0.9;">Cihaz bilgilerini eksiksiz doldurun</p>
                </div>
                <button onclick="closeModal('cihazModal')" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:20px;display:flex;align-items:center;justify-content:center;transition:background 0.2s;"
                    onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">&times;</button>
            </div>
            <form id="cihazForm" onsubmit="cihazKaydet(event)" style="padding:25px;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
                    <div style="grid-column:span 2;">
                        <label style="display:block;margin-bottom:6px;font-weight:600;color:#333;font-size:14px;">
                            Cihaz Adı <span style="color:#dc3545;">*</span>
                        </label>
                        <input type="text" name="cihazAdi" required placeholder="Örn: Topraklama Ölçüm Cihazı"
                            style="width:100%;padding:12px 15px;border:2px solid #e0e0e0;border-radius:8px;font-size:14px;transition:border-color 0.2s;"
                            onfocus="this.style.borderColor='#1a5f7a'" onblur="this.style.borderColor='#e0e0e0'">
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:6px;font-weight:600;color:#333;font-size:14px;">Kategori</label>
                        <select name="kategori" style="width:100%;padding:12px 15px;border:2px solid #e0e0e0;border-radius:8px;font-size:14px;background:#fff;cursor:pointer;">
                            <option value="">-- Seçiniz --</option>
                            <option value="TOPRAKLAMA">🔌 Topraklama</option>
                            <option value="IZOLASYON">🛡️ İzolasyon</option>
                            <option value="CEVRIM_EMPEDANS">⚡ Çevrim Empedans</option>
                            <option value="RCD_TEST">🔒 RCD Test</option>
                            <option value="TERMAL_KAMERA">🌡️ Termal Kamera</option>
                            <option value="MULTIMETRE">📊 Multimetre</option>
                            <option value="PENS_AMPERMETRE">📏 Pens Ampermetre</option>
                            <option value="DIGER">📦 Diğer</option>
                        </select>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:6px;font-weight:600;color:#333;font-size:14px;">Marka</label>
                        <input type="text" name="marka" placeholder="Fluke, Megger, Chauvin Arnoux..."
                            style="width:100%;padding:12px 15px;border:2px solid #e0e0e0;border-radius:8px;font-size:14px;"
                            onfocus="this.style.borderColor='#1a5f7a'" onblur="this.style.borderColor='#e0e0e0'">
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:6px;font-weight:600;color:#333;font-size:14px;">Model</label>
                        <input type="text" name="model" placeholder="Örn: CA 6417"
                            style="width:100%;padding:12px 15px;border:2px solid #e0e0e0;border-radius:8px;font-size:14px;"
                            onfocus="this.style.borderColor='#1a5f7a'" onblur="this.style.borderColor='#e0e0e0'">
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:6px;font-weight:600;color:#333;font-size:14px;">Seri No</label>
                        <input type="text" name="seriNo" placeholder="Örn: ABC123456"
                            style="width:100%;padding:12px 15px;border:2px solid #e0e0e0;border-radius:8px;font-size:14px;"
                            onfocus="this.style.borderColor='#1a5f7a'" onblur="this.style.borderColor='#e0e0e0'">
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:6px;font-weight:600;color:#333;font-size:14px;">Durum</label>
                        <select name="durum" style="width:100%;padding:12px 15px;border:2px solid #e0e0e0;border-radius:8px;font-size:14px;background:#fff;cursor:pointer;">
                            <option value="AKTIF">✅ Aktif</option>
                            <option value="SERVISTE">🔧 Serviste</option>
                            <option value="ARIZALI">❌ Arızalı</option>
                            <option value="PASIF">⏸️ Pasif</option>
                        </select>
                    </div>
                </div>

                <div style="margin-top:25px;padding-top:20px;border-top:2px solid #f0f0f0;">
                    <h3 style="margin:0 0 15px;font-size:16px;color:#1a5f7a;display:flex;align-items:center;gap:8px;">
                        📋 Kalibrasyon Bilgileri
                    </h3>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
                        <div>
                            <label style="display:block;margin-bottom:6px;font-weight:600;color:#333;font-size:14px;">Sertifika No</label>
                            <input type="text" name="kalibrasyonNo" placeholder="Örn: 2500290"
                                style="width:100%;padding:12px 15px;border:2px solid #e0e0e0;border-radius:8px;font-size:14px;"
                                onfocus="this.style.borderColor='#1a5f7a'" onblur="this.style.borderColor='#e0e0e0'">
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:6px;font-weight:600;color:#333;font-size:14px;">Kalibrasyon Tarihi</label>
                            <input type="date" name="kalibrasyonTarihi"
                                style="width:100%;padding:12px 15px;border:2px solid #e0e0e0;border-radius:8px;font-size:14px;"
                                onfocus="this.style.borderColor='#1a5f7a'" onblur="this.style.borderColor='#e0e0e0'">
                        </div>
                        <div style="grid-column:span 2;">
                            <label style="display:block;margin-bottom:6px;font-weight:600;color:#333;font-size:14px;">
                                Geçerlilik Tarihi
                                <span style="font-weight:normal;color:#666;font-size:12px;">(Sertifika bitiş tarihi)</span>
                            </label>
                            <input type="date" name="kalibrasyonGecerlilik"
                                style="width:100%;padding:12px 15px;border:2px solid #e0e0e0;border-radius:8px;font-size:14px;"
                                onfocus="this.style.borderColor='#1a5f7a'" onblur="this.style.borderColor='#e0e0e0'">
                        </div>
                    </div>
                </div>

                <div style="margin-top:25px;padding-top:20px;border-top:2px solid #f0f0f0;">
                    <label style="display:block;margin-bottom:6px;font-weight:600;color:#333;font-size:14px;">Notlar</label>
                    <textarea name="notlar" rows="2" placeholder="Cihaz hakkında ek notlar..."
                        style="width:100%;padding:12px 15px;border:2px solid #e0e0e0;border-radius:8px;font-size:14px;resize:vertical;"
                        onfocus="this.style.borderColor='#1a5f7a'" onblur="this.style.borderColor='#e0e0e0'"></textarea>
                </div>

                <div style="margin-top:25px;padding-top:20px;border-top:2px solid #f0f0f0;display:flex;justify-content:flex-end;gap:12px;">
                    <button type="button" onclick="closeModal('cihazModal')"
                        style="padding:12px 24px;border:2px solid #e0e0e0;background:#fff;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;"
                        onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='#fff'">
                        İptal
                    </button>
                    <button type="submit"
                        style="padding:12px 30px;border:none;background:linear-gradient(135deg,#28a745,#20913c);color:#fff;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;gap:8px;"
                        onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 15px rgba(40,167,69,0.4)'"
                        onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='none'">
                        💾 Kaydet
                    </button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    // Modal dışına tıklanınca kapat
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal('cihazModal');
    });
}

// Cihaz Kaydet
async function cihazKaydet(event, id = null) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);

    const data = {
        cihazAdi: formData.get('cihazAdi'),
        kategori: formData.get('kategori') || null,
        marka: formData.get('marka') || null,
        model: formData.get('model') || null,
        seriNo: formData.get('seriNo') || null,
        durum: formData.get('durum') || 'AKTIF',
        notlar: formData.get('notlar') || null,
        kalibrasyonNo: formData.get('kalibrasyonNo') || null,
        kalibrasyonTarihi: formData.get('kalibrasyonTarihi') ? new Date(formData.get('kalibrasyonTarihi')).toISOString() : null,
        kalibrasyonGecerlilik: formData.get('kalibrasyonGecerlilik') ? new Date(formData.get('kalibrasyonGecerlilik')).toISOString() : null,
        isActive: true
    };

    const url = id ? '/api/olcum-cihazlari/' + id : '/api/olcum-cihazlari';
    const method = id ? 'PUT' : 'POST';

    try {
        showLoading();
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            closeModal('cihazModal');
            showToast(id ? 'Cihaz güncellendi' : 'Cihaz eklendi', 'success');
            loadOlcumCihazlari();
        } else {
            const error = await response.json();
            showToast('Hata: ' + error.error, 'error');
        }
    } catch (error) {
        console.error('Cihaz kaydetme hatası:', error);
        showToast('Kaydetme sırasında hata oluştu', 'error');
    } finally {
        hideLoading();
    }
}

// Cihaz Düzenle Modal
async function cihazDuzenleModal(id) {
    try {
        showLoading();
        const response = await authenticatedFetch('/api/olcum-cihazlari/' + id);
        const cihaz = await response.json();

        if (!cihaz) {
            showToast('Cihaz bulunamadı', 'error');
            return;
        }

        yeniCihazModal();

        const form = document.getElementById('cihazForm');
        document.querySelector('#cihazModal h2').textContent = '✏️ Cihaz Düzenle';
        document.querySelector('#cihazModal h2 + p').textContent = 'Cihaz bilgilerini güncelleyin';
        form.onsubmit = (e) => cihazKaydet(e, id);

        form.querySelector('[name="cihazAdi"]').value = cihaz.cihazAdi || '';
        form.querySelector('[name="kategori"]').value = cihaz.kategori || '';
        form.querySelector('[name="marka"]').value = cihaz.marka || '';
        form.querySelector('[name="model"]').value = cihaz.model || '';
        form.querySelector('[name="seriNo"]').value = cihaz.seriNo || '';
        form.querySelector('[name="durum"]').value = cihaz.durum || 'AKTIF';
        form.querySelector('[name="notlar"]').value = cihaz.notlar || '';
        form.querySelector('[name="kalibrasyonNo"]').value = cihaz.kalibrasyonNo || '';

        if (cihaz.kalibrasyonTarihi) {
            form.querySelector('[name="kalibrasyonTarihi"]').value = cihaz.kalibrasyonTarihi.split('T')[0];
        }
        if (cihaz.kalibrasyonGecerlilik) {
            form.querySelector('[name="kalibrasyonGecerlilik"]').value = cihaz.kalibrasyonGecerlilik.split('T')[0];
        }
    } catch (error) {
        console.error('Cihaz yüklenemedi:', error);
        showToast('Cihaz bilgileri alınamadı', 'error');
    } finally {
        hideLoading();
    }
}

// Cihaz Sil
async function cihazSil(id) {
    if (!confirm('Bu cihazı silmek istediğinizden emin misiniz?')) return;

    try {
        showLoading();
        const response = await authenticatedFetch('/api/olcum-cihazlari/' + id, { method: 'DELETE' });
        if (response.ok) {
            showToast('Cihaz silindi', 'success');
            loadOlcumCihazlari();
        } else {
            showToast('Silme işlemi başarısız', 'error');
        }
    } catch (error) {
        console.error('Cihaz silme hatası:', error);
        showToast('Silme sırasında hata oluştu', 'error');
    } finally {
        hideLoading();
    }
}

// Cihaz Detay Modal (Kalibrasyon Geçmişi ile)
async function cihazDetayModal(id) {
    try {
        showLoading();
        const response = await authenticatedFetch('/api/olcum-cihazlari/' + id + '/detay');
        const cihaz = await response.json();

        if (!cihaz) {
            showToast('Cihaz bulunamadı', 'error');
            return;
        }

        const durumMap = {
            'AKTIF': { text: 'Aktif', color: '#198754', icon: '✅' },
            'SERVISTE': { text: 'Serviste', color: '#17a2b8', icon: '🔧' },
            'ARIZALI': { text: 'Arızalı', color: '#dc3545', icon: '❌' },
            'PASIF': { text: 'Pasif', color: '#6c757d', icon: '⏸️' }
        };
        const cihazDurum = durumMap[cihaz.durum] || durumMap['AKTIF'];

        const gecmisHtml = cihaz.kalibrasyonGecmisi && cihaz.kalibrasyonGecmisi.length > 0
            ? cihaz.kalibrasyonGecmisi.map(g => `
                <tr>
                    <td>${new Date(g.kalibrasyonTarihi).toLocaleDateString('tr-TR')}</td>
                    <td>${new Date(g.gecerlilikTarihi).toLocaleDateString('tr-TR')}</td>
                    <td>${g.sertifikaNo || '-'}</td>
                    <td>${g.kalibrasyonYapan || '-'}</td>
                    <td>${g.maliyet ? g.maliyet + ' ₺' : '-'}</td>
                    <td>
                        ${g.sertifikaDosya ? '<a href="' + g.sertifikaDosya + '" target="_blank" class="btn btn-sm">📄</a>' : '-'}
                    </td>
                    <td>
                        <button class="btn btn-sm btn-danger" onclick="kalibrasyonGecmisiSil(${g.id}, ${id})">🗑️</button>
                    </td>
                </tr>
            `).join('')
            : '<tr><td colspan="7" style="text-align:center;color:#666;">Henüz kalibrasyon geçmişi yok</td></tr>';

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'cihazDetayModal';
        modal.style.cssText = 'display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);justify-content:center;align-items:center;z-index:10000;';
        modal.innerHTML = `
            <div style="background:#fff;border-radius:12px;width:95%;max-width:900px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                <div style="background:linear-gradient(135deg,#1a5f7a,#134b61);color:#fff;padding:20px 25px;border-radius:12px 12px 0 0;display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <h2 style="margin:0;font-size:20px;">📋 ${cihaz.cihazAdi}</h2>
                        <p style="margin:5px 0 0;font-size:13px;opacity:0.9;">${cihaz.marka || ''} ${cihaz.model || ''} | Seri: ${cihaz.seriNo || '-'}</p>
                    </div>
                    <button onclick="closeModal('cihazDetayModal')" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:20px;">&times;</button>
                </div>

                <div style="padding:25px;">
                    <!-- Cihaz Bilgileri -->
                    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:15px;margin-bottom:25px;">
                        <div style="background:#f8f9fa;padding:15px;border-radius:8px;text-align:center;">
                            <div style="font-size:12px;color:#666;margin-bottom:5px;">Durum</div>
                            <span class="badge" style="background:${cihazDurum.color};font-size:14px;padding:5px 12px;">${cihazDurum.icon} ${cihazDurum.text}</span>
                        </div>
                        <div style="background:#f8f9fa;padding:15px;border-radius:8px;text-align:center;">
                            <div style="font-size:12px;color:#666;margin-bottom:5px;">Son Kalibrasyon</div>
                            <strong>${cihaz.kalibrasyonTarihi ? new Date(cihaz.kalibrasyonTarihi).toLocaleDateString('tr-TR') : '-'}</strong>
                        </div>
                        <div style="background:#f8f9fa;padding:15px;border-radius:8px;text-align:center;">
                            <div style="font-size:12px;color:#666;margin-bottom:5px;">Geçerlilik</div>
                            <strong>${cihaz.kalibrasyonGecerlilik ? new Date(cihaz.kalibrasyonGecerlilik).toLocaleDateString('tr-TR') : '-'}</strong>
                        </div>
                        <div style="background:#f8f9fa;padding:15px;border-radius:8px;text-align:center;">
                            <div style="font-size:12px;color:#666;margin-bottom:5px;">Sertifika No</div>
                            <strong>${cihaz.kalibrasyonNo || '-'}</strong>
                        </div>
                    </div>

                    ${cihaz.notlar ? '<div style="background:#fff3cd;padding:12px;border-radius:8px;margin-bottom:20px;"><strong>Not:</strong> ' + cihaz.notlar + '</div>' : ''}

                    ${cihaz.sertifikaDosya ? '<div style="margin-bottom:20px;"><a href="' + cihaz.sertifikaDosya + '" target="_blank" class="btn btn-primary">📄 Güncel Sertifikayı Görüntüle</a></div>' : ''}

                    <!-- Kalibrasyon Geçmişi -->
                    <div style="border-top:2px solid #f0f0f0;padding-top:20px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
                            <h3 style="margin:0;color:#1a5f7a;">📜 Kalibrasyon Geçmişi</h3>
                            <button class="btn btn-success" onclick="yeniKalibrasyonModal(${id})" style="background:#28a745;">+ Yeni Kalibrasyon Ekle</button>
                        </div>
                        <table class="table" style="font-size:13px;">
                            <thead>
                                <tr style="background:#f5f5f5;">
                                    <th>Tarih</th>
                                    <th>Geçerlilik</th>
                                    <th>Sertifika No</th>
                                    <th>Yapan</th>
                                    <th>Maliyet</th>
                                    <th>Belge</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>${gecmisHtml}</tbody>
                        </table>
                    </div>
                </div>

                <div style="padding:15px 25px;background:#f5f5f5;border-radius:0 0 12px 12px;display:flex;justify-content:flex-end;">
                    <button class="btn" onclick="closeModal('cihazDetayModal')">Kapat</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal('cihazDetayModal'); });

    } catch (error) {
        console.error('Cihaz detay hatası:', error);
        showToast('Cihaz bilgileri alınamadı', 'error');
    } finally {
        hideLoading();
    }
}

// Yeni Kalibrasyon Ekle Modal
function yeniKalibrasyonModal(cihazId) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'kalibrasyonModal';
    modal.style.cssText = 'display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);justify-content:center;align-items:center;z-index:10001;';
    modal.innerHTML = `
        <div style="background:#fff;border-radius:12px;width:90%;max-width:500px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div style="background:linear-gradient(135deg,#28a745,#20913c);color:#fff;padding:20px 25px;border-radius:12px 12px 0 0;">
                <h3 style="margin:0;">📋 Yeni Kalibrasyon Kaydı</h3>
            </div>
            <form id="kalibrasyonForm" onsubmit="kalibrasyonKaydet(event, ${cihazId})" style="padding:25px;">
                <div style="display:grid;gap:15px;">
                    <div>
                        <label style="display:block;margin-bottom:6px;font-weight:600;">Kalibrasyon Tarihi *</label>
                        <input type="date" name="kalibrasyonTarihi" required style="width:100%;padding:10px;border:2px solid #e0e0e0;border-radius:6px;">
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:6px;font-weight:600;">Geçerlilik Tarihi *</label>
                        <input type="date" name="gecerlilikTarihi" required style="width:100%;padding:10px;border:2px solid #e0e0e0;border-radius:6px;">
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:6px;font-weight:600;">Sertifika No</label>
                        <input type="text" name="sertifikaNo" placeholder="Örn: 2500290" style="width:100%;padding:10px;border:2px solid #e0e0e0;border-radius:6px;">
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:6px;font-weight:600;">Kalibrasyon Yapan Kurum/Kişi</label>
                        <input type="text" name="kalibrasyonYapan" placeholder="Örn: TÜBİTAK UME" style="width:100%;padding:10px;border:2px solid #e0e0e0;border-radius:6px;">
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:6px;font-weight:600;">Maliyet (₺)</label>
                        <input type="number" name="maliyet" step="0.01" min="0" placeholder="0.00" style="width:100%;padding:10px;border:2px solid #e0e0e0;border-radius:6px;">
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:6px;font-weight:600;">Notlar</label>
                        <textarea name="notlar" rows="2" placeholder="Ek notlar..." style="width:100%;padding:10px;border:2px solid #e0e0e0;border-radius:6px;"></textarea>
                    </div>
                </div>
                <div style="margin-top:20px;display:flex;justify-content:flex-end;gap:10px;">
                    <button type="button" onclick="closeModal('kalibrasyonModal')" class="btn">İptal</button>
                    <button type="submit" class="btn btn-success">💾 Kaydet</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
}

// Kalibrasyon Kaydet
async function kalibrasyonKaydet(event, cihazId) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);

    const data = {
        kalibrasyonTarihi: formData.get('kalibrasyonTarihi'),
        gecerlilikTarihi: formData.get('gecerlilikTarihi'),
        sertifikaNo: formData.get('sertifikaNo') || null,
        kalibrasyonYapan: formData.get('kalibrasyonYapan') || null,
        maliyet: formData.get('maliyet') || null,
        notlar: formData.get('notlar') || null
    };

    try {
        showLoading();
        const response = await authenticatedFetch('/api/olcum-cihazlari/' + cihazId + '/kalibrasyon-gecmisi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            closeModal('kalibrasyonModal');
            closeModal('cihazDetayModal');
            showToast('Kalibrasyon kaydı eklendi', 'success');
            loadOlcumCihazlari();
            setTimeout(() => cihazDetayModal(cihazId), 500);
        } else {
            const error = await response.json();
            showToast('Hata: ' + error.error, 'error');
        }
    } catch (error) {
        console.error('Kalibrasyon kaydetme hatası:', error);
        showToast('Kaydetme sırasında hata oluştu', 'error');
    } finally {
        hideLoading();
    }
}

// Kalibrasyon Geçmişi Sil
async function kalibrasyonGecmisiSil(gecmisId, cihazId) {
    if (!confirm('Bu kalibrasyon kaydını silmek istediğinize emin misiniz?')) return;

    try {
        showLoading();
        const response = await authenticatedFetch('/api/kalibrasyon-gecmisi/' + gecmisId, { method: 'DELETE' });
        if (response.ok) {
            showToast('Kalibrasyon kaydı silindi', 'success');
            closeModal('cihazDetayModal');
            setTimeout(() => cihazDetayModal(cihazId), 300);
        } else {
            showToast('Silme işlemi başarısız', 'error');
        }
    } catch (error) {
        showToast('Hata oluştu', 'error');
    } finally {
        hideLoading();
    }
}

// Kalibrasyon Hatırlatma Email Gönder
async function kalibrasyonHatirlatmaGonder() {
    const email = prompt('Hatırlatma emaili gönderilecek adres:', localStorage.getItem('userEmail') || '');
    if (!email) return;

    try {
        showLoading();
        const uyariResponse = await authenticatedFetch('/api/olcum-cihazlari-kalibrasyon-uyari');
        const uyarilar = await uyariResponse.json();

        if (uyarilar.length === 0) {
            showToast('Uyarı durumunda cihaz yok', 'warning');
            return;
        }

        const cihazIds = uyarilar.map(c => c.id);

        const response = await authenticatedFetch('/api/olcum-cihazlari/kalibrasyon-hatirlatma', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cihazIds, email })
        });

        if (response.ok) {
            showToast('Hatırlatma emaili gönderildi: ' + email, 'success');
        } else {
            const error = await response.json();
            showToast('Hata: ' + error.error, 'error');
        }
    } catch (error) {
        console.error('Email gönderme hatası:', error);
        showToast('Email gönderilemedi', 'error');
    } finally {
        hideLoading();
    }
}

// ========================================
// GÖREVLERİM SAYFASI (TEKNİKER İÇİN)
// ========================================

let gorevlerimFilter = 'hepsi';
let gorevlerimPage = 1;
let gorevlerimData = [];
const GOREVLER_PER_PAGE = 12;

async function loadGorevlerim() {
    const personelId = localStorage.getItem('userId');
    if (!personelId) {
        document.getElementById('gorevlerim-list').innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666;">
                <p>Kullanıcı bilgisi bulunamadı. Lütfen tekrar giriş yapın.</p>
            </div>
        `;
        return;
    }

    try {
        showLoading();
        const url = gorevlerimFilter === 'hepsi'
            ? `${API_BASE}/personel/${personelId}/gorevler`
            : `${API_BASE}/personel/${personelId}/gorevler?durum=${gorevlerimFilter}`;

        const response = await authenticatedFetch(url);
        gorevlerimData = await response.json();
        gorevlerimPage = 1; // Filtre değişince sayfa 1'e dön

        renderGorevCards();
    } catch (error) {
        console.error('Görevler yükleme hatası:', error);
        document.getElementById('gorevlerim-list').innerHTML = `
            <div style="text-align: center; padding: 40px; color: #dc3545;">
                <p>Görevler yüklenirken hata oluştu.</p>
            </div>
        `;
    } finally {
        hideLoading();
    }
}

function renderGorevCards() {
    const container = document.getElementById('gorevlerim-list');
    const gorevler = gorevlerimData;

    if (!gorevler || gorevler.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666; grid-column: 1 / -1;">
                <p style="font-size: 48px; margin-bottom: 10px;">📋</p>
                <p>Henüz size atanmış görev bulunmamaktadır.</p>
            </div>
        `;
        return;
    }

    // İş emirlerine göre grupla
    const isEmirleriMap = {};
    gorevler.forEach(gorev => {
        const isEmriId = gorev.isEmriId;
        if (!isEmirleriMap[isEmriId]) {
            isEmirleriMap[isEmriId] = {
                isEmri: gorev.isEmri,
                gorevler: []
            };
        }
        isEmirleriMap[isEmriId].gorevler.push(gorev);
    });

    const isEmirleri = Object.values(isEmirleriMap);

    // Özet bilgi
    const summaryHtml = `
        <div style="grid-column: 1 / -1; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 20px; border-radius: 12px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div>
                <span style="font-size: 24px; font-weight: 700;">${isEmirleri.length}</span>
                <span style="margin-left: 8px; opacity: 0.9;">iş emri</span>
                <span style="margin-left: 15px; font-size: 16px;">${gorevler.length}</span>
                <span style="opacity: 0.9;">görev</span>
            </div>
            <div style="display: flex; gap: 15px; font-size: 13px;">
                <span>⏳ ${gorevler.filter(g => g.durum === 'BEKLIYOR' || g.durum === 'ATANDI').length} bekliyor</span>
                <span>🚀 ${gorevler.filter(g => g.durum === 'SAHADA').length} sahada</span>
                <span>✅ ${gorevler.filter(g => g.durum === 'TAMAMLANDI').length} tamamlandı</span>
            </div>
        </div>
    `;

    const durumRenk = {
        'BEKLIYOR': { bg: '#6c757d', text: 'Bekliyor', icon: '⏳' },
        'ATANDI': { bg: '#0d6efd', text: 'Atandı', icon: '👤' },
        'SAHADA': { bg: '#fd7e14', text: 'Sahada', icon: '🚀' },
        'TAMAMLANDI': { bg: '#198754', text: 'Tamamlandı', icon: '✅' }
    };

    // İş Emri Kartları
    const cardsHtml = isEmirleri.map(item => {
        const isEmri = item.isEmri;
        const gorevlerList = item.gorevler;
        const musteriAdi = isEmri?.customer?.unvan || '-';
        const isEmriNo = isEmri?.isEmriNo || '-';

        // İş emri durumu (en kötü duruma göre)
        const durumOncelik = { 'BEKLIYOR': 1, 'ATANDI': 2, 'SAHADA': 3, 'TAMAMLANDI': 4 };
        const enKotuDurum = gorevlerList.reduce((min, g) => {
            return durumOncelik[g.durum] < durumOncelik[min] ? g.durum : min;
        }, 'TAMAMLANDI');
        const headerColor = durumRenk[enKotuDurum]?.bg || '#6c757d';

        // Görev listesi HTML
        const gorevListHtml = gorevlerList.map(gorev => {
            const durum = durumRenk[gorev.durum] || { bg: '#6c757d', text: gorev.durum, icon: '📋' };
            return `
                <div style="display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
                    <span style="background: ${durum.bg}; color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px; white-space: nowrap;">${durum.icon} ${durum.text}</span>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${gorev.hizmetAdi}">${gorev.hizmetAdi}</div>
                        ${gorev.ekipmanAdi ? `<div style="font-size: 11px; color: #888;">🔧 ${gorev.ekipmanAdi}</div>` : ''}
                    </div>
                    <div style="display: flex; gap: 4px;">
                        ${gorev.durum === 'ATANDI' ? `<button onclick="gorevDurumDegistir(${gorev.id}, 'SAHADA'); event.stopPropagation();" class="btn btn-sm btn-warning" style="padding: 4px 8px; font-size: 11px;">🚀</button>` : ''}
                        ${gorev.durum === 'SAHADA' ? `<button onclick="gorevDurumDegistir(${gorev.id}, 'TAMAMLANDI'); event.stopPropagation();" class="btn btn-sm btn-success" style="padding: 4px 8px; font-size: 11px;">✅</button>` : ''}
                        <button onclick="gorevDetayGoster(${gorev.id}); event.stopPropagation();" class="btn btn-sm btn-outline-primary" style="padding: 4px 8px; font-size: 11px;">📝</button>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="is-emri-card" style="background: white; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.08); overflow: hidden; grid-column: 1 / -1;">
                <div style="background: ${headerColor}; color: white; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <div style="font-weight: 700; font-size: 16px;">${isEmriNo}</div>
                        <div style="opacity: 0.9; font-size: 13px; margin-top: 2px;">${musteriAdi}</div>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button onclick="navigateToPage('is-emirleri'); setTimeout(() => viewIsEmri(${isEmri?.id}), 300);" class="btn btn-sm" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3); padding: 4px 10px; font-size: 11px; border-radius: 15px;">
                            🏢 Firma Bilgi
                        </button>
                        <div style="background: rgba(255,255,255,0.2); padding: 6px 14px; border-radius: 20px; font-size: 13px;">
                            ${gorevlerList.length} görev
                        </div>
                    </div>
                </div>
                <div style="padding: 10px 18px;">
                    ${gorevListHtml}
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = summaryHtml + cardsHtml;
}

function gorevlerimSayfaDegistir(sayfa) {
    // Artık pagination yok, iş emri bazlı gruplama var
}

function gorevlerimFiltrele(durum) {
    gorevlerimFilter = durum;

    // Filtre butonlarını güncelle
    document.querySelectorAll('#page-gorevlerim .filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    loadGorevlerim();
}

async function gorevDurumDegistir(gorevId, yeniDurum) {
    try {
        showLoading();
        const response = await authenticatedFetch(`${API_BASE}/alt-gorevler/${gorevId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ durum: yeniDurum })
        });

        if (response.ok) {
            showToast(`Görev durumu güncellendi: ${yeniDurum}`, 'success');
            loadGorevlerim();
        } else {
            showToast('Durum güncellenemedi', 'error');
        }
    } catch (error) {
        console.error('Durum güncelleme hatası:', error);
        showToast('Bir hata oluştu', 'error');
    } finally {
        hideLoading();
    }
}

async function gorevDetayGoster(gorevId) {
    try {
        const response = await authenticatedFetch(`${API_BASE}/alt-gorevler/${gorevId}`);
        const gorev = await response.json();

        // Şablonları yükle
        const sablonlarRes = await authenticatedFetch(`${API_BASE}/rapor-sablonu`);
        const sablonlar = await sablonlarRes.json();

        // Özel formlar (en üstte göster)
        const ozelFormlar = [
            { kod: 'elektrik-topraklama', ad: '⚡ Elektrik Topraklama Raporu' },
            { kod: 'elektrik-ic-tesisat', ad: '⚡ Elektrik İç Tesisat Raporu' },
            { kod: 'kompresor', ad: '🔧 Kompresör Raporu' },
            { kod: 'hava-tanki', ad: '🛢️ Hava Tankı Raporu' }
        ];

        // Şablon seçeneklerini oluştur
        const ozelOptions = ozelFormlar.map(s =>
            `<option value="${s.kod}">${s.ad}</option>`
        ).join('');

        const genericOptions = sablonlar.map(s =>
            `<option value="${s.sablonKodu}">${(s.sablonKodu || '') + ' - ' + (s.sablonAdi || '')}</option>`
        ).join('');

        const sablonOptions = `
            <optgroup label="📌 Özel Formlar">
                ${ozelOptions}
            </optgroup>
            <optgroup label="📋 Genel Şablonlar">
                ${genericOptions}
            </optgroup>
        `;

        // Arama için tam listeyi sakla
        window._teknikerSablonlarOzel = ozelFormlar.map(s => ({ value: s.kod, label: s.ad, arama: (s.ad + ' ' + s.kod).toLowerCase() }));
        window._teknikerSablonlarGeneric = sablonlar.map(s => ({
            value: s.sablonKodu,
            label: (s.sablonKodu || '') + ' - ' + (s.sablonAdi || ''),
            arama: ((s.sablonKodu || '') + ' ' + (s.sablonAdi || '') + ' ' + (s.kategori || '')).toLowerCase()
        }));

        const modalHtml = `
            <div class="modal-overlay" onclick="closeModal(event)">
                <div class="modal" onclick="event.stopPropagation()" style="max-width: 550px;">
                    <div class="modal-header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                        <h3 style="color: white;">📋 Görev Detayı</h3>
                        <button class="modal-close" onclick="closeModal()" style="color: white;">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            <div class="form-group">
                                <label class="form-label" style="font-size: 12px; color: #666;">Hizmet</label>
                                <div style="padding: 8px 10px; background: #f8f9fa; border-radius: 6px; font-weight: 500;">${gorev.hizmetAdi || '-'}</div>
                            </div>
                            <div class="form-group">
                                <label class="form-label" style="font-size: 12px; color: #666;">Kategori</label>
                                <div style="padding: 8px 10px; background: #f8f9fa; border-radius: 6px;">${gorev.kategori || '-'}</div>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label" style="font-size: 12px; color: #666;">Ekipman</label>
                            <div style="padding: 8px 10px; background: #f8f9fa; border-radius: 6px;">${gorev.ekipmanAdi || '-'}</div>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            <div class="form-group">
                                <label class="form-label" style="font-size: 12px; color: #666;">Seri No</label>
                                <div style="padding: 8px 10px; background: #f8f9fa; border-radius: 6px;">${gorev.ekipmanSeriNo || '-'}</div>
                            </div>
                            <div class="form-group">
                                <label class="form-label" style="font-size: 12px; color: #666;">Konum</label>
                                <div style="padding: 8px 10px; background: #f8f9fa; border-radius: 6px;">${gorev.ekipmanKonum || '-'}</div>
                            </div>
                        </div>
                        ${gorev.notlar ? `
                        <div class="form-group">
                            <label class="form-label" style="font-size: 12px; color: #666;">Notlar</label>
                            <div style="padding: 8px 10px; background: #fff3cd; border-radius: 6px; border-left: 3px solid #ffc107;">${gorev.notlar}</div>
                        </div>
                        ` : ''}

                        <!-- Rapor Oluşturma Bölümü -->
                        <div style="margin-top: 20px; padding-top: 15px; border-top: 2px solid #eee;">
                            <h4 style="margin: 0 0 12px 0; color: #333; font-size: 14px;">📝 Rapor Oluştur</h4>
                            <div class="form-group">
                                <label class="form-label" style="font-size: 12px; color: #666;">Şablon Ara</label>
                                <input type="text" id="sablon-arama-input" class="form-input" placeholder="🔍 Şablon ara... (örn: forklift, kompresör, FR7.2.3)"
                                       oninput="teknikerSablonFiltrele(this.value)"
                                       style="width: 100%; padding: 10px; margin-bottom: 10px;">
                            </div>
                            <div class="form-group">
                                <label class="form-label" style="font-size: 12px; color: #666;">Rapor Şablonu Seçin</label>
                                <select id="sablon-secim" class="form-input" size="8" style="width: 100%; min-height: 180px;">
                                    ${sablonOptions}
                                </select>
                            </div>
                            <button onclick="raporFormAc(${gorev.id})" class="btn btn-success" style="width: 100%; padding: 12px; font-size: 15px; font-weight: 600;">
                                📄 Rapor Formunu Aç
                            </button>
                        </div>
                    </div>
                    <div class="modal-footer" style="background: #f8f9fa;">
                        <button class="btn btn-secondary" onclick="closeModal()">Kapat</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('modal-container').innerHTML = modalHtml;
    } catch (error) {
        console.error('Görev detay hatası:', error);
        showToast('Detay yüklenemedi', 'error');
    }
}

// Tekniker görev detayındaki şablon arama kutusu
function teknikerSablonFiltrele(term) {
    const select = document.getElementById('sablon-secim');
    if (!select) return;
    const lt = (term || '').toLowerCase().trim();
    const ozel = window._teknikerSablonlarOzel || [];
    const generic = window._teknikerSablonlarGeneric || [];
    const f = arr => arr.filter(s => !lt || s.arama.includes(lt));
    const ozelF = f(ozel);
    const genericF = f(generic);
    const esc = v => String(v).replace(/"/g, '&quot;');
    let html = '';
    if (ozelF.length) {
        html += '<optgroup label="📌 Özel Formlar">' + ozelF.map(s => `<option value="${esc(s.value)}">${s.label}</option>`).join('') + '</optgroup>';
    }
    if (genericF.length) {
        html += '<optgroup label="📋 Genel Şablonlar">' + genericF.map(s => `<option value="${esc(s.value)}">${s.label}</option>`).join('') + '</optgroup>';
    }
    if (!html) html = '<option value="" disabled>Sonuç yok</option>';
    select.innerHTML = html;
}

// Rapor formunu aç
function raporFormAc(altGorevId) {
    const sablonKodu = document.getElementById('sablon-secim').value;
    if (!sablonKodu) {
        showToast('Lütfen bir rapor şablonu seçin', 'warning');
        return;
    }

    let formUrl;

    // Özel formlar için yönlendirme
    if (sablonKodu === 'elektrik-topraklama') {
        formUrl = `/forms/elektrik-topraklama-form-v2.html?altGorevId=${altGorevId}`;
    } else if (sablonKodu === 'elektrik-ic-tesisat') {
        formUrl = `/forms/elektrik-ic-tesisat-form.html?altGorevId=${altGorevId}`;
    } else if (sablonKodu === 'kompresor') {
        formUrl = `/forms/kompresor-form.html?altGorevId=${altGorevId}`;
    } else if (sablonKodu === 'hava-tanki') {
        formUrl = `/forms/hava-tanki-form.html?altGorevId=${altGorevId}`;
    } else {
        // Generic rapor formunu şablon koduyla aç
        formUrl = `/forms/generic-rapor-form.html?sablon=${sablonKodu}&altGorevId=${altGorevId}`;
    }

    window.open(formUrl, '_blank');
    closeModal();
}

// ========================================
// PROFİL FONKSİYONLARI
// ========================================

async function loadProfilBilgileri() {
    const loginType = localStorage.getItem('loginType');

    try {
        let endpoint = loginType === 'tekniker' ? '/auth/personel-profile' : '/auth/profile';
        const response = await authenticatedFetch(`${API_BASE}${endpoint}`);

        if (!response.ok) {
            throw new Error('Profil bilgileri alınamadı');
        }

        const data = await response.json();

        if (loginType === 'tekniker') {
            // Tekniker profili
            document.getElementById('profil-name').value = data.adSoyad || '';
            document.getElementById('profil-email').value = data.email || '';
            document.getElementById('profil-telefon').value = data.telefon || '';
            document.getElementById('profil-role').value = data.kategori ? `Tekniker (${data.kategori})` : 'Tekniker';
        } else {
            // Admin profili
            document.getElementById('profil-name').value = data.name || '';
            document.getElementById('profil-email').value = data.email || '';
            document.getElementById('profil-telefon').value = data.telefon || '';
            document.getElementById('profil-role').value = data.role === 'admin' ? 'Yönetici' : 'Kullanıcı';
        }

        // Bildirim ayarları
        document.getElementById('email-bildirimleri').checked = data.emailNotifications !== false;
        document.getElementById('sistem-bildirimleri').checked = data.systemNotifications !== false;

        // Hesap bilgileri
        document.getElementById('profil-id').textContent = data.id || '-';
        document.getElementById('profil-son-giris').textContent = data.lastLogin
            ? new Date(data.lastLogin).toLocaleString('tr-TR')
            : '-';
        document.getElementById('profil-kayit-tarihi').textContent = data.createdAt
            ? new Date(data.createdAt).toLocaleDateString('tr-TR')
            : '-';

    } catch (error) {
        console.error('Profil yükleme hatası:', error);
        showToast('Profil bilgileri yüklenemedi', 'error');
    }
}

async function profilKaydet() {
    const loginType = localStorage.getItem('loginType');
    const name = document.getElementById('profil-name').value;
    const email = document.getElementById('profil-email').value;
    const telefon = document.getElementById('profil-telefon').value;

    if (!name) {
        showToast('Ad Soyad alanı gerekli', 'warning');
        return;
    }

    try {
        let endpoint = loginType === 'tekniker' ? '/auth/personel-profile' : '/auth/profile';
        let body = loginType === 'tekniker'
            ? { adSoyad: name, email, telefon }
            : { name, email, telefon };

        const response = await authenticatedFetch(`${API_BASE}${endpoint}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Profil güncellenemedi');
        }

        // localStorage'daki kullanıcı adını güncelle
        localStorage.setItem('userName', name);

        showToast('Profil bilgileri güncellendi', 'success');

        // Sidebar'daki kullanıcı adını güncelle
        if (currentUser) {
            currentUser.name = name;
        }

    } catch (error) {
        console.error('Profil kaydetme hatası:', error);
        showToast(error.message || 'Profil güncellenemedi', 'error');
    }
}

async function sifreDegistir() {
    const loginType = localStorage.getItem('loginType');
    const currentPassword = document.getElementById('mevcut-sifre').value;
    const newPassword = document.getElementById('yeni-sifre').value;
    const confirmPassword = document.getElementById('yeni-sifre-tekrar').value;

    if (!currentPassword || !newPassword || !confirmPassword) {
        showToast('Tüm şifre alanlarını doldurun', 'warning');
        return;
    }

    if (newPassword.length < 6) {
        showToast('Yeni şifre en az 6 karakter olmalı', 'warning');
        return;
    }

    if (newPassword !== confirmPassword) {
        showToast('Yeni şifreler eşleşmiyor', 'warning');
        return;
    }

    try {
        let endpoint = loginType === 'tekniker' ? '/auth/personel-change-password' : '/auth/change-password';

        const response = await authenticatedFetch(`${API_BASE}${endpoint}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, newPassword })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Şifre değiştirilemedi');
        }

        // Formu temizle
        document.getElementById('mevcut-sifre').value = '';
        document.getElementById('yeni-sifre').value = '';
        document.getElementById('yeni-sifre-tekrar').value = '';

        showToast('Şifreniz başarıyla değiştirildi', 'success');

    } catch (error) {
        console.error('Şifre değiştirme hatası:', error);
        showToast(error.message || 'Şifre değiştirilemedi', 'error');
    }
}

async function bildirimAyarlariKaydet() {
    const loginType = localStorage.getItem('loginType');
    const emailNotifications = document.getElementById('email-bildirimleri').checked;
    const systemNotifications = document.getElementById('sistem-bildirimleri').checked;

    try {
        let endpoint = loginType === 'tekniker'
            ? '/auth/personel-notification-settings'
            : '/auth/notification-settings';

        const response = await authenticatedFetch(`${API_BASE}${endpoint}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emailNotifications, systemNotifications })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Ayarlar güncellenemedi');
        }

        showToast('Bildirim ayarları güncellendi', 'success');

    } catch (error) {
        console.error('Bildirim ayarları hatası:', error);
        showToast(error.message || 'Ayarlar güncellenemedi', 'error');
    }
}

// ===================== RAPORLAR MODÜLÜ =====================

let tumRaporlar = [];
let filtrelenmisRaporlar = [];
let tumRaporlarGrouped = [];
let filtrelenmisGruplar = [];
let raporGorunum = 'grouped';
let acikGruplar = {};

// Raporları yükle
function raporGorunumDegistir(mode) {
    raporGorunum = mode;
    document.getElementById('rapor-view-grouped')?.classList.toggle('active', mode === 'grouped');
    document.getElementById('rapor-view-flat')?.classList.toggle('active', mode === 'flat');
    document.getElementById('rapor-accordion-container').style.display = mode === 'grouped' ? 'block' : 'none';
    document.getElementById('rapor-flat-container').style.display = mode === 'flat' ? 'block' : 'none';
    if (mode === 'grouped') {
        raporAccordionGuncelle(filtrelenmisGruplar);
    } else {
        raporTablosuGuncelle(filtrelenmisRaporlar);
    }
}

async function raporlariYukle() {
    try {
        const userRole = localStorage.getItem('userRole') || 'admin';
        const userKategori = localStorage.getItem('userKategori') || '';

        let baseUrl = `${API_BASE}/raporlar?role=${userRole}`;
        if (userRole === 'tekniker' && userKategori) {
            baseUrl += `&kategori=${encodeURIComponent(userKategori)}`;
        }

        const [flatRes, groupedRes] = await Promise.all([
            authenticatedFetch(baseUrl),
            authenticatedFetch(baseUrl + '&grouped=true')
        ]);

        if (flatRes.ok) {
            tumRaporlar = await flatRes.json();
            filtrelenmisRaporlar = [...tumRaporlar];
        }

        if (groupedRes.ok) {
            tumRaporlarGrouped = await groupedRes.json();
            filtrelenmisGruplar = [...tumRaporlarGrouped];

            const isEmriFiltre = document.getElementById('rapor-is-emri-filtre');
            if (isEmriFiltre) {
                const currentVal = isEmriFiltre.value;
                isEmriFiltre.innerHTML = '<option value="">Tüm İş Emirleri</option>';
                tumRaporlarGrouped.forEach(g => {
                    isEmriFiltre.innerHTML += `<option value="${g.isEmriNo}">${g.isEmriNo} - ${g.musteri}</option>`;
                });
                isEmriFiltre.value = currentVal;
            }
        }

        raporFiltrele();
    } catch (error) {
        console.error('Rapor yükleme hatası:', error);
        showToast('Raporlar yüklenirken hata oluştu', 'error');
        raporTablosuGuncelle([]);
        raporAccordionGuncelle([]);
    }
}

// Rapor ara
function raporAra() {
    raporFiltrele();
}

// Rapor filtrele
function raporFiltrele() {
    const aramaMetni = document.getElementById('rapor-arama')?.value?.toLowerCase() || '';
    const tipFiltre = document.getElementById('rapor-tipi-filtre')?.value || '';
    const durumFiltre = document.getElementById('rapor-durum-filtre')?.value || '';
    const isEmriFiltreDeger = document.getElementById('rapor-is-emri-filtre')?.value || '';

    // Flat filtre
    filtrelenmisRaporlar = tumRaporlar.filter(rapor => {
        const aramaUygun = !aramaMetni ||
            rapor.raporNo?.toLowerCase().includes(aramaMetni) ||
            rapor.firmaAdi?.toLowerCase().includes(aramaMetni) ||
            rapor.isEmriNo?.toLowerCase().includes(aramaMetni);
        const tipUygun = !tipFiltre || rapor.raporTipi?.toLowerCase().includes(tipFiltre.replace('-', ' '));
        const durumUygun = !durumFiltre || rapor.durum === durumFiltre;
        const isEmriUygun = !isEmriFiltreDeger || rapor.isEmriNo === isEmriFiltreDeger;
        return aramaUygun && tipUygun && durumUygun && isEmriUygun;
    });

    // Grouped filtre
    filtrelenmisGruplar = tumRaporlarGrouped.filter(grup => {
        const isEmriUygun = !isEmriFiltreDeger || grup.isEmriNo === isEmriFiltreDeger;
        const aramaGrupUygun = !aramaMetni ||
            grup.isEmriNo?.toLowerCase().includes(aramaMetni) ||
            grup.musteri?.toLowerCase().includes(aramaMetni) ||
            grup.raporlar.some(r => r.raporNo?.toLowerCase().includes(aramaMetni));
        return isEmriUygun && aramaGrupUygun;
    }).map(grup => {
        const filteredRaporlar = grup.raporlar.filter(rapor => {
            const tipUygun = !tipFiltre || rapor.raporTipi?.toLowerCase().includes(tipFiltre.replace('-', ' '));
            const durumUygun = !durumFiltre || rapor.durum === durumFiltre;
            return tipUygun && durumUygun;
        });
        return { ...grup, raporlar: filteredRaporlar };
    }).filter(grup => grup.raporlar.length > 0);

    if (raporGorunum === 'grouped') {
        raporAccordionGuncelle(filtrelenmisGruplar);
    } else {
        raporTablosuGuncelle(filtrelenmisRaporlar);
    }
}

// Rapor satir HTML helper
function raporSatirHTML(rapor) {
    const tarih = rapor.tarih ? new Date(rapor.tarih).toLocaleDateString('tr-TR') : '-';
    const sonucClass = rapor.sonuc === 'UYGUN' ? 'color: #27ae60; background: #e8f5e9;' :
        rapor.sonuc === 'UYGUN DEĞİL' ? 'color: #e74c3c; background: #ffebee;' : 'color: #666;';
    const durumClass = rapor.durum === 'Tamamlandı' ? 'background: #27ae60;' : 'background: #f39c12;';
    const tipLower = (rapor.raporTipi || '').toLowerCase();
    const tipIcon = tipLower.includes('kompres') ? '🔧' : tipLower.includes('hava') ? '🫙' : tipLower.includes('elektrik') ? '⚡' : '📋';
    const tipEscaped = (rapor.raporTipi || '').replace(/'/g, "\\'");
    const sablonKodu = rapor.sablonKodu || '';

    return `
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 12px 15px; font-weight: 600; color: #1a5d3a;">${rapor.raporNo || '-'}</td>
            <td style="padding: 12px 15px;">
                ${rapor.isEmriId ? `<a href="#" onclick="event.preventDefault(); navigateToPage('is-emirleri'); setTimeout(() => viewIsEmri(${rapor.isEmriId}), 300);" style="color: #3498db; text-decoration: none; font-weight: 500;" title="İş Emrine Git">${rapor.isEmriNo || '-'}</a>` : (rapor.isEmriNo || '-')}
            </td>
            <td style="padding: 12px 15px;">
                <span style="display: inline-flex; align-items: center; gap: 8px;">
                    <span style="font-size: 18px;">${tipIcon}</span>
                    ${rapor.raporTipi || '-'}
                </span>
            </td>
            <td style="padding: 12px 15px;">${rapor.firmaAdi || '-'}</td>
            <td style="padding: 12px 15px;">${tarih}</td>
            <td style="padding: 12px 15px; text-align: center;">
                <span style="padding: 5px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; ${sonucClass}">
                    ${rapor.sonuc || '-'}
                </span>
            </td>
            <td style="padding: 12px 15px; text-align: center;">
                <span style="padding: 5px 12px; border-radius: 20px; font-size: 12px; color: white; ${durumClass}">
                    ${rapor.durum || '-'}
                </span>
            </td>
            <td style="padding: 12px 15px; text-align: center;">
                <div style="display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;">
                    <button onclick="raporDuzenle(${rapor.id}, ${rapor.altGorevId}, '${tipEscaped}', '${sablonKodu}')" class="btn btn-sm" style="padding: 6px 10px; background: #3498db; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;" title="Düzenle">
                        ✏️
                    </button>
                    <button onclick="raporOnizle(${rapor.id}, '${tipEscaped}', '${sablonKodu}')" class="btn btn-sm" style="padding: 6px 10px; background: #8e44ad; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;" title="Önizle">
                        👁️
                    </button>
                    <button onclick="raporWordIndir(${rapor.id}, '${tipEscaped}', '${sablonKodu}')" class="btn btn-sm" style="padding: 6px 10px; background: #1a5d3a; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;" title="Word İndir">
                        📄
                    </button>
                    <button onclick="raporPdfIndir(${rapor.id}, '${tipEscaped}', '${sablonKodu}')" class="btn btn-sm" style="padding: 6px 10px; background: #e67e22; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;" title="PDF İndir">
                        📕
                    </button>
                    <button onclick="raporSil(${rapor.id}, '${tipEscaped}', '${sablonKodu}')" class="btn btn-sm" style="padding: 6px 10px; background: #e74c3c; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;" title="Sil">
                        🗑️
                    </button>
                </div>
            </td>
        </tr>
    `;
}

// Accordion goruntuleme
function raporAccordionGuncelle(gruplar) {
    const container = document.getElementById('rapor-accordion-container');
    if (!container) return;

    if (!gruplar || gruplar.length === 0) {
        container.innerHTML = `
            <div style="padding: 60px; text-align: center; color: #666; background: white; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.08);">
                <div style="font-size: 64px; margin-bottom: 15px;">📁</div>
                <h3 style="margin: 0 0 10px 0; color: #333;">Henüz rapor bulunmuyor</h3>
                <p style="margin: 0; color: #888;">İş emirlerinden ölçüm yaparak rapor oluşturabilirsiniz.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = gruplar.map((grup, index) => {
        const isOpen = acikGruplar[grup.isEmriNo] || false;
        const raporSayisi = grup.raporlar.length;
        const durumRenk = {
            'BEKLIYOR': '#6c757d', 'ATANDI': '#0d6efd', 'SAHADA': '#fd7e14',
            'TAMAMLANDI': '#198754', 'RAPOR_YAZILDI': '#6f42c1', 'TESLIM_EDILDI': '#0f5132'
        };
        const tarih = grup.planliTarih ? new Date(grup.planliTarih).toLocaleDateString('tr-TR') : '';
        const durumText = { 'BEKLIYOR': 'Bekliyor', 'ATANDI': 'Atandı', 'SAHADA': 'Sahada', 'TAMAMLANDI': 'Tamamlandı', 'RAPOR_YAZILDI': 'Rapor Yazıldı', 'TESLIM_EDILDI': 'Teslim Edildi' };

        return `
            <div style="margin-bottom: 8px; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                <div onclick="toggleRaporGrup('${grup.isEmriNo}')" style="display: flex; align-items: center; gap: 15px; padding: 16px 20px; background: linear-gradient(135deg, #f8f9fa, #fff); cursor: pointer; border-left: 4px solid ${durumRenk[grup.durum] || '#6c757d'}; transition: background 0.2s;">
                    <span id="rapor-arrow-${grup.isEmriNo}" style="font-size: 18px; transition: transform 0.3s; transform: rotate(${isOpen ? '90' : '0'}deg);">&#9654;</span>
                    <div style="flex: 1; display: flex; align-items: center; gap: 15px; flex-wrap: wrap;">
                        <strong style="font-size: 15px; color: #1a5d3a;">${grup.isEmriNo}</strong>
                        <span style="color: #555;">|</span>
                        <span style="color: #333;">${grup.musteri}</span>
                        <span style="color: #555;">|</span>
                        <span style="background: ${durumRenk[grup.durum] || '#6c757d'}; color: white; padding: 2px 10px; border-radius: 12px; font-size: 12px;">${durumText[grup.durum] || grup.durum}</span>
                        <span style="background: #e3f2fd; color: #1565c0; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">${raporSayisi} rapor</span>
                        ${tarih ? `<span style="color: #888; font-size: 13px;">${tarih}</span>` : ''}
                    </div>
                    <div style="display: flex; gap: 6px;" onclick="event.stopPropagation();">
                        ${grup.isEmriId ? `<button onclick="raporlarPdfBirlestirModal(${grup.isEmriId}, '${grup.isEmriNo}')" class="btn btn-sm" style="padding: 5px 12px; background: #8e44ad; color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;" title="PDF Birleştir">
                            📑 PDF Birleştir
                        </button>` : ''}
                        ${grup.isEmriId ? `<button onclick="dosyaYukleModal(${grup.isEmriId})" class="btn btn-sm" style="padding: 5px 12px; background: #3498db; color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;" title="Dosya Yükle">
                            📤 Yükle
                        </button>` : ''}
                        ${grup.isEmriId ? `<button onclick="renderIsEmriDetay(${grup.isEmriId}); navigateToPage('is-emirleri');" class="btn btn-sm" style="padding: 5px 12px; background: #1a5d3a; color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;" title="İş Emri Detay">
                            📋 Detay
                        </button>` : ''}
                    </div>
                </div>
                <div id="rapor-grup-${grup.isEmriNo}" style="display: ${isOpen ? 'block' : 'none'}; background: white;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #1a5d3a; color: white;">
                                <th style="padding: 10px 15px; text-align: left; font-size: 13px;">Rapor No</th>
                                <th style="padding: 10px 15px; text-align: left; font-size: 13px;">Rapor Tipi</th>
                                <th style="padding: 10px 15px; text-align: left; font-size: 13px;">Firma</th>
                                <th style="padding: 10px 15px; text-align: left; font-size: 13px;">Tarih</th>
                                <th style="padding: 10px 15px; text-align: center; font-size: 13px;">Sonuç</th>
                                <th style="padding: 10px 15px; text-align: center; font-size: 13px;">Durum</th>
                                <th style="padding: 10px 15px; text-align: center; font-size: 13px;">İşlemler</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${grup.raporlar.map(r => raporSatirHTML(r)).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }).join('');
}

function toggleRaporGrup(isEmriNo) {
    acikGruplar[isEmriNo] = !acikGruplar[isEmriNo];
    const el = document.getElementById('rapor-grup-' + isEmriNo);
    if (el) {
        el.style.display = acikGruplar[isEmriNo] ? 'block' : 'none';
        const arrow = document.getElementById('rapor-arrow-' + isEmriNo);
        if (arrow) arrow.style.transform = 'rotate(' + (acikGruplar[isEmriNo] ? '90' : '0') + 'deg)';
    }
}

// Rapor tablosunu güncelle (flat goruntuleme)
function raporTablosuGuncelle(raporlar) {
    const tbody = document.getElementById('rapor-table-body');
    if (!tbody) return;

    if (raporlar.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="padding: 60px; text-align: center; color: #666;">
                    <div style="font-size: 64px; margin-bottom: 15px;">📋</div>
                    <h3 style="margin: 0 0 10px 0; color: #333;">Henüz rapor bulunmuyor</h3>
                    <p style="margin: 0; color: #888;">İş emirlerinden ölçüm yaparak rapor oluşturabilirsiniz.</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = raporlar.map(rapor => raporSatirHTML(rapor)).join('');
}

// Rapor düzenle
function raporDuzenle(raporId, altGorevId, raporTipi, sablonKodu) {
    const tip = (raporTipi || '').toLowerCase();

    // Özel form tipleri
    if (tip.includes('kompres')) {
        window.open(`/forms/kompresor-form.html?altGorevId=${altGorevId}`, '_blank');
    } else if (tip.includes('hava') && tip.includes('tank')) {
        window.open(`/forms/hava-tanki-form.html?altGorevId=${altGorevId}`, '_blank');
    } else if (tip.includes('elektrik') && tip.includes('topraklama')) {
        window.open(`/forms/elektrik-topraklama-form-v2.html?altGorevId=${altGorevId}`, '_blank');
    } else if (tip.includes('ic') && tip.includes('tesisat') || tip.includes('ictesisat')) {
        window.open(`/forms/elektrik-ic-tesisat-form.html?altGorevId=${altGorevId}`, '_blank');
    } else if (sablonKodu) {
        // Generic rapor - şablon koduna göre form aç
        window.open(`/forms/generic-rapor-form.html?sablon=${sablonKodu}&altGorevId=${altGorevId}`, '_blank');
    } else {
        showToast('Bu rapor tipi için düzenleme formu bulunamadı', 'error');
    }
}

// Rapor Word indir
async function raporWordIndir(raporId, raporTipi, sablonKodu) {
    try {
        showToast('Word dosyası hazırlanıyor...', 'info');

        const tipLower = (raporTipi || '').toLowerCase();
        const isKompresor = tipLower.includes('kompres');
        const isHavaTanki = tipLower.includes('hava');
        const isIcTesisat = tipLower.includes('ic') && tipLower.includes('tesisat') || tipLower.includes('ictesisat');
        const isElektrik = tipLower.includes('elektrik') && !isIcTesisat;
        const isGeneric = sablonKodu && !isKompresor && !isHavaTanki && !isElektrik && !isIcTesisat;

        let apiUrl;
        if (isGeneric) {
            apiUrl = `${API_BASE}/rapor/${sablonKodu}/${raporId}/word`;
        } else if (isIcTesisat) {
            apiUrl = `${API_BASE}/elektrik-ic-tesisat/${raporId}/word-rapor`;
        } else {
            const apiPath = isKompresor ? 'kompresor-raporu' : isHavaTanki ? 'hava-tanki-raporu' : 'elektrik-topraklama-raporu';
            apiUrl = `${API_BASE}/${apiPath}/${raporId}/word`;
        }

        const isMekanik = isKompresor || isHavaTanki || isGeneric;
        const res = await authenticatedFetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tekniker: currentUser || {}
            })
        });

        if (res.ok) {
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const dosyaAdi = isGeneric ? (sablonKodu + '_Raporu') : isKompresor ? 'Kompresor_Muayene_Raporu' : isHavaTanki ? 'Hava_Tanki_Muayene_Raporu' : isIcTesisat ? 'Elektrik_Ic_Tesisat_Raporu' : 'Elektrik_Topraklama_Raporu';
            a.download = `${dosyaAdi}_${raporId}.docx`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Word dosyası indirildi!', 'success');
        } else {
            const err = await res.json();
            showToast('Hata: ' + (err.error || 'Word oluşturulamadı'), 'error');
        }
    } catch (error) {
        console.error('Word indirme hatası:', error);
        showToast('Word indirme hatası: ' + error.message, 'error');
    }
}

// Rapor sil
async function raporSil(raporId, raporTipi, sablonKodu) {
    if (!confirm('Bu raporu silmek istediğinize emin misiniz?\nBu işlem geri alınamaz!')) return;

    try {
        const tipL = (raporTipi || '').toLowerCase();
        const isIcTes = tipL.includes('ic') && tipL.includes('tesisat') || tipL.includes('ictesisat');
        const isGeneric = sablonKodu && !tipL.includes('kompres') && !tipL.includes('hava') && !tipL.includes('elektrik') && !isIcTes;
        let apiUrl;
        if (isGeneric) {
            apiUrl = `${API_BASE}/rapor/${sablonKodu}/${raporId}`;
        } else if (isIcTes) {
            apiUrl = `${API_BASE}/elektrik-ic-tesisat/${raporId}`;
        } else {
            const apiPath = tipL.includes('kompres') ? 'kompresor-raporu' : tipL.includes('hava') ? 'hava-tanki-raporu' : 'elektrik-topraklama-raporu';
            apiUrl = `${API_BASE}/${apiPath}/${raporId}`;
        }
        const res = await authenticatedFetch(apiUrl, {
            method: 'DELETE'
        });

        if (res.ok) {
            showToast('Rapor silindi', 'success');
            raporlariYukle();
        } else {
            const err = await res.json();
            showToast('Silme hatası: ' + (err.error || 'Bilinmeyen hata'), 'error');
        }
    } catch (error) {
        console.error('Rapor silme hatası:', error);
        showToast('Silme hatası: ' + error.message, 'error');
    }
}

// Rapor önizleme (Word → HTML)
async function raporOnizle(raporId, raporTipi, sablonKodu) {
    try {
        showLoading();

        const tipLower = (raporTipi || '').toLowerCase();
        const isGeneric = sablonKodu && !tipLower.includes('kompres') && !tipLower.includes('hava') && !tipLower.includes('elektrik');
        const apiTipi = isGeneric ? sablonKodu : (tipLower.includes('kompres') ? 'kompresor' : tipLower.includes('hava') ? 'hava-tanki' : 'elektrik');

        const res = await authenticatedFetch(`${API_BASE}/rapor-onizleme/${apiTipi}/${raporId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tekniker: currentUser || {} })
        });

        hideLoading();

        if (!res.ok) {
            const err = await res.json();
            showToast('Önizleme hatası: ' + (err.error || 'Bilinmeyen hata'), 'error');
            return;
        }

        const data = await res.json();

        // Önizleme modalı oluştur
        const modalHtml = `
            <div class="modal-overlay" onclick="closeModal(event)" style="z-index: 10000;">
                <div class="modal" onclick="event.stopPropagation()" style="max-width: 900px; max-height: 90vh; display: flex; flex-direction: column;">
                    <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center;">
                        <h3>📄 Rapor Önizleme</h3>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <button onclick="raporPdfIndir(${raporId}, '${(raporTipi || '').replace(/'/g, "\\'")}', '${sablonKodu}')" class="btn btn-sm" style="background: #e67e22; color: white; border: none; border-radius: 6px; padding: 6px 14px; cursor: pointer;">
                                📕 PDF İndir
                            </button>
                            <button onclick="raporWordIndir(${raporId}, '${(raporTipi || '').replace(/'/g, "\\'")}', '${sablonKodu}')" class="btn btn-sm" style="background: #1a5d3a; color: white; border: none; border-radius: 6px; padding: 6px 14px; cursor: pointer;">
                                📄 Word İndir
                            </button>
                            <button class="modal-close" onclick="closeModal()" style="font-size: 24px; cursor: pointer; background: none; border: none;">&times;</button>
                        </div>
                    </div>
                    <div class="modal-body" style="flex: 1; overflow-y: auto; padding: 20px;">
                        <div id="rapor-onizleme-content" style="background: white; padding: 30px; border: 1px solid #ddd; border-radius: 4px; font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.6;">
                            ${data.html}
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } catch (error) {
        hideLoading();
        console.error('Önizleme hatası:', error);
        showToast('Önizleme hatası: ' + error.message, 'error');
    }
}

// Rapor PDF indir (Word → PDF sunucuda dönüştürme)
async function raporPdfIndir(raporId, raporTipi, sablonKodu) {
    try {
        showToast('PDF hazırlanıyor...', 'info');
        showLoading();

        const tipLower = (raporTipi || '').toLowerCase();
        const isGeneric = sablonKodu && !tipLower.includes('kompres') && !tipLower.includes('hava') && !tipLower.includes('elektrik');
        const apiTipi = isGeneric ? sablonKodu : (tipLower.includes('kompres') ? 'kompresor' : tipLower.includes('hava') ? 'hava-tanki' : 'elektrik');

        const res = await authenticatedFetch(`${API_BASE}/rapor-pdf/${apiTipi}/${raporId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tekniker: currentUser || {} })
        });

        hideLoading();

        if (res.ok) {
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Rapor_${raporId}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('PDF indirildi!', 'success');
        } else {
            const err = await res.json();
            showToast('PDF hatası: ' + (err.error || 'Oluşturulamadı'), 'error');
        }
    } catch (error) {
        hideLoading();
        console.error('PDF indirme hatası:', error);
        showToast('PDF hatası: ' + error.message, 'error');
    }
}

// ===================== DOSYA YÖNETİMİ & PDF BİRLEŞTİRME =====================

let isEmriDosyaData = null;

async function loadIsEmriDosyalar(isEmriId) {
    const container = document.getElementById('isemri-dosyalar-container');
    if (!container) return;

    try {
        const res = await authenticatedFetch(`${API_BASE}/is-emirleri/${isEmriId}/dosyalar`);
        if (!res.ok) throw new Error('Dosyalar yüklenemedi');
        isEmriDosyaData = await res.json();

        let html = '';

        // Kapak dosyaları
        if (isEmriDosyaData.kapaklar?.length > 0) {
            html += `<div style="margin-bottom: 12px;">
                <strong style="color: #8e44ad;">📄 Kapak Dosyaları:</strong>
                ${isEmriDosyaData.kapaklar.map(d => `
                    <span style="display: inline-flex; align-items: center; gap: 4px; background: #f3e5f5; padding: 4px 10px; border-radius: 15px; margin: 2px 4px; font-size: 13px;">
                        ${d.dosyaAdi}
                        <a href="${d.dosyaYolu}" target="_blank" style="color: #8e44ad;" title="Görüntüle">👁️</a>
                        <button onclick="sistemDosyaSil(${d.id}, ${isEmriId})" style="background: none; border: none; cursor: pointer; color: #e74c3c; font-size: 12px;" title="Sil">✕</button>
                    </span>
                `).join('')}
            </div>`;
        }

        // Raporlar
        if (isEmriDosyaData.raporlar?.length > 0) {
            html += `<div style="margin-bottom: 12px;">
                <strong style="color: #1a5d3a;">📋 Raporlar:</strong>
                ${isEmriDosyaData.raporlar.map(r => `
                    <span style="display: inline-flex; align-items: center; gap: 4px; background: #e8f5e9; padding: 4px 10px; border-radius: 15px; margin: 2px 4px; font-size: 13px;">
                        ${r.raporNo} (${r.tip})
                    </span>
                `).join('')}
            </div>`;
        }

        // Kalibrasyon sertifikaları
        if (isEmriDosyaData.kalibrasyonlar?.length > 0) {
            html += `<div style="margin-bottom: 12px;">
                <strong style="color: #e67e22;">🔧 Kalibrasyon Sertifikaları:</strong>
                ${isEmriDosyaData.kalibrasyonlar.map(k => `
                    <span style="display: inline-flex; align-items: center; gap: 4px; background: #fff3e0; padding: 4px 10px; border-radius: 15px; margin: 2px 4px; font-size: 13px;">
                        ${k.cihazAdi} ${k.marka || ''} - Seri:${k.seriNo || '-'}
                        <a href="${k.dosyaYolu}" target="_blank" style="color: #e67e22;" title="Sertifika">📎</a>
                    </span>
                `).join('')}
            </div>`;
        }

        // Eğitim sertifikaları
        if (isEmriDosyaData.egitimSertifikalari?.length > 0) {
            html += `<div style="margin-bottom: 12px;">
                <strong style="color: #2196f3;">🎓 Eğitim Sertifikaları:</strong>
                ${isEmriDosyaData.egitimSertifikalari.map(e => `
                    <span style="display: inline-flex; align-items: center; gap: 4px; background: #e3f2fd; padding: 4px 10px; border-radius: 15px; margin: 2px 4px; font-size: 13px;">
                        ${e.personel?.adSoyad || '-'} - ${e.dosyaAdi}
                        <a href="${e.dosyaYolu}" target="_blank" style="color: #2196f3;" title="Görüntüle">👁️</a>
                        <button onclick="sistemDosyaSil(${e.id}, ${isEmriId})" style="background: none; border: none; cursor: pointer; color: #e74c3c; font-size: 12px;" title="Sil">✕</button>
                    </span>
                `).join('')}
            </div>`;
        }

        // Diğer dosyalar
        if (isEmriDosyaData.digerDosyalar?.length > 0) {
            html += `<div style="margin-bottom: 12px;">
                <strong style="color: #666;">📂 Diğer Dosyalar:</strong>
                ${isEmriDosyaData.digerDosyalar.map(d => `
                    <span style="display: inline-flex; align-items: center; gap: 4px; background: #f5f5f5; padding: 4px 10px; border-radius: 15px; margin: 2px 4px; font-size: 13px;">
                        ${d.dosyaAdi} <span style="color:#999; font-size:11px;">(${d.dosyaTipi})</span>
                        <a href="${d.dosyaYolu}" target="_blank" style="color: #666;" title="Görüntüle">👁️</a>
                        <button onclick="sistemDosyaSil(${d.id}, ${isEmriId})" style="background: none; border: none; cursor: pointer; color: #e74c3c; font-size: 12px;" title="Sil">✕</button>
                    </span>
                `).join('')}
            </div>`;
        }

        if (!html) {
            html = '<p style="color: #999; font-style: italic;">Henüz dosya eklenmemiş. Kapak, eğitim sertifikası veya diğer dosyaları yükleyebilirsiniz.</p>';
        }

        container.innerHTML = html;
    } catch (error) {
        console.error('Dosya yükleme hatası:', error);
        container.innerHTML = '<p style="color: #e74c3c;">Dosyalar yüklenirken hata oluştu</p>';
    }
}

async function sistemDosyaSil(dosyaId, isEmriId) {
    if (!confirm('Bu dosyayı silmek istediğinize emin misiniz?')) return;
    try {
        const res = await authenticatedFetch(`${API_BASE}/sistem-dosya/${dosyaId}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Dosya silindi', 'success');
            loadIsEmriDosyalar(isEmriId);
        } else {
            showToast('Dosya silinemedi', 'error');
        }
    } catch (error) {
        showToast('Hata: ' + error.message, 'error');
    }
}

function dosyaYukleModal(isEmriId) {
    const modalHtml = `
        <div class="modal-overlay" id="dosya-yukle-modal-overlay" onclick="closeDosyaYukleModal(event)" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 10000;">
            <div onclick="event.stopPropagation()" style="background: white; border-radius: 12px; padding: 30px; max-width: 500px; width: 90%; box-shadow: 0 10px 40px rgba(0,0,0,0.2);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; color: #333;">📤 Dosya Yükle</h3>
                    <button onclick="closeDosyaYukleModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">&times;</button>
                </div>

                <div class="form-group" style="margin-bottom: 15px;">
                    <label style="font-weight: 600; display: block; margin-bottom: 5px;">Dosya Tipi:</label>
                    <select id="dosya-yukle-tip" class="form-input" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px;">
                        <option value="kapak">Kapak Dosyası</option>
                        <option value="egitim">Eğitim Sertifikası</option>
                        <option value="diger">Diğer</option>
                    </select>
                </div>

                <div id="dosya-yukle-personel-div" class="form-group" style="margin-bottom: 15px; display: none;">
                    <label style="font-weight: 600; display: block; margin-bottom: 5px;">Personel (Eğitim Sertifikası için):</label>
                    <select id="dosya-yukle-personel" class="form-input" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px;">
                        <option value="">Seçiniz...</option>
                    </select>
                </div>

                <div class="form-group" style="margin-bottom: 15px;">
                    <label style="font-weight: 600; display: block; margin-bottom: 5px;">Kategori:</label>
                    <select id="dosya-yukle-kategori" class="form-input" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px;">
                        <option value="">Genel</option>
                        <option value="elektrik">Elektrik</option>
                        <option value="mekanik">Mekanik</option>
                    </select>
                </div>

                <div class="form-group" style="margin-bottom: 15px;">
                    <label style="font-weight: 600; display: block; margin-bottom: 5px;">Açıklama:</label>
                    <input type="text" id="dosya-yukle-aciklama" class="form-input" placeholder="Opsiyonel açıklama..." style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px;">
                </div>

                <div class="form-group" style="margin-bottom: 20px;">
                    <label style="font-weight: 600; display: block; margin-bottom: 5px;">Dosya Seç (PDF/JPEG/PNG, max 20MB):</label>
                    <input type="file" id="dosya-yukle-input" accept=".pdf,.jpg,.jpeg,.png" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px;">
                </div>

                <div style="display: flex; gap: 10px;">
                    <button onclick="dosyaYukleGonder(${isEmriId})" class="btn btn-primary" style="flex: 1; padding: 12px; font-weight: 600; background: #27ae60; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        📤 Yükle
                    </button>
                    <button onclick="closeDosyaYukleModal()" class="btn btn-secondary" style="padding: 12px 24px; border: 1px solid #ddd; border-radius: 8px; cursor: pointer; background: #f5f5f5;">
                        İptal
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Tip değişince personel alanını göster/gizle
    document.getElementById('dosya-yukle-tip').addEventListener('change', function() {
        const personelDiv = document.getElementById('dosya-yukle-personel-div');
        personelDiv.style.display = this.value === 'egitim' ? 'block' : 'none';
    });

    // Personel listesini yükle
    loadPersonelListForDosya();
}

async function loadPersonelListForDosya() {
    try {
        const res = await authenticatedFetch(`${API_BASE}/personel`);
        if (res.ok) {
            const personeller = await res.json();
            const select = document.getElementById('dosya-yukle-personel');
            if (select) {
                personeller.forEach(p => {
                    select.innerHTML += `<option value="${p.id}">${p.adSoyad}</option>`;
                });
            }
        }
    } catch (e) { console.error(e); }
}

function closeDosyaYukleModal(event) {
    if (event && event.target !== event.currentTarget) return;
    const modal = document.getElementById('dosya-yukle-modal-overlay');
    if (modal) modal.remove();
}

async function dosyaYukleGonder(isEmriId) {
    const fileInput = document.getElementById('dosya-yukle-input');
    const dosyaTipi = document.getElementById('dosya-yukle-tip')?.value || 'diger';
    const kategori = document.getElementById('dosya-yukle-kategori')?.value || '';
    const aciklama = document.getElementById('dosya-yukle-aciklama')?.value || '';
    const personelId = document.getElementById('dosya-yukle-personel')?.value || '';

    if (!fileInput?.files?.length) {
        showToast('Lütfen bir dosya seçin', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('dosya', fileInput.files[0]);
    formData.append('dosyaTipi', dosyaTipi);
    formData.append('isEmriId', isEmriId);
    if (kategori) formData.append('kategori', kategori);
    if (aciklama) formData.append('aciklama', aciklama);
    if (personelId && dosyaTipi === 'egitim') formData.append('personelId', personelId);

    try {
        showLoading();
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE}/sistem-dosya`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        hideLoading();

        if (res.ok) {
            showToast('Dosya başarıyla yüklendi', 'success');
            closeDosyaYukleModal();
            loadIsEmriDosyalar(isEmriId);
        } else {
            const err = await res.json();
            showToast('Yükleme hatası: ' + (err.error || 'Bilinmeyen hata'), 'error');
        }
    } catch (error) {
        hideLoading();
        showToast('Yükleme hatası: ' + error.message, 'error');
    }
}

// ============ PDF BİRLEŞTİRME MODAL ============

let birlestirmeListesi = [];

function pdfBirlestirModal(isEmriId) {
    birlestirmeListesi = [];

    // Eğer dosya verisi henüz yüklenmediyse yükle
    if (!isEmriDosyaData) {
        showToast('Dosya bilgileri yükleniyor, lütfen bekleyin...', 'info');
        loadIsEmriDosyalar(isEmriId).then(() => pdfBirlestirModalRender(isEmriId));
        return;
    }

    pdfBirlestirModalRender(isEmriId);
}

function pdfBirlestirModalRender(isEmriId) {
    const data = isEmriDosyaData;
    if (!data) return;

    const modalHtml = `
        <div class="modal-overlay" id="pdf-birlestir-modal-overlay" onclick="closePdfBirlestirModal(event)" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 10000;">
            <div onclick="event.stopPropagation()" style="background: white; border-radius: 12px; padding: 30px; max-width: 900px; width: 95%; max-height: 85vh; overflow-y: auto; box-shadow: 0 10px 40px rgba(0,0,0,0.2);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; color: #333;">📑 PDF Birleştirme - ${data.isEmriNo || ''}</h3>
                    <button onclick="closePdfBirlestirModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">&times;</button>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <!-- Sol Panel: Mevcut Dosyalar -->
                    <div style="border: 1px solid #ddd; border-radius: 8px; padding: 15px; max-height: 400px; overflow-y: auto;">
                        <h4 style="margin: 0 0 12px 0; color: #555; font-size: 14px;">Mevcut Dosyalar</h4>

                        ${data.kapaklar?.length > 0 ? `
                            <div style="margin-bottom: 10px;">
                                <strong style="font-size: 12px; color: #8e44ad;">📄 Kapak Dosyaları</strong>
                                ${data.kapaklar.map(d => `
                                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; margin: 4px 0; background: #f9f9f9; border-radius: 6px; font-size: 13px;">
                                        <span>${d.dosyaAdi}</span>
                                        <button onclick="birlestirmeEkle('kapak', ${d.id}, '${d.dosyaAdi.replace(/'/g, "\\'")}')" style="background: #27ae60; color: white; border: none; border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 12px;">+</button>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}

                        ${data.raporlar?.length > 0 ? `
                            <div style="margin-bottom: 10px;">
                                <strong style="font-size: 12px; color: #1a5d3a;">📋 Raporlar</strong>
                                ${data.raporlar.map(r => `
                                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; margin: 4px 0; background: #f9f9f9; border-radius: 6px; font-size: 13px;">
                                        <span>${r.raporNo} (${r.tip})</span>
                                        <button onclick="birlestirmeEkle('rapor', ${r.id}, '${r.raporNo}', '${r.raporTipi}')" style="background: #27ae60; color: white; border: none; border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 12px;">+</button>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}

                        ${data.kalibrasyonlar?.length > 0 ? `
                            <div style="margin-bottom: 10px;">
                                <strong style="font-size: 12px; color: #e67e22;">🔧 Kalibrasyon Sertifikaları</strong>
                                ${data.kalibrasyonlar.map(k => `
                                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; margin: 4px 0; background: #f9f9f9; border-radius: 6px; font-size: 13px;">
                                        <span>${k.cihazAdi} ${k.marka || ''}</span>
                                        <button onclick="birlestirmeEkle('kalibrasyon', ${k.cihazId}, '${(k.cihazAdi || '').replace(/'/g, "\\'")}')" style="background: #27ae60; color: white; border: none; border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 12px;">+</button>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}

                        ${data.egitimSertifikalari?.length > 0 ? `
                            <div style="margin-bottom: 10px;">
                                <strong style="font-size: 12px; color: #2196f3;">🎓 Eğitim Sertifikaları</strong>
                                ${data.egitimSertifikalari.map(e => `
                                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; margin: 4px 0; background: #f9f9f9; border-radius: 6px; font-size: 13px;">
                                        <span>${e.personel?.adSoyad || '-'} - ${e.dosyaAdi}</span>
                                        <button onclick="birlestirmeEkle('egitim', ${e.id}, '${(e.dosyaAdi || '').replace(/'/g, "\\'")}')" style="background: #27ae60; color: white; border: none; border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 12px;">+</button>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}

                        ${data.digerDosyalar?.length > 0 ? `
                            <div style="margin-bottom: 10px;">
                                <strong style="font-size: 12px; color: #666;">📂 Diğer Dosyalar</strong>
                                ${data.digerDosyalar.map(d => `
                                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; margin: 4px 0; background: #f9f9f9; border-radius: 6px; font-size: 13px;">
                                        <span>${d.dosyaAdi}</span>
                                        <button onclick="birlestirmeEkle('dosya', ${d.id}, '${(d.dosyaAdi || '').replace(/'/g, "\\'")}')" style="background: #27ae60; color: white; border: none; border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 12px;">+</button>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}

                        ${(!data.kapaklar?.length && !data.raporlar?.length && !data.kalibrasyonlar?.length && !data.egitimSertifikalari?.length && !data.digerDosyalar?.length) ? '<p style="color: #999; font-size: 13px;">Henüz dosya bulunmuyor</p>' : ''}
                    </div>

                    <!-- Sağ Panel: Birleştirme Sırası -->
                    <div style="border: 1px solid #ddd; border-radius: 8px; padding: 15px;">
                        <h4 style="margin: 0 0 12px 0; color: #555; font-size: 14px;">Birleştirme Sırası</h4>
                        <div id="birlestirme-listesi" style="min-height: 200px; max-height: 400px; overflow-y: auto;">
                            <p style="color: #bbb; font-size: 13px; text-align: center; padding: 40px 0;">Soldaki dosyalardan "+" butonuyla ekleyin</p>
                        </div>
                    </div>
                </div>

                <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
                    <button onclick="closePdfBirlestirModal()" style="padding: 12px 24px; border: 1px solid #ddd; border-radius: 8px; cursor: pointer; background: #f5f5f5;">
                        İptal
                    </button>
                    <button onclick="pdfBirlestirGonder(${isEmriId})" style="padding: 12px 24px; background: #8e44ad; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                        📑 Birleştir & İndir
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closePdfBirlestirModal(event) {
    if (event && event.target !== event.currentTarget) return;
    const modal = document.getElementById('pdf-birlestir-modal-overlay');
    if (modal) modal.remove();
}

function birlestirmeEkle(tip, id, label, raporTipi) {
    birlestirmeListesi.push({ tip, id, label, raporTipi: raporTipi || '', raporId: tip === 'rapor' ? id : undefined, dosyaId: tip !== 'rapor' ? id : undefined, cihazId: tip === 'kalibrasyon' ? id : undefined });
    birlestirmeListesiGuncelle();
}

function birlestirmeCikar(index) {
    birlestirmeListesi.splice(index, 1);
    birlestirmeListesiGuncelle();
}

function birlestirmeYukari(index) {
    if (index <= 0) return;
    [birlestirmeListesi[index - 1], birlestirmeListesi[index]] = [birlestirmeListesi[index], birlestirmeListesi[index - 1]];
    birlestirmeListesiGuncelle();
}

function birlestirmeAsagi(index) {
    if (index >= birlestirmeListesi.length - 1) return;
    [birlestirmeListesi[index], birlestirmeListesi[index + 1]] = [birlestirmeListesi[index + 1], birlestirmeListesi[index]];
    birlestirmeListesiGuncelle();
}

function birlestirmeListesiGuncelle() {
    const container = document.getElementById('birlestirme-listesi');
    if (!container) return;

    if (birlestirmeListesi.length === 0) {
        container.innerHTML = '<p style="color: #bbb; font-size: 13px; text-align: center; padding: 40px 0;">Soldaki dosyalardan "+" butonuyla ekleyin</p>';
        return;
    }

    const tipRenk = { kapak: '#8e44ad', rapor: '#1a5d3a', kalibrasyon: '#e67e22', egitim: '#2196f3', dosya: '#666' };
    const tipIcon = { kapak: '📄', rapor: '📋', kalibrasyon: '🔧', egitim: '🎓', dosya: '📂' };

    container.innerHTML = birlestirmeListesi.map((item, index) => `
        <div style="display: flex; align-items: center; gap: 8px; padding: 8px; margin-bottom: 4px; background: #f8f9fa; border-radius: 6px; border-left: 3px solid ${tipRenk[item.tip] || '#666'};">
            <span style="font-weight: 600; color: #999; min-width: 20px; font-size: 12px;">${index + 1}</span>
            <span style="font-size: 16px;">${tipIcon[item.tip] || '📄'}</span>
            <span style="flex: 1; font-size: 13px;">${item.label}</span>
            <div style="display: flex; gap: 2px;">
                <button onclick="birlestirmeYukari(${index})" style="background: none; border: none; cursor: pointer; font-size: 14px; opacity: ${index === 0 ? '0.3' : '1'};" ${index === 0 ? 'disabled' : ''}>⬆️</button>
                <button onclick="birlestirmeAsagi(${index})" style="background: none; border: none; cursor: pointer; font-size: 14px; opacity: ${index === birlestirmeListesi.length - 1 ? '0.3' : '1'};" ${index === birlestirmeListesi.length - 1 ? 'disabled' : ''}>⬇️</button>
                <button onclick="birlestirmeCikar(${index})" style="background: none; border: none; cursor: pointer; color: #e74c3c; font-size: 14px;">✕</button>
            </div>
        </div>
    `).join('');
}

async function pdfBirlestirGonder(isEmriId) {
    if (birlestirmeListesi.length === 0) {
        showToast('Lütfen birleştirilecek dosyaları seçin', 'error');
        return;
    }

    try {
        showLoading();
        showToast('PDF birleştiriliyor, bu birkaç dakika sürebilir...', 'info');

        const dosyaSirasi = birlestirmeListesi.map(item => {
            if (item.tip === 'rapor') {
                return { tip: 'rapor', raporId: item.id, raporTipi: item.raporTipi, id: item.id };
            } else if (item.tip === 'kalibrasyon') {
                return { tip: 'kalibrasyon', cihazId: item.id };
            } else {
                return { tip: item.tip, id: item.id, dosyaId: item.id };
            }
        });

        const res = await authenticatedFetch(`${API_BASE}/is-emirleri/${isEmriId}/pdf-birlestir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dosyaSirasi })
        });

        hideLoading();

        if (res.ok) {
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                // Sunucu hata döndü JSON olarak
                const err = await res.json();
                showToast('Birleştirme hatası: ' + (err.error || 'Bilinmeyen hata'), 'error');
                return;
            }
            const blob = await res.blob();
            if (blob.size === 0) {
                showToast('Birleştirme sonucu boş döndü', 'error');
                return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Birlesik_Rapor_${isEmriId}_${Date.now()}.pdf`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 1000);
            showToast('PDF başarıyla birleştirildi ve indirildi!', 'success');
            closePdfBirlestirModal();
        } else {
            let errMsg = 'Bilinmeyen hata';
            try {
                const err = await res.json();
                errMsg = err.error || errMsg;
            } catch(e) {
                errMsg = 'HTTP ' + res.status;
            }
            showToast('Birleştirme hatası: ' + errMsg, 'error');
        }
    } catch (error) {
        hideLoading();
        console.error('PDF birleştirme hatası:', error);
        showToast('Birleştirme hatası: ' + error.message, 'error');
    }
}

// Raporlar sayfasından PDF birleştir (iş emri dosyalarını yükleyip modalı aç)
async function raporlarPdfBirlestirModal(isEmriId, isEmriNo) {
    try {
        showLoading();
        const res = await authenticatedFetch(`${API_BASE}/is-emirleri/${isEmriId}/dosyalar`);
        if (!res.ok) throw new Error('Dosyalar yüklenemedi');
        isEmriDosyaData = await res.json();
        hideLoading();
        pdfBirlestirModalRender(isEmriId);
    } catch (error) {
        hideLoading();
        console.error('Dosya yükleme hatası:', error);
        showToast('Dosyalar yüklenirken hata: ' + error.message, 'error');
    }
}

// ===================== RAPORLAR MODÜLÜ SONU =====================

// ========================================
// ÇIKIŞ FONKSİYONU
// ========================================

function sistemdenCik() {
    // Tüm localStorage'ı temizle
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userId');
    localStorage.removeItem('userName');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userKategori');
    localStorage.removeItem('loginType');

    // Login sayfasına yönlendir
    window.location.href = '/login.html';
}

// ========================================

console.log(`
%c🏭 PERİYODİK MUAYENE YÖNETİM SİSTEMİ
%cv1.0.0 - ÖNDER MUAYENE KURULUŞU

%cMüşteri, Teklif ve Muayene Modülü
%cGeliştirici: KGM Dijital - Abdulkadir IŞIK
%cDurum: Aktif ✅
`,
    'color: #2C5F8D; font-size: 20px; font-weight: bold;',
    'color: #FF8C42; font-size: 14px;',
    'color: #666; font-size: 12px;',
    'color: #666; font-size: 12px;',
    'color: #28a745; font-size: 12px; font-weight: bold;'
);
