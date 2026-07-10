const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const fallbackBtn = document.getElementById('fallback-btn');
const video = document.getElementById('video');
const resultP = document.getElementById('result');
const tg = window.Telegram.WebApp;
tg.ready();

let stream = null;
let scanning = false;
let lastResult = '';
let animationFrameId = null;

// ZXing reader (только Data Matrix)
const hints = new Map();
hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.DATA_MATRIX]);
const reader = new ZXing.BrowserReader();
reader.hints = hints;

// Функция анализа кадра (вызывается в requestAnimationFrame)
function tick() {
    if (!scanning || !stream) return;

    // Пропускаем кадры, если предыдущий анализ ещё не завершился (избегаем накопления)
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        animationFrameId = requestAnimationFrame(tick);
        return;
    }

    try {
        // Создаём маленький canvas для производительности
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = reader.decode(imageData);

        if (result && result.text !== lastResult) {
            lastResult = result.text;
            resultP.innerText = '✅ Считано: ' + result.text;
            stopCamera(); // автоматически остановить после успешного чтения
            return;
        }
    } catch (err) {
        // Не распознано — продолжаем
    }

    animationFrameId = requestAnimationFrame(tick);
}

// Запуск камеры и сканирования
async function startCamera() {
    // Пробуем сначала нативный сканер Telegram (вдруг обновился и теперь читает Data Matrix)
    if (typeof tg.showScanQrPopup === 'function') {
        resultP.innerText = 'Открывается нативный сканер...';
        tg.onEvent('qrTextReceived', (event) => {
            if (event.data) {
                resultP.innerText = '✅ Считано: ' + event.data;
                tg.closeScanQrPopup();
            }
        });
        tg.showScanQrPopup({ text: 'Наведите на Data Matrix' });
        // Если нативный сканер не сработает (не вернёт результат), пользователь просто закроет его, и мы включим камеру через некоторое время?
        // Сложно синхронизировать, поэтому нативный сканер используем как отдельную кнопку? Нет, лучше оставить как первую попытку, но если он не поддерживается, перейти к getUserMedia.
        // Но мы не можем узнать, закрыт ли попап без события. Поэтому проще убрать натив и сразу перейти к камере, раз он раньше не работал.
        // Пользователь сказал "загрузка фото не канает", но нативный сканер тоже не читал Data Matrix. Так что сразу переходим к getUserMedia.
    }

    // Если нативный недоступен или мы решили его пропустить, запускаем свою камеру
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
        animationFrameId = requestAnimationFrame(tick);
    } catch (err) {
        console.error(err);
        resultP.innerText = '⚠️ Нет доступа к камере. Используйте загрузку фото.';
        startBtn.style.display = 'none';
        fallbackBtn.style.display = 'inline-block';
    }
}

function stopCamera() {
    scanning = false;
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    video.style.display = 'none';
    stopBtn.style.display = 'none';
    startBtn.style.display = 'inline-block';
}

// Запасной вариант: загрузка фото (без обрезки, сразу анализ)
function fallbackUpload() {
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
                resultP.innerText = '❌ Data Matrix не найден. Сфотографируйте ближе и чётче.';
            }
        };
        img.onerror = () => { resultP.innerText = '❌ Ошибка загрузки изображения.'; };
    });
    input.click();
}

// Обработчики кнопок
startBtn.addEventListener('click', startCamera);
stopBtn.addEventListener('click', stopCamera);
fallbackBtn.addEventListener('click', fallbackUpload);

// Если камера не поддерживается, сразу показать fallback
if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    startBtn.style.display = 'none';
    fallbackBtn.style.display = 'inline-block';
    resultP.innerText = 'Камера недоступна. Загрузите фото.';
}