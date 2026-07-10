const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const video = document.getElementById('video');
const resultP = document.getElementById('result');
const tg = window.Telegram.WebApp;
tg.ready();

let stream = null;
let scanning = false;
let lastResult = '';
let animationId = null;

// Инициализация ZXing (только Data Matrix)
const hints = new Map();
hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.DATA_MATRIX]);
const reader = new ZXing.BrowserMultiFormatReader();
reader.hints = hints;

// Функция обработки кадра
function tick() {
    if (!scanning) return;

    try {
        // Пропускаем, если видео ещё не готово
        if (video.readyState !== video.HAVE_ENOUGH_DATA) {
            animationId = requestAnimationFrame(tick);
            return;
        }

        // Захватываем текущий кадр в canvas низкого разрешения (быстро)
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const result = reader.decode(imageData);
        if (result && result.text !== lastResult) {
            lastResult = result.text;
            resultP.innerText = '✅ Считано: ' + result.text;
            stopScanning();
            return;
        }
    } catch (err) {
        // Не распознано — идём дальше
    }

    animationId = requestAnimationFrame(tick);
}

// Запуск камеры и сканирования
async function startScanning() {
    // Сначала пробуем очень мягко запросить камеру
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: false
        });

        video.srcObject = stream;
        video.style.display = 'block';
        startBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';
        resultP.innerText = 'Наведите на Data Matrix';
        scanning = true;
        lastResult = '';
        animationId = requestAnimationFrame(tick);
    } catch (err) {
        // Если не удалось — сообщаем и просим нажать ещё раз (на некоторых устройствах нужен прямой жест)
        resultP.innerText = '⚠️ Камера недоступна. Нажмите кнопку ещё раз или разрешите доступ в настройках.';
        console.error(err);
    }
}

// Остановка
function stopScanning() {
    scanning = false;
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    video.style.display = 'none';
    stopBtn.style.display = 'none';
    startBtn.style.display = 'inline-block';
}

// Обработчики
startBtn.addEventListener('click', startScanning);
stopBtn.addEventListener('click', stopScanning);

// При загрузке страницы проверяем поддержку камеры
window.addEventListener('load', () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        startBtn.disabled = true;
        resultP.innerText = 'Ваше устройство не поддерживает камеру.';
    }
});