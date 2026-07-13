// --- Инициализация Telegram ---
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }
<<<<<<< HEAD
else console.warn('Telegram Web App SDK не загружен');
=======
else console.warn('Telegram WebApp SDK не загружен');
>>>>>>> fc728c5 (Initial commit)

document.addEventListener('DOMContentLoaded', function() {

    // --- Элементы ---
    const video = document.getElementById('video');
    const canvas = document.getElementById('capture-canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const sendBtn = document.getElementById('send-data-btn');
    const resultText = document.getElementById('result-text');
    const scanStatus = document.getElementById('scan-status');
    const switchBtn = document.getElementById('switch-camera-btn');
    const scanFrame = document.getElementById('scan-frame');

    // --- Состояние ---
    let isScanning = false;
    let stream = null;
    let decodeLoopId = null;
    let lastDecodeTime = 0;
<<<<<<< HEAD
    const DECODE_INTERVAL = 100; // 10 кадров/сек
    // Уменьшенная область интереса – только центральные 45% кадра
    const ROI_RATIO = 0.45;
=======
    const DECODE_INTERVAL = 100; // чаще — 10 кадров/сек
    const ROI_RATIO = 0.65; // чуть больше область
>>>>>>> fc728c5 (Initial commit)
    let cameras = [];
    let currentCamIdx = -1;
    let readBarcodesFn = null;

    // --- UI ---
    function setStatus(text, error = false) {
        scanStatus.textContent = text;
        scanStatus.style.background = error ? 'rgba(220,53,69,0.9)' : 'rgba(0,0,0,0.7)';
    }
    function setResult(text) {
        resultText.textContent = text || 'Отсканированный код появится здесь';
        sendBtn.style.display = text ? 'inline-block' : 'none';
        if (text) {
            startBtn.disabled = false;
            stopBtn.disabled = true;
        }
    }

<<<<<<< HEAD
    // --- Загрузка движка (с fallback) ---
=======
    // --- Загрузка движка (как раньше) ---
>>>>>>> fc728c5 (Initial commit)
    async function loadZXing() {
        const urls = [
            'https://esm.sh/zxing-wasm@2/reader',
            'https://cdn.jsdelivr.net/npm/zxing-wasm@2/dist/reader/index.js',
            'https://unpkg.com/zxing-wasm@2/dist/reader/index.js'
        ];
        for (const url of urls) {
            try {
                const module = await import(url);
                if (module && typeof module.readBarcodes === 'function') {
                    console.log('✅ zxing-wasm загружен через', url);
                    return module.readBarcodes;
                }
            } catch (e) {
                console.warn('❌ не удалось загрузить:', url, e);
            }
        }
        throw new Error('Не удалось загрузить zxing-wasm ни с одного CDN');
    }

<<<<<<< HEAD
    // --- Камера ---
=======
    // --- Камера (как раньше) ---
>>>>>>> fc728c5 (Initial commit)
    async function refreshCameras() {
        try {
            const warm = await navigator.mediaDevices.getUserMedia({ video: true });
            warm.getTracks().forEach(t => t.stop());
        } catch {}
        const devices = await navigator.mediaDevices.enumerateDevices();
        cameras = devices.filter(d => d.kind === 'videoinput');
        return cameras;
    }

    function pickBackIndex() {
        let idx = cameras.findIndex(d => /back|rear|environment/i.test(d.label));
        if (idx !== -1) return idx;
        const nonFront = cameras.map((d, i) => ({ d, i })).filter(({ d }) => !/front|user|face/i.test(d.label));
        if (nonFront.length) return nonFront[nonFront.length - 1].i;
        return cameras.length > 1 ? cameras.length - 1 : 0;
    }

    async function openCamera(index) {
        const cam = cameras[index];
        if (!cam) throw new Error('Камера не найдена');
        const constraints = {
            video: {
                deviceId: { exact: cam.deviceId },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
<<<<<<< HEAD
                // Явно запрашиваем непрерывную фокусировку (если поддерживается)
=======
>>>>>>> fc728c5 (Initial commit)
                advanced: [{ focusMode: 'continuous' }]
            }
        };
        return await navigator.mediaDevices.getUserMedia(constraints);
    }

<<<<<<< HEAD
    // --- Декодирование с улучшенной предобработкой и новыми параметрами ---
=======
    // --- Декодирование с улучшенной предобработкой ---
>>>>>>> fc728c5 (Initial commit)
    function decodeLoop() {
        if (!isScanning) return;
        decodeLoopId = requestAnimationFrame(decodeLoop);

        const now = performance.now();
        if (now - lastDecodeTime < DECODE_INTERVAL) return;
        if (video.readyState < video.HAVE_CURRENT_DATA) return;
        lastDecodeTime = now;

        const vw = video.videoWidth, vh = video.videoHeight;
        if (!vw || !vh) return;

<<<<<<< HEAD
        // Вырезаем центральную область ROI_RATIO
=======
>>>>>>> fc728c5 (Initial commit)
        const cropW = vw * ROI_RATIO, cropH = vh * ROI_RATIO;
        const sx = (vw - cropW) / 2, sy = (vh - cropH) / 2;

        canvas.width = cropW;
        canvas.height = cropH;
        ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, cropW, cropH);

<<<<<<< HEAD
        // Повышаем контраст и бинаризация (чёрно-белое)
        const imageData = ctx.getImageData(0, 0, cropW, cropH);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
=======
        // Повышаем контраст и яркость (простая бинаризация)
        const imageData = ctx.getImageData(0, 0, cropW, cropH);
        const data = imageData.data;
        // Упрощаем: преобразуем в оттенки серого и повышаем контраст
        for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
            // Контраст: если светлее порога — белый, иначе чёрный (адаптивный порог)
            // Простой вариант: порог = 128
>>>>>>> fc728c5 (Initial commit)
            const val = gray > 128 ? 255 : 0;
            data[i] = data[i+1] = data[i+2] = val;
        }
        ctx.putImageData(imageData, 0, 0);

<<<<<<< HEAD
        const processedImageData = ctx.getImageData(0, 0, cropW, cropH);
        if (!readBarcodesFn) return;

        // Запускаем декодирование с расширенными параметрами
        readBarcodesFn(processedImageData, {
            formats: ['DataMatrix'],
            tryHarder: true,      // усиленный поиск
            tryRotate: true,      // попытка декодирования при повороте
            tryDenoise: true,     // попытка подавления шума
            maxSymbols: 1,
=======
        // Снова читаем уже обработанное изображение
        const processedImageData = ctx.getImageData(0, 0, cropW, cropH);

        if (!readBarcodesFn) return;

        readBarcodesFn(processedImageData, {
            formats: ['DataMatrix'],
            tryHarder: true,
            maxSymbols: 1,
            // Дополнительные параметры для улучшения
            returnErrors: false,
            // Увеличение чувствительности
            barcodeFormat: 'DataMatrix'
>>>>>>> fc728c5 (Initial commit)
        }).then(results => {
            if (!isScanning) return;
            if (results && results.length > 0 && results[0].text) {
                const text = results[0].text;
                setResult(text);
                setStatus('✅ Код найден!');
<<<<<<< HEAD
                // Останавливаем сканирование после успеха, чтобы не тратить ресурсы
                stopScanning();
                // Но оставляем кнопку "Запустить" активной для повторного сканирования
=======
                // Не останавливаем автоматически — пусть пользователь сам нажмёт "Стоп"
                // либо можно остановить, но тогда нужно снова запускать для повторного скана
                // Я предлагаю остановить, чтобы не было множественных срабатываний
                stopScanning();
                // Но после остановки показываем "Стоп" отключённой, а "Запустить" активной
>>>>>>> fc728c5 (Initial commit)
                startBtn.disabled = false;
                stopBtn.disabled = true;
            }
        }).catch(err => {
<<<<<<< HEAD
            // Ошибки игнорируем (обычно это "не найден код")
=======
            // игнорируем
>>>>>>> fc728c5 (Initial commit)
        });
    }

    // --- Запуск ---
    async function startScanning() {
        if (isScanning) return;
        try {
            setStatus('⏳ Запуск...');
            startBtn.disabled = true;

            if (!readBarcodesFn) {
                setStatus('⏳ Загрузка движка...');
                readBarcodesFn = await loadZXing();
            }

            await refreshCameras();
            if (!cameras.length) throw new Error('Камер не найдено');

            if (currentCamIdx === -1) currentCamIdx = pickBackIndex();
            const newStream = await openCamera(currentCamIdx);
            stream = newStream;
            video.srcObject = stream;
            await video.play();
<<<<<<< HEAD

            // Попытка принудительно установить фокус (если трек поддерживает)
            try {
                const track = stream.getVideoTracks()[0];
                if (track && track.applyConstraints) {
                    await track.applyConstraints({
                        advanced: [{ focusMode: 'continuous' }]
                    });
                }
            } catch (e) {
                console.warn('Не удалось применить focusMode:', e);
            }
=======
>>>>>>> fc728c5 (Initial commit)

            isScanning = true;
            stopBtn.disabled = false;
            scanFrame.style.display = 'block';
            switchBtn.style.display = cameras.length > 1 ? 'inline-block' : 'none';
            setStatus('🔍 Наведите на Data Matrix');

            lastDecodeTime = 0;
            decodeLoop();

        } catch (err) {
            console.error('Ошибка запуска:', err);
            setStatus('❌ ' + err.message, true);
            isScanning = false;
            startBtn.disabled = false;
            stopBtn.disabled = true;
        }
    }

    // --- Остановка ---
    function stopScanning() {
        isScanning = false;
        if (decodeLoopId) { cancelAnimationFrame(decodeLoopId); decodeLoopId = null; }
        if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
        video.srcObject = null;
        scanFrame.style.display = 'none';
        startBtn.disabled = false;
        stopBtn.disabled = true;
        if (scanStatus.textContent !== '✅ Код найден!') setStatus('⏹ Остановлен');
    }

    // --- Переключение камеры ---
    async function switchCamera() {
        const wasScanning = isScanning;
        if (wasScanning) stopScanning();
        if (!cameras.length) await refreshCameras();
        if (cameras.length < 2) return;
        currentCamIdx = (currentCamIdx + 1) % cameras.length;
        await new Promise(r => setTimeout(r, 300));
        await startScanning();
    }

<<<<<<< HEAD
    // --- Отправка в Telegram ---
=======
    // --- Отправка ---
>>>>>>> fc728c5 (Initial commit)
    function sendDataToTelegram(data) {
        if (!data) return;
        if (tg) {
            try {
                tg.sendData(data);
                if (tg.showPopup) {
                    tg.showPopup({ title: '✅ Отправлено', message: `"${data}" отправлено.`, buttons: [{ type: 'ok' }] });
                } else alert('Отправлено!');
            } catch (e) { alert('Ошибка: ' + e.message); }
        } else {
            alert('Данные: ' + data);
        }
        // После отправки можно очистить результат или оставить
        // Пока оставляем для возможности повторно отправить
    }

    // --- Обработчики ---
    startBtn.addEventListener('click', startScanning);
    stopBtn.addEventListener('click', stopScanning);
    switchBtn.addEventListener('click', switchCamera);
    sendBtn.addEventListener('click', () => {
        const res = resultText.textContent;
        if (res && res !== 'Отсканированный код появится здесь') sendDataToTelegram(res);
        else alert('Сначала отсканируйте');
    });
    window.addEventListener('beforeunload', () => { if (isScanning) stopScanning(); });
    if (tg) tg.onEvent('viewportChanged', () => { if (tg.isExpanded === false && isScanning) stopScanning(); });

    // --- Инициализация ---
    setStatus('📷 Готов');
    console.log('Scanner initialized. Нажмите Запустить.');
});