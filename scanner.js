// scanner.js — версия на zxing-wasm (zxing-cpp через WebAssembly)
// Движок распознавания Data Matrix у zxing-wasm на порядок лучше, чем у @zxing/library (zxing-js),
// который был портирован вручную и слабо справлялся с Data Matrix.

import { readBarcodes } from 'https://cdn.jsdelivr.net/npm/zxing-wasm@2/dist/reader/index.js';

// --- Инициализация Telegram Web App ---
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
} else {
    console.warn('Telegram Web App SDK не загружен. Работа в обычном браузере.');
}

document.addEventListener('DOMContentLoaded', function () {

    // --- Элементы DOM ---
    const videoElement = document.getElementById('video');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const sendDataBtn = document.getElementById('send-data-btn');
    const resultText = document.getElementById('result-text');
    const scanStatus = document.getElementById('scan-status');
    const scanFrame = document.getElementById('scan-frame');
    const switchCameraBtn = document.getElementById('switch-camera-btn');
    const canvas = document.getElementById('capture-canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!videoElement || !startBtn || !stopBtn || !sendDataBtn || !resultText || !scanStatus || !canvas) {
        console.error('Один или несколько элементов DOM не найдены!');
        return;
    }

    // --- Состояние ---
    let isScanning = false;
    let currentStream = null;
    let decodeLoopId = null;
    let lastDecodeTime = 0;
    const DECODE_INTERVAL_MS = 150; // ~6-7 кадров/сек — достаточно для сканера, щадит слабые устройства

    let availableCameras = [];   // все videoinput устройства
    let currentCameraIndex = -1; // индекс текущей камеры в availableCameras

    // Доля кадра, которую реально отдаём в декодер (ROI). 0.6 = центральные 60% по каждой оси.
    const ROI_RATIO = 0.6;

    // --- Функции обновления UI ---
    function setStatus(text, isError = false) {
        scanStatus.textContent = text;
        scanStatus.style.background = isError ? 'rgba(220, 53, 69, 0.9)' : 'rgba(0,0,0,0.7)';
    }

    function setResult(text) {
        resultText.textContent = text || 'Отсканированный код появится здесь';
        sendDataBtn.style.display = text ? 'inline-block' : 'none';
    }

    // --- 1. Получение списка камер с надёжным определением тыловой ---
    // Важно: до выдачи разрешения на камеру label у устройств пустые, поэтому сначала
    // открываем временный поток (любой), а потом уже enumerateDevices() отдаёт labels.
    async function refreshCameraList() {
        // "Прогревочный" запрос — только чтобы получить разрешение и заполнить labels
        if (!availableCameras.length) {
            try {
                const warm = await navigator.mediaDevices.getUserMedia({ video: true });
                warm.getTracks().forEach(t => t.stop());
            } catch (e) {
                // Если разрешение не дали — enumerateDevices всё равно отработает,
                // но без labels. Ошибку пробросим дальше при попытке открыть поток.
                console.warn('Не удалось получить прогревочный доступ к камере:', e);
            }
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        availableCameras = devices.filter(d => d.kind === 'videoinput');
        return availableCameras;
    }

    function pickBackCameraIndex(cameras) {
        // 1) Ищем по ключевым словам в label
        let idx = cameras.findIndex(d => /back|rear|environment/i.test(d.label));
        if (idx !== -1) return idx;

        // 2) Явно исключаем фронтальные по label
        const nonFront = cameras
            .map((d, i) => ({ d, i }))
            .filter(({ d }) => !/front|user|face/i.test(d.label));

        if (nonFront.length > 0) {
            // Эвристика: на большинстве телефонов тыловая камера идёт последней в списке
            return nonFront[nonFront.length - 1].i;
        }

        // 3) Совсем нет информации (labels пустые) — берём последнюю камеру в списке,
        // так как на многих устройствах порядок: [front, back] или [front, back, back-wide...]
        if (cameras.length > 1) return cameras.length - 1;

        return cameras.length > 0 ? 0 : -1;
    }

    // --- 2. Запуск видеопотока по индексу камеры ---
    async function openCameraStream(index) {
        const camera = availableCameras[index];
        if (!camera) throw new Error('Камера не найдена');

        const constraints = {
            video: {
                deviceId: { exact: camera.deviceId },
                width: { ideal: 1280 },
                height: { ideal: 720 },
                // continuous focus, если поддерживается устройством
                advanced: [{ focusMode: 'continuous' }]
            }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        return stream;
    }

    // --- 3. Основной цикл декодирования с throttling и ROI-кропом ---
    function decodeLoop() {
        if (!isScanning) return;

        decodeLoopId = requestAnimationFrame(decodeLoop);

        const now = performance.now();
        if (now - lastDecodeTime < DECODE_INTERVAL_MS) return;
        if (videoElement.readyState < videoElement.HAVE_CURRENT_DATA) return;
        lastDecodeTime = now;

        const vw = videoElement.videoWidth;
        const vh = videoElement.videoHeight;
        if (!vw || !vh) return;

        // Считаем ROI — центральный квадрат/прямоугольник кадра
        const cropW = vw * ROI_RATIO;
        const cropH = vh * ROI_RATIO;
        const sx = (vw - cropW) / 2;
        const sy = (vh - cropH) / 2;

        canvas.width = cropW;
        canvas.height = cropH;
        ctx.drawImage(videoElement, sx, sy, cropW, cropH, 0, 0, cropW, cropH);

        let imageData;
        try {
            imageData = ctx.getImageData(0, 0, cropW, cropH);
        } catch (e) {
            console.warn('Не удалось прочитать кадр с canvas:', e);
            return;
        }

        readBarcodes(imageData, {
            formats: ['DataMatrix'],
            tryHarder: true,
            maxNumberOfSymbols: 1
        }).then(results => {
            if (!isScanning) return;
            if (results && results.length > 0 && results[0].text) {
                const text = results[0].text;
                console.log('Data Matrix отсканирован:', text);
                setResult(text);
                setStatus('✅ Код найден!');
                stopScanning();
            }
        }).catch(err => {
            console.warn('Ошибка декодирования:', err);
        });
    }

    // --- 4. Запуск сканирования ---
    async function startScanning() {
        if (isScanning) return;

        try {
            setStatus('⏳ Запуск сканера...');
            startBtn.disabled = true;

            await refreshCameraList();
            if (!availableCameras.length) {
                throw new Error('Камеры не найдены');
            }

            if (currentCameraIndex === -1) {
                currentCameraIndex = pickBackCameraIndex(availableCameras);
            }

            const stream = await openCameraStream(currentCameraIndex);
            currentStream = stream;
            videoElement.srcObject = stream;
            await videoElement.play();

            isScanning = true;
            stopBtn.disabled = false;
            scanFrame.style.display = 'block';
            switchCameraBtn.style.display = availableCameras.length > 1 ? 'inline-block' : 'none';
            setStatus('🔍 Наведите камеру на Data Matrix');

            lastDecodeTime = 0;
            decodeLoop();

        } catch (error) {
            console.error('Ошибка запуска сканера:', error);
            setStatus('❌ Ошибка: ' + error.message, true);
            isScanning = false;
            startBtn.disabled = false;
            stopBtn.disabled = true;
        }
    }

    // --- 5. Остановка ---
    function stopScanning() {
        isScanning = false;

        if (decodeLoopId) {
            cancelAnimationFrame(decodeLoopId);
            decodeLoopId = null;
        }

        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
        videoElement.srcObject = null;

        scanFrame.style.display = 'none';
        startBtn.disabled = false;
        stopBtn.disabled = true;

        if (scanStatus.textContent !== '✅ Код найден!') {
            setStatus('⏹ Остановлен');
        }
    }

    // --- 6. Переключение камеры ---
    async function switchCamera() {
        if (!availableCameras.length) {
            await refreshCameraList();
        }
        if (availableCameras.length < 2) return;

        const wasScanning = isScanning;
        if (wasScanning) stopScanning();

        currentCameraIndex = (currentCameraIndex + 1) % availableCameras.length;

        // Небольшая пауза, чтобы предыдущий поток точно освободил устройство
        await new Promise(resolve => setTimeout(resolve, 300));
        await startScanning();
    }

    // --- 7. Отправка данных в Telegram ---
    function sendDataToTelegram(data) {
        if (!data) return;
        if (tg) {
            try {
                tg.sendData(data);
                console.log('Данные отправлены в Telegram:', data);
                if (tg.showPopup) {
                    tg.showPopup({
                        title: '✅ Отправлено',
                        message: `Данные "${data}" успешно отправлены боту.`,
                        buttons: [{ type: 'ok' }]
                    });
                } else {
                    alert('Данные отправлены боту!');
                }
            } catch (error) {
                console.error('Ошибка отправки данных:', error);
                alert('Ошибка отправки данных: ' + error.message);
            }
        } else {
            alert('Telegram WebApp не инициализирован. Данные: ' + data);
        }
    }

    // --- Назначение обработчиков ---
    startBtn.addEventListener('click', startScanning);
    stopBtn.addEventListener('click', stopScanning);
    if (switchCameraBtn) {
        switchCameraBtn.addEventListener('click', switchCamera);
    }
    sendDataBtn.addEventListener('click', () => {
        const currentResult = resultText.textContent;
        if (currentResult && currentResult !== 'Отсканированный код появится здесь') {
            sendDataToTelegram(currentResult);
        } else {
            alert('Сначала отсканируйте код!');
        }
    });

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

    // Обновляем список камер, если пользователь физически подключил/отключил устройство
    navigator.mediaDevices.addEventListener?.('devicechange', () => {
        availableCameras = [];
        currentCameraIndex = -1;
    });

    // --- Инициализация ---
    console.log('DataMatrix Scanner (zxing-wasm) готов. Нажмите "Запустить"');
    setStatus('📷 Готов к работе');
});
