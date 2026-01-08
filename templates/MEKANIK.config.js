/**
 * MEKANIK Rapor Konfigürasyonu
 *
 * HİÇBİR HESAPLAMA YOK
 * Sadece kontrol maddeleri: Evet/Hayır, Uygun/Değil
 * Genel sonuç formdan alınır
 */

module.exports = {
    reportType: 'MEKANIK',
    title: 'MEKANİK TESİSAT PERİYODİK KONTROL RAPORU',

    // PDF'de render edilecek bölümler (sıralı)
    sections: [
        {
            type: 'checklist',
            title: 'KONTROL MADDELERİ',
            dataKey: 'kontrolMaddeleri'
        },
        {
            type: 'result'
        },
        {
            type: 'notes',
            items: [
                'Kontrol İş Ekipmanlarının Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliğine göre yapılmıştır.',
                'Periyodik kontrol süresi ilgili mevzuata göre belirlenir.',
                'Uygun olmayan maddeler için gerekli düzeltici faaliyetler yapılmalıdır.'
            ]
        }
    ],

    // Varsayılan değerler
    defaults: {
        gecerlilikAy: 12
    },

    /**
     * Hesaplama YOK - sonuç doğrudan formdan alınır
     * Null döndürünce orchestrator formData.genelSonuc kullanır
     */
    calculate: null
};
