// --- Инициализация Telegram ---
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }
else console.warn('Telegram WebApp SDK не загружен');

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
    const DECODE_INTERVAL = 150; // мс
    const ROI_RATIO = 0.6;
    let cameras = [];
    let currentCamIdx = -1;
    let zxingReady = false; // флаг загрузки

    // --- UI ---
    function setStatus(text, error = false) {
        scanStatus.textContent = text;
        scanStatus.style.background = error ? 'rgba(220,53,69,0.9)' : 'rgba(0,0,0,0.7)';
    }
    function setResult(text) {
        resultText.textContent = text || 'Отсканированный код появится здесь';
        sendBtn.style.display = text ? 'inline-block' : 'none';
    }

    // --- ЗАГРУЗКА ДВИЖКА (с fallback) ---
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

    let readBarcodesFn = null;

    // --- Камера ---
    async function refreshCameras() {
        // прогревочный запрос, чтобы заполнить labels
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
        const nonFront = cameras
            .map((d, i) => ({ d, i }))
            .filter(({ d }) => !/front|user|face/i.test(d.label));
        if (nonFront.length) return nonFront[nonFront.length - 1].i;
        return cameras.length > 1 ? cameras.length - 1 : 0;
    }

    async function openCamera(index) {
        const cam = cameras[index];
        if (!cam) throw new Error('Камера не найдена');
        const constraints = {
            video: {
                deviceId: { exact: cam.deviceId },
                width: { ideal: 1280 },
                height: { ideal: 720 },
                advanced: [{ focusMode: 'continuous' }]
            }
        };
        return await navigator.mediaDevices.getUserMedia(constraints);
    }

    // --- Декодирование ---
    function decodeLoop() {
        if (!isScanning) return;
        decodeLoopId = requestAnimationFrame(decodeLoop);

        const now = performance.now();
        if (now - lastDecodeTime < DECODE_INTERVAL) return;
        if (video.readyState < video.HAVE_CURRENT_DATA) return;
        lastDecodeTime = now;

        const vw = video.videoWidth, vh = video.videoHeight;
        if (!vw || !vh) return;

        const cropW = vw * ROI_RATIO, cropH = vh * ROI_RATIO;
        const sx = (vw - cropW) / 2, sy = (vh - cropH) / 2;

        canvas.width = cropW;
        canvas.height = cropH;
        ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, cropW, cropH);

        let imageData;
        try {
            imageData = ctx.getImageData(0, 0, cropW, cropH);
        } catch (e) { return; }

        if (!readBarcodesFn) return; // если движок не загружен – ничего не делаем

        readBarcodesFn(imageData, {
            formats: ['DataMatrix'],
            tryHarder: true,
            maxSymbols: 1 // правильное имя параметра!
        }).then(results => {
            if (!isScanning) return;
            if (results && results.length > 0 && results[0].text) {
                const text = results[0].text;
                setResult(text);
                setStatus('✅ Код найден!');
                stopScanning();
            }
        }).catch(err => {
            // тихо игнорируем ошибки (они часто от NotFound)
        });
    }

    // --- Запуск ---
    async function startScanning() {
        if (isScanning) return;
        try {
            setStatus('⏳ Запуск...');
            startBtn.disabled = true;

            // 1) Загружаем движок (если ещё не загружен)
            if (!readBarcodesFn) {
                setStatus('⏳ Загрузка движка...');
                readBarcodesFn = await loadZXing();
                zxingReady = true;
            }

            // 2) Получаем камеры
            await refreshCameras();
            if (!cameras.length) throw new Error('Камер не найдено');

            if (currentCamIdx === -1) currentCamIdx = pickBackIndex();
            const newStream = await openCamera(currentCamIdx);
            stream = newStream;
            video.srcObject = stream;
            await video.play();

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

    // --- Отправка ---
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