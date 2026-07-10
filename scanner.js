const scanBtn = document.getElementById('scan-btn');
const cameraInput = document.getElementById('camera-input');
const resultP = document.getElementById('result');
const tg = window.Telegram.WebApp;
tg.ready();

// При клике на кнопку открываем камеру через input
scanBtn.addEventListener('click', () => {
    cameraInput.click();
});

cameraInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    resultP.innerText = '⏳ Обрабатываю снимок...';

    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
        // Создаём сканер Data Matrix
        const hints = new Map();
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.DATA_MATRIX]);
        const reader = new ZXing.BrowserReader();
        reader.hints = hints;

        // Рисуем изображение на canvas
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
            resultP.innerText = '❌ Код не распознан. Попробуйте сфотографировать ближе и чётче, без бликов.';
        }
    };
    img.onerror = () => {
        resultP.innerText = '❌ Ошибка загрузки снимка.';
    };

    // Очищаем input для повторного использования
    cameraInput.value = '';
});