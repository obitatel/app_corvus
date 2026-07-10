const scanBtn = document.getElementById('scan-btn');
const resultP = document.getElementById('result');
const tg = window.Telegram.WebApp;
tg.ready();

// Проверяем, что ZXing загрузился
if (typeof ZXing === 'undefined' || !ZXing.BrowserReader || !ZXing.DecodeHintType || !ZXing.BarcodeFormat) {
    resultP.innerText = '❌ Ошибка загрузки библиотеки распознавания.';
    scanBtn.disabled = true;
} else {
    // Настройка сканера: только Data Matrix
    const hints = new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.DATA_MATRIX]);
    const reader = new ZXing.BrowserReader();
    reader.hints = hints;

    scanBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';

        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            resultP.innerText = '⏳ Сканирую...';
            const img = new Image();
            img.src = URL.createObjectURL(file);

            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                try {
                    const result = reader.decode(imageData);
                    resultP.innerText = '✅ Считано: ' + result.text;
                } catch (err) {
                    resultP.innerText = '❌ Не найден. Снимите код крупнее, без бликов.';
                }
            };

            img.onerror = () => {
                resultP.innerText = '❌ Ошибка загрузки изображения.';
            };
        });

        input.click();
    });
}