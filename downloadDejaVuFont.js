const https = require('https');
const fs = require('fs');
const path = require('path');

// DejaVu fontunu indir (Türkçe karakter desteği olan)
const fontUrl = 'https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.zip';

const fontsDir = path.join(__dirname, 'fonts');

// Basit bir alternatif: sistem fontunu kullan
// Ubuntu/Debian sistemlerde DejaVu fontları genellikle yüklüdür
const systemFonts = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'
];

// Sistem fontlarını kopyala
let foundFont = false;
for (const fontPath of systemFonts) {
    if (fs.existsSync(fontPath)) {
        const fileName = path.basename(fontPath);
        const destPath = path.join(fontsDir, fileName);
        
        try {
            fs.copyFileSync(fontPath, destPath);
            console.log(`Font kopyalandı: ${fileName}`);
            foundFont = true;
        } catch (err) {
            console.error(`Font kopyalama hatası: ${err.message}`);
        }
    }
}

if (!foundFont) {
    console.log('Sistem fontları bulunamadı. Varsayılan PDF fontları kullanılacak.');
} else {
    console.log('Fontlar başarıyla hazırlandı!');
}