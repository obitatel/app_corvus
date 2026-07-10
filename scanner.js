const fileInput = document.getElementById('file-input');
const resultP = document.getElementById('result');
const tg = window.Telegram.WebApp;
tg.ready();

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return; // пользователь ничего не выбрал

    resultP.innerText = '⏳ Сканирую...';

    const img = new Image();
    img.src = URL.createObjectURL(file);

    img.onload = () => {
        // Создаём сканер Data Matrix внутри обработчика, когда ZXing точно загружен
        const hints = new Map();
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.DATA_MATRIX]);
        const reader = new ZXing.BrowserReader();
        reader.hints = hints;

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
            resultP.innerText = '❌ Data Matrix не найден. Сфотографируйте ближе и чётче, без бликов.';
        }
    };

    img.onerror = () => {
        resultP.innerText = '❌ Ошибка загрузки изображения.';
    };

    // Очищаем поле, чтобы можно было выбрать тот же файл повторно
    fileInput.value = '';
});