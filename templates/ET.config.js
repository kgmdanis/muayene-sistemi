/**
 * ET (Elektrik Topraklama) Rapor Konfigürasyonu
 *
 * Hesaplama mantığı (Saha formundan):
 * - Eğri Çarpanı: B=5, C=10, D=15
 * - Ia = In × Çarpan (Açma akımı)
 * - Ik1 = 230 / Zx (Toprak kısa devre akımı)
 * - Zs hesaplaması:
 *   - TT şebeke: RCD 30mA varsa 200Ω, yoksa 50/Ia
 *   - TN şebeke: 230/Ia
 * - Sonuç: Zx <= Zs veya (RCD var ve TΔ <= 200ms) ise UYGUN
 */

module.exports = {
    reportType: 'ET',
    title: 'ELEKTRİK TESİSATI TOPRAKLAMA ÖLÇÜM RAPORU',

    sections: [
        {
            type: 'info',
            title: 'ÖLÇÜM BİLGİLERİ',
            fields: ['sebeke_tipi', 'sebeke_gerilimi', 'zemin_durumu', 'hava_sicakligi']
        },
        {
            type: 'measurements',
            title: 'TOPRAKLAMA ÖLÇÜM SONUÇLARI',
            dataKey: 'olcumler',
            columns: [
                { key: 'sira', label: 'N', width: 30 },
                { key: 'nokta_adi', label: 'Ölçüm Noktası', width: 90 },
                { key: 'in_amper', label: 'In (A)', width: 45 },
                { key: 'egri_tipi', label: 'Tip', width: 35 },
                { key: 'ia_amper', label: 'Ia (A)', width: 50 },
                { key: 'zx_ohm', label: 'Zx (Ω)', width: 50 },
                { key: 'zs_ohm', label: 'Zs (Ω)', width: 50 },
                { key: 'ik1_amper', label: 'Ik1 (A)', width: 50 },
                { key: 'rcd_idn_ma', label: 'RCD', width: 40 },
                { key: 'tda_ms', label: 'TΔ', width: 35 },
                { key: 'sonuc', label: 'Sonuç', width: 55 }
            ]
        },
        {
            type: 'defects',
            title: 'KUSUR AÇIKLAMALARI',
            dataKey: 'kusur_aciklamalari'
        },
        {
            type: 'result'
        },
        {
            type: 'notes',
            items: [
                'Ölçümler İş Ekipmanlarının Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliğine göre yapılmıştır.',
                'TS HD 60364-4-41 ve TS HD 60364-6 standartlarına uygun olarak kontrol edilmiştir.',
                'Topraklama direnci ölçümleri 3 kutuplu toprak direnci ölçüm cihazı ile yapılmıştır.',
                'Zx: Ölçülen çevrim empedansı, Zs: Sınır çevrim empedansı',
                'Ia: Açma akımı (B:5xIn, C:10xIn, D:15xIn)',
                'Periyodik kontrol süresi 1 yıldır.'
            ]
        }
    ],

    // Eğri çarpanları
    egriCarpan: { B: 5, C: 10, D: 15 },

    // Varsayılan değerler
    defaults: {
        sebekeTipi: 'TT',
        sebekeGerilimi: 230,
        gecerlilikAy: 12
    },

    /**
     * Hesaplama fonksiyonu
     */
    calculate(formData) {
        const olcumler = formData.olcumler || [];
        const sebekeTipi = formData.sebeke_tipi || 'TT';

        let uygunSayisi = 0;
        const toplamSayisi = olcumler.length;

        const hesaplananOlcumler = olcumler.map((o, index) => {
            const inAmper = parseFloat(o.in_amper) || 0;
            const egriTipi = o.egri_tipi || 'C';
            const zxOhm = parseFloat(o.zx_ohm) || 0;
            const rcdIdnMa = parseFloat(o.rcd_idn_ma) || 0;
            const tdaMs = parseFloat(o.tda_ms) || 0;

            // Çarpan ve Ia hesapla
            const carpan = this.egriCarpan[egriTipi] || 10;
            const iaAmper = inAmper * carpan;

            // Zs hesapla (şebeke tipine göre)
            let zsOhm;
            if (sebekeTipi === 'TT') {
                if (rcdIdnMa && rcdIdnMa <= 30) {
                    zsOhm = 200;
                } else if (rcdIdnMa) {
                    zsOhm = 50 / (rcdIdnMa / 1000);
                } else {
                    zsOhm = iaAmper > 0 ? 50 / iaAmper : 0;
                }
            } else {
                // TN şebeke
                zsOhm = iaAmper > 0 ? 230 / iaAmper : 0;
            }

            // Ik1 hesapla
            const ik1Amper = zxOhm > 0 ? 230 / zxOhm : 0;

            // Sonuç belirle
            let sonuc;
            if (!zxOhm || zxOhm === 0) {
                sonuc = 'UYGUN_DEGIL';
            } else if (zxOhm <= zsOhm) {
                sonuc = 'UYGUN';
            } else if (rcdIdnMa && tdaMs && tdaMs <= 200) {
                sonuc = 'UYGUN';
            } else {
                sonuc = 'UYGUN_DEGIL';
            }

            if (sonuc === 'UYGUN') uygunSayisi++;

            return {
                sira: o.sira || (index + 1),
                nokta_adi: o.nokta_adi || `Nokta-${index + 1}`,
                in_amper: inAmper.toFixed(0),
                egri_tipi: egriTipi,
                ia_amper: iaAmper.toFixed(1),
                zx_ohm: zxOhm.toFixed(2),
                zs_ohm: zsOhm.toFixed(2),
                ik1_amper: ik1Amper.toFixed(1),
                rcd_idn_ma: rcdIdnMa || '-',
                tda_ms: tdaMs || '-',
                sonuc
            };
        });

        // Genel sonuç
        const genelSonuc = formData.genelSonuc || (uygunSayisi === toplamSayisi ? 'UYGUN' : 'UYGUN_DEGIL');

        return {
            olcumler: hesaplananOlcumler,
            sonuc: genelSonuc,
            aciklama: `${toplamSayisi} noktadan ${uygunSayisi} tanesi uygun.`,
            uygunSayisi,
            toplamSayisi,
            sebekeTipi,
            zeminDurumu: formData.zemin_durumu,
            kusurAciklamalari: formData.kusur_aciklamalari
        };
    }
};
