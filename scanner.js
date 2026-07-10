const startCameraBtn = document.getElementById('start-camera-btn');
const captureBtn = document.getElementById('capture-btn');
const fallbackUploadBtn = document.getElementById('fallback-upload');
const video = document.getElementById('video');
const resultP = document.getElementById('result');

let stream = null;
const tg = window.Telegram.WebApp;
tg.ready();

// ZXing reader только для Data Matrix
const hints = new Map();
hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.DATA_MATRIX]);
const reader = new ZXingBrowserReader();
reader.hints = hints;

// Функция анализа кадра (video → canvas → ZXing)
function captureAndDecode() {
    if (!stream) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    try {
        const result = reader.decode(imageData);
        resultP.innerText = '✅ ' + result.text;
    } catch (err) {
        resultP.innerText = '❌ Не удалось распознать. Попробуйте навести чётче.';
    }
}

// Запуск камеры
async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
        video.srcObject = stream;
        video.style.display = 'block';
        startCameraBtn.style.display = 'none';
        captureBtn.style.display = 'inline-block';
        resultP.innerText = 'Наведите на Data Matrix и нажмите «Распознать»';
    } catch (err) {
        console.error(err);
        resultP.innerText = '⚠️ Нет доступа к камере. Используйте загрузку фото.';
        startCameraBtn.style.display = 'none';
        fallbackUploadBtn.style.display = 'inline-block';
    }
}

// Запасной вариант: загрузка фото (без Cropper, сразу сканируем)
function fallbackUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
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
                resultP.innerText = '✅ ' + result.text;
            } catch (err) {
                resultP.innerText = '❌ Код не найден на фото. Попробуйте сфотографировать крупнее.';
            }
        };
    });
    input.click();
}

// Обработчики
startCameraBtn.addEventListener('click', startCamera);
captureBtn.addEventListener('click', captureAndDecode);
fallbackUploadBtn.addEventListener('click', fallbackUpload);

// Если камера не запустилась, кнопка загрузки видна по умолчанию (на случай, если getUserMedia сразу упал)
window.addEventListener('load', () => {
    // Пробуем тихо проверить доступ к камере (не запуская)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        startCameraBtn.style.display = 'none';
        fallbackUploadBtn.style.display = 'inline-block';
        resultP.innerText = 'Камера не поддерживается. Загрузите фото.';
    }
});