// Ловим необработанные ошибки — если модуль/движок упадёт где-то на верхнем уровне,
// это будет видно в консоли, а не выглядеть как "просто ничего не происходит"
window.addEventListener('error', e => console.error('Глобальная ошибка:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('Необработанный rejection:', e.reason));

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
    let currentDeviceId = null; // переключаемся по deviceId, а не по индексу —
    // порядок в enumerateDevices() не гарантированно стабилен между вызовами
    let readBarcodesFn = null;
    let focusSupported = false;
    let decodingInProgress = false;
    let lastDecodeErrorLog = 0;

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

    function pickBackDeviceId() {
        let idx = cameras.findIndex(d => /back|rear|environment/i.test(d.label));
        if (idx !== -1) return cameras[idx].deviceId;
        const nonFront = cameras.filter(d => !/front|user|face/i.test(d.label));
        if (nonFront.length) return nonFront[nonFront.length - 1].deviceId;
        return cameras.length ? cameras[cameras.length - 1].deviceId : null;
    }

    // --- Функция применения фокуса (без перезапуска внутри) ---
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

        // Пропускаем кадр, если предыдущий ещё декодируется — иначе на слабых
        // устройствах промисы начинают копиться быстрее, чем WASM успевает их обработать
        if (decodingInProgress) return;

        const cropW = vw * ROI_RATIO, cropH = vh * ROI_RATIO;
        const sx = (vw - cropW) / 2, sy = (vh - cropH) / 2;

        canvas.width = cropW;
        canvas.height = cropH;
        ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, cropW, cropH);

        // Кадр отдаём как есть, БЕЗ ручной бинаризации по фиксированному порогу.
        // Внутри zxing-cpp уже стоит адаптивный локальный бинаризатор (LocalAverage),
        // который сам подстраивается под неравномерное освещение/блики на кадре.
        // Наш собственный threshold=128 до этого только портил полутона, на которых
        // и основан адаптивный алгоритм — для мелких Data Matrix это особенно критично.
        const imageData = ctx.getImageData(0, 0, cropW, cropH);
        if (!readBarcodesFn) return;

        decodingInProgress = true;
        readBarcodesFn(imageData, {
            formats: ['DataMatrix','QRCode'],
            tryHarder: true,
            tryRotate: true,
            tryInvert: true,
            tryDenoise: true,
            binarizer: 'LocalAverage',
            maxNumberOfSymbols: 1, // правильное имя поля в актуальном API (не maxSymbols)
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
        }).catch(err => {
            // Не глушим ошибку молча — логируем не чаще раза в 3 сек, чтобы не спамить консоль
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
                    setStatus('🔍 Наведите на Data Matrix');
                } catch {}
            }, 1500);
        } catch (e) {
            console.warn('Tap-to-focus не поддерживается:', e);
            setStatus('❌ Tap-focus недоступен', true);
        }
    });

    // --- Запуск с автоматическим переключением камеры для активации фокуса ---
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

            if (!currentDeviceId || !cameras.some(c => c.deviceId === currentDeviceId)) {
                // либо ещё не выбирали камеру, либо ранее выбранная пропала из списка
                currentDeviceId = pickBackDeviceId();
            }
            const cam = cameras.find(c => c.deviceId === currentDeviceId);
            if (!cam) throw new Error('Выбранная камера недоступна');

            // --- Открываем камеру ---
            const constraints = {
                video: {
                    deviceId: { exact: cam.deviceId },
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                }
            };

            // ВАЖНО: на части устройств (в основном Chrome/Android WebView, в т.ч. внутри
            // Telegram) движок continuous-автофокуса не включается от одного applyConstraints
            // на свежеоткрытом треке — он трогается в работу только при повторной инициализации
            // потока камеры на уровне драйвера. Поэтому сразу открываем поток второй раз —
            // это дороже по времени (~короткая пауза), но иначе на таких устройствах картинка
            // остаётся размытой/на фиксированном фокусе, и Data Matrix просто не читается.
            let tempStream = await navigator.mediaDevices.getUserMedia(constraints);
            tempStream.getTracks().forEach(t => t.stop());
            await new Promise(r => setTimeout(r, 150));

            stream = await navigator.mediaDevices.getUserMedia(constraints);
            videoTrack = stream.getVideoTracks()[0];
            video.srcObject = stream;
            await video.play();

            await applyFocus(videoTrack);

            // --- Запускаем сканирование ---
            isScanning = true;
            stopBtn.disabled = false;
            scanFrame.style.display = 'block';
            switchBtn.style.display = cameras.length > 1 ? 'inline-block' : 'none';

            if (focusSupported) {
                setStatus('🔍 Наведите на Data Matrix');
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

    // --- Переключение камеры (ручное) ---
    async function switchCamera() {
        const wasScanning = isScanning;
        if (wasScanning) stopScanning();

        await refreshCameras(); // всегда свежий список — порядок может отличаться от предыдущего вызова
        if (cameras.length < 2) return;

        const curIdx = cameras.findIndex(c => c.deviceId === currentDeviceId);
        const nextIdx = curIdx === -1 ? 0 : (curIdx + 1) % cameras.length;
        currentDeviceId = cameras[nextIdx].deviceId;

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