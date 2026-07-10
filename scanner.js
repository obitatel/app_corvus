const scanBtn = document.getElementById('scan-btn');
const cameraInput = document.getElementById('camera-input');
const resultP = document.getElementById('result');
const tg = window.Telegram.WebApp;
tg.ready();

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
        // Масштабирование до 800px по большей стороне
        const maxSize = 800;
        let width = img.width;
        let height = img.height;

        if (width > height && width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
        } else if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);

        try {
            const hints = new Map();
            hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.DATA_MATRIX]);
            const reader = new ZXing.BrowserMultiFormatReader();
            reader.hints = hints;

            const result = reader.decode(imageData);
            resultP.innerText = '✅ Считано: ' + result.text;
        } catch (err) {
            resultP.innerText = '❌ Код не распознан. Сфотографируйте ближе, крупнее и без бликов.';
        }
    };

    img.onerror = () => {
        resultP.innerText = '❌ Ошибка загрузки снимка.';
    };

    cameraInput.value = '';
});