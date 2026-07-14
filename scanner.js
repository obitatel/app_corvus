// Ловим глобальные ошибки
window.addEventListener('error', e => console.error('Глобальная ошибка:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('Необработанный rejection:', e.reason));

// --- Инициализация Telegram ---
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
    console.log('Telegram WebApp инициализирован');
} else {
    console.warn('Telegram Web App SDK не загружен');
}

document.addEventListener('DOMContentLoaded', function() {

    // --- Элементы DOM ---
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
    let currentDeviceId = null;
    let readBarcodesFn = null;
    let focusSupported = false;
    let decodingInProgress = false;
    let lastDecodeErrorLog = 0;

    // Массив найденных кодов
    let foundCodes = [];
    let foundQR = false;
    let foundDM = false;

    // --- UI функции ---
    function setStatus(text, error = false) {
        scanStatus.textContent = text;
        scanStatus.style.background = error ? 'rgba(220,53,69,0.9)' : 'rgba(0,0,0,0.7)';
    }

    function updateSendButton() {
        // Показываем кнопку только если найдены оба кода
        const bothFound = foundQR && foundDM;
        sendBtn.style.display = bothFound ? 'inline-block' : 'none';
        if (bothFound) {
            sendBtn.textContent = '📤 Отправить оба кода';
        }
    }

    function setResult(codes) {
        if (!codes || codes.length === 0) {
            resultText.textContent = 'Отсканированный код появится здесь';
        } else {
            const lines = codes.map(c => `${c.format}: ${c.text}`).join('\n');
            resultText.textContent = lines;
        }
        updateSendButton();
    }

    // --- Загрузка движка zxing-wasm ---
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
        throw new Error('Не удалось загрузить zxing-wasm');
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

    function pickBackDeviceId() {
        let idx = cameras.findIndex(d => /back|rear|environment/i.test(d.label));
        if (idx !== -1) return cameras[idx].deviceId;
        const nonFront = cameras.filter(d => !/front|user|face/i.test(d.label));
        if (nonFront.length) return nonFront[nonFront.length - 1].deviceId;
        return cameras.length ? cameras[cameras.length - 1].deviceId : null;
    }

    // --- Фокус ---
    async function applyFocus(track) {
        if (!track) return false;
        try {
            const caps = track.getCapabilities ? track.getCapabilities() : {};
            if (caps.focusMode && caps.focusMode.includes('continuous')) {
                await track.applyConstraints({
                    advanced: [{ focusMode: 'continuous' }]
                });
                focusSupported = true;
                return true;
            } else if (caps.focusMode && caps.focusMode.includes('manual')) {
                await track.applyConstraints({
                    advanced: [{ focusMode: 'manual', focusDistance: 1.0 }]
                });
                focusSupported = true;
                return true;
            }
            focusSupported = false;
            return false;
        } catch (e) {
            console.warn('Ошибка применения фокуса:', e);
            focusSupported = false;
            return false;
        }
    }

    // --- Декодирование (основной цикл) ---
    function decodeLoop() {
        if (!isScanning) return;
        decodeLoopId = requestAnimationFrame(decodeLoop);

        const now = performance.now();
        if (now - lastDecodeTime < DECODE_INTERVAL) return;
        if (video.readyState < video.HAVE_CURRENT_DATA) return;
        lastDecodeTime = now;

        const vw = video.videoWidth, vh = video.videoHeight;
        if (!vw || !vh) return;

        if (decodingInProgress) return;

        const cropW = vw * ROI_RATIO, cropH = vh * ROI_RATIO;
        const sx = (vw - cropW) / 2, sy = (vh - cropH) / 2;

        canvas.width = cropW;
        canvas.height = cropH;
        ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, cropW, cropH);

        const imageData = ctx.getImageData(0, 0, cropW, cropH);
        if (!readBarcodesFn) return;

        decodingInProgress = true;
        readBarcodesFn(imageData, {
            formats: ['DataMatrix', 'QRCode'],
            tryHarder: true,
            tryRotate: true,
            tryInvert: true,
            tryDenoise: true,
            binarizer: 'LocalAverage',
            maxNumberOfSymbols: 2,
        }).then(results => {
            if (!isScanning) return;
            if (results && results.length > 0) {
                let newCodeFound = false;
                for (const result of results) {
                    const text = result.text;
                    const format = result.format;
                    const alreadyExists = foundCodes.some(c => c.text === text && c.format === format);
                    if (!alreadyExists) {
                        foundCodes.push({ text, format });
                        if (format === 'QRCode') foundQR = true;
                        else if (format === 'DataMatrix') foundDM = true;
                        newCodeFound = true;
                        console.log(`Найден новый код: ${format} -> ${text}`);
                    }
                }
                if (newCodeFound) {
                    setResult(foundCodes);
                    setStatus(`Найдено: ${foundCodes.length} код(а)`);
                    if (foundQR && foundDM) {
                        setStatus('✅ Найдены оба кода!');
                        stopScanning();
                        startBtn.disabled = false;
                        stopBtn.disabled = true;
                        return;
                    }
                }
            }
        }).catch(err => {
            const now = performance.now();
            if (now - lastDecodeErrorLog > 3000) {
                console.warn('Ошибка декодирования:', err);
                lastDecodeErrorLog = now;
            }
        }).finally(() => {
            decodingInProgress = false;
        });
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
                    setStatus('🔍 Наведите на Data Matrix / QR');
                } catch {}
            }, 1500);
        } catch (e) {
            console.warn('Tap-to-focus не поддерживается:', e);
            setStatus('❌ Tap-focus недоступен', true);
        }
    });

    // --- Запуск сканирования ---
    async function startScanning() {
        if (isScanning) return;
        try {
            // Сбрасываем найденные коды
            foundCodes = [];
            foundQR = false;
            foundDM = false;
            setResult([]);
            setStatus('⏳ Запуск...');
            startBtn.disabled = true;

            if (!readBarcodesFn) {
                setStatus('⏳ Загрузка движка...');
                readBarcodesFn = await loadZXing();
            }

            await refreshCameras();
            if (!cameras.length) throw new Error('Камер не найдено');

            if (!currentDeviceId || !cameras.some(c => c.deviceId === currentDeviceId)) {
                currentDeviceId = pickBackDeviceId();
            }
            const cam = cameras.find(c => c.deviceId === currentDeviceId);
            if (!cam) throw new Error('Выбранная камера недоступна');

            const constraints = {
                video: {
                    deviceId: { exact: cam.deviceId },
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                }
            };

            let tempStream = await navigator.mediaDevices.getUserMedia(constraints);
            tempStream.getTracks().forEach(t => t.stop());
            await new Promise(r => setTimeout(r, 150));

            stream = await navigator.mediaDevices.getUserMedia(constraints);
            videoTrack = stream.getVideoTracks()[0];
            video.srcObject = stream;
            await video.play();

            await applyFocus(videoTrack);

            isScanning = true;
            stopBtn.disabled = false;
            scanFrame.style.display = 'block';
            switchBtn.style.display = cameras.length > 1 ? 'inline-block' : 'none';

            if (focusSupported) {
                setStatus('🔍 Наведите на Data Matrix / QR');
            } else {
                setStatus('📌 Нажмите на экран для фокуса');
            }

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

    // --- Остановка сканирования ---
    function stopScanning() {
        isScanning = false;
        if (decodeLoopId) { cancelAnimationFrame(decodeLoopId); decodeLoopId = null; }
        if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; videoTrack = null; }
        video.srcObject = null;
        scanFrame.style.display = 'none';
        startBtn.disabled = false;
        stopBtn.disabled = true;
        if (scanStatus.textContent !== '✅ Найдены оба кода!' && scanStatus.textContent !== '✅ Код найден!') {
            setStatus('⏹ Остановлен');
        }
    }

    // --- Переключение камеры ---
    async function switchCamera() {
        const wasScanning = isScanning;
        if (wasScanning) stopScanning();

        await refreshCameras();
        if (cameras.length < 2) return;

        const curIdx = cameras.findIndex(c => c.deviceId === currentDeviceId);
        const nextIdx = curIdx === -1 ? 0 : (curIdx + 1) % cameras.length;
        currentDeviceId = cameras[nextIdx].deviceId;

        await new Promise(r => setTimeout(r, 300));
        await startScanning();
    }

    // =============================================
    // ОТПРАВКА ДАННЫХ (только при наличии обоих кодов)
    // =============================================
    function sendDataToBot() {
        console.log('=== ОТПРАВКА ДАННЫХ ===');
        console.log('foundCodes:', foundCodes);
        console.log('foundQR:', foundQR, 'foundDM:', foundDM);

        // Проверяем наличие обоих кодов
        if (!foundQR || !foundDM) {
            const msg = 'Не найдены оба кода (QR и DataMatrix).';
            console.warn(msg);
            if (tg?.showPopup) {
                tg.showPopup({
                    title: 'Неполные данные',
                    message: 'Отсканируйте оба кода (QR и DataMatrix) перед отправкой.',
                    buttons: [{ type: 'ok' }]
                });
            } else {
                alert(msg);
            }
            return;
        }

        // Формируем JSON
        const payload = { codes: foundCodes };
        const dataStr = JSON.stringify(payload);
        console.log('JSON для отправки:', dataStr);
        console.log('Размер данных (байт):', dataStr.length);

        if (dataStr.length > 4096) {
            console.error('❌ Данные превышают лимит 4096 байт!');
            if (tg?.showPopup) {
                tg.showPopup({
                    title: 'Ошибка',
                    message: 'Данные слишком большие для отправки',
                    buttons: [{ type: 'ok' }]
                });
            } else {
                alert('Данные слишком большие');
            }
            return;
        }

        const webApp = window.Telegram?.WebApp;
        console.log('window.Telegram.WebApp:', webApp);

        if (!webApp) {
            console.error('❌ Telegram WebApp не найден');
            alert('Имитация отправки (WebApp отсутствует):\n' + dataStr);
            return;
        }

        if (typeof webApp.sendData !== 'function') {
            console.error('❌ sendData не является функцией');
            alert('sendData недоступен');
            return;
        }

        try {
            console.log('Вызываю webApp.sendData()...');
            webApp.sendData(dataStr);
            console.log('✅ sendData вызван успешно');

            setTimeout(() => {
                console.log('Принудительное закрытие через tg.close()');
                if (webApp.close) {
                    webApp.close();
                } else {
                    console.warn('close() не доступен');
                }
            }, 1000);

        } catch (err) {
            console.error('❌ Ошибка при вызове sendData:', err);
            if (tg?.showPopup) {
                tg.showPopup({
                    title: 'Ошибка',
                    message: 'Не удалось отправить данные',
                    buttons: [{ type: 'ok' }]
                });
            } else {
                alert('Ошибка отправки: ' + err.message);
            }
        }
    }

    // --- Обработчики ---
    startBtn.addEventListener('click', startScanning);
    stopBtn.addEventListener('click', stopScanning);
    switchBtn.addEventListener('click', switchCamera);
    sendBtn.addEventListener('click', sendDataToBot);

    window.addEventListener('beforeunload', () => {
        if (isScanning) stopScanning();
    });

    if (tg) {
        tg.onEvent('viewportChanged', () => {
            if (tg.isExpanded === false && isScanning) {
                stopScanning();
            }
        });
    }

    // --- Инициализация ---
    setStatus('📷 Готов');
    console.log('Scanner initialized. Нажмите Запустить.');
});