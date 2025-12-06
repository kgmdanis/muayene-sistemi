const https = require('https');
const fs = require('fs');
const path = require('path');

// Roboto fontunu indir (Google Fonts'tan)
const fontUrl = 'https://github.com/google/fonts/raw/main/ofl/roboto/Roboto-Regular.ttf';
const boldFontUrl = 'https://github.com/google/fonts/raw/main/ofl/roboto/Roboto-Bold.ttf';

const fontsDir = path.join(__dirname, 'fonts');

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // Redirect durumunda yeni URL'ye git
                https.get(response.headers.location, (response) => {
                    response.pipe(file);
                    file.on('finish', () => {
                        file.close(resolve);
                    });
                }).on('error', reject);
            } else {
                response.pipe(file);
                file.on('finish', () => {
                    file.close(resolve);
                });
            }
        }).on('error', reject);
    });
}

async function downloadFonts() {
    try {
        console.log('Fontlar indiriliyor...');
        
        await downloadFile(fontUrl, path.join(fontsDir, 'Roboto-Regular.ttf'));
        console.log('Regular font indirildi');
        
        await downloadFile(boldFontUrl, path.join(fontsDir, 'Roboto-Bold.ttf'));
        console.log('Bold font indirildi');
        
        console.log('Tüm fontlar başarıyla indirildi!');
    } catch (error) {
        console.error('Font indirme hatası:', error);
    }
}

downloadFonts();