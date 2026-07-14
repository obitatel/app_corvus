// --- Инициализация Telegram ---
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }
else console.warn('Telegram Web App SDK не загружен');

document.addEventListener('DOMContentLoaded', function() {

    // --- Элементы ---
    const video = document.getElementById('video');
    const videoContainer = document.getElementById('video-container');
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
    let videoTrack = null;
    let decodeLoopId = null;
    let lastDecodeTime = 0;
    const DECODE_INTERVAL = 100;
    const ROI_RATIO = 0.45;
    let cameras = [];
    let currentCamIdx = -1;
    let readBarcodesFn = null;
    let focusSupported = false; // флаг поддержки focusMode

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

    // --- Загрузка движка (с fallback) ---
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

    // --- Камера ---
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

    // --- Функция для применения фокуса с перезапуском при необходимости ---
    async function applyFocusWithRetry(track, maxRetries = 2) {
        if (!track) return false;
        try {
            const caps = track.getCapabilities ? track.getCapabilities() : {};
            if (caps.focusMode && caps.focusMode.includes('continuous')) {
                await track.applyConstraints({
                    advanced: [{ focusMode: 'continuous' }]
                });
                focusSupported = true;
                return true;
            } else {
                // Если focusMode не поддерживается – пробуем manual (некоторые камеры)
                if (caps.focusMode && caps.focusMode.includes('manual')) {
                    await track.applyConstraints({
                        advanced: [{ focusMode: 'manual', focusDistance: 1.0 }]
                    });
                    focusSupported = true;
                    return true;
                }
                focusSupported = false;
                return false;
            }
        } catch (e) {
            console.warn('Ошибка применения фокуса:', e);
            if (maxRetries > 0) {
                // Пробуем перезапустить трек
                const newStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        deviceId: { exact: track.getSettings().deviceId },
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        frameRate: { ideal: 30 }
                    }
                });
                const newTrack = newStream.getVideoTracks()[0];
                // Заменяем поток
                const oldStream = stream;
                stream = newStream;
                videoTrack = newTrack;
                video.srcObject = newStream;
                await video.play();
                oldStream.getTracks().forEach(t => t.stop());
                // Повторяем попытку
                return await applyFocusWithRetry(newTrack, maxRetries - 1);
            }
            return false;
        }
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

        const imageData = ctx.getImageData(0, 0, cropW, cropH);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
            const val = gray > 128 ? 255 : 0;
            data[i] = data[i+1] = data[i+2] = val;
        }
        ctx.putImageData(imageData, 0, 0);

        const processedImageData = ctx.getImageData(0, 0, cropW, cropH);
        if (!readBarcodesFn) return;

        readBarcodesFn(processedImageData, {
            formats: ['DataMatrix'],
            tryHarder: true,
            tryRotate: true,
            tryDenoise: true,
            maxSymbols: 1,
        }).then(results => {
            if (!isScanning) return;
            if (results && results.length > 0 && results[0].text) {
                const text = results[0].text;
                setResult(text);
                setStatus('✅ Код найден!');
                stopScanning();
                startBtn.disabled = false;
                stopBtn.disabled = true;
            }
        }).catch(err => {});
    }

    // --- Tap-to-focus ---
    videoContainer.addEventListener('click', async (e) => {
        if (!isScanning || !videoTrack) return;
        if (!focusSupported) {
            setStatus('❌ Фокус не поддерживается', true);
            return;
        }
        const rect = video.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        try {
            await videoTrack.applyConstraints({
                advanced: [{ focusMode: 'manual', pointsOfInterest: [{ x, y }] }]
            });
            setStatus('🔍 Фокус установлен');
            setTimeout(async () => {
                try {
                    await videoTrack.applyConstraints({
                        advanced: [{ focusMode: 'continuous' }]
                    });
                    setStatus('🔍 Наведите на Data Matrix');
                } catch {}
            }, 1500);
        } catch (e) {
            console.warn('Tap-to-focus не поддерживается:', e);
            setStatus('❌ Tap-focus недоступен', true);
        }
    });

    // --- Запуск (с принудительным перезапуском) ---
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
            const cam = cameras[currentCamIdx];

            // Первый запуск
            let constraints = {
                video: {
                    deviceId: { exact: cam.deviceId },
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 },
                    advanced: [{ focusMode: 'continuous' }]
                }
            };
            let newStream = await navigator.mediaDevices.getUserMedia(constraints);
            stream = newStream;
            videoTrack = stream.getVideoTracks()[0];
            video.srcObject = stream;
            await video.play();

            // Даём 500ms на инициализацию
            await new Promise(r => setTimeout(r, 500));

            // Пытаемся применить фокус с перезапуском
            const focusOk = await applyFocusWithRetry(videoTrack, 2);

            if (focusOk) {
                setStatus('🔍 Наведите на Data Matrix');
            } else {
                // Если фокус не поддерживается, сообщаем пользователю о tap-to-focus
                setStatus('📌 Нажмите на экран для фокуса');
            }

            isScanning = true;
            stopBtn.disabled = false;
            scanFrame.style.display = 'block';
            switchBtn.style.display = cameras.length > 1 ? 'inline-block' : 'none';

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
        if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; videoTrack = null; }
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

    // --- Отправка в Telegram ---
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