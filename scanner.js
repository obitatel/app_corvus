// --- Инициализация Telegram Web App ---
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
} else {
    console.warn('Telegram Web App SDK не загружен. Работа в обычном браузере.');
}

document.addEventListener('DOMContentLoaded', function() {

    // --- Элементы DOM ---
    const videoElement = document.getElementById('video');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const sendDataBtn = document.getElementById('send-data-btn');
    const resultText = document.getElementById('result-text');
    const scanStatus = document.getElementById('scan-status');
    const switchCameraBtn = document.getElementById('switch-camera-btn'); // добавим кнопку переключения

    if (!videoElement || !startBtn || !stopBtn || !sendDataBtn || !resultText || !scanStatus) {
        console.error('Один или несколько элементов DOM не найдены!');
        return;
    }

    // --- Состояние ---
    let isScanning = false;
    let codeReader = null;
    let currentFacingMode = 'environment'; // 'environment' – тыловая, 'user' – фронтальная
    let isSwitchAvailable = false; // будет true, если доступно несколько камер

    // --- Функции обновления UI ---
    function setStatus(text, isError = false) {
        scanStatus.textContent = text;
        scanStatus.style.background = isError ? 'rgba(220, 53, 69, 0.9)' : 'rgba(0,0,0,0.7)';
    }

    function setResult(text) {
        resultText.textContent = text || 'Отсканированный код появится здесь';
        sendDataBtn.style.display = text ? 'inline-block' : 'none';
    }

    // --- 1. Получение списка камер с группировкой по типу ---
    async function getCamerasInfo() {
        try {
            const tempReader = new ZXing.BrowserMultiFormatReader();
            const devices = await tempReader.listVideoInputDevices();
            // devices – массив { deviceId, label, kind }
            // Группируем по ключевым словам в label
            const backCameras = [];
            const frontCameras = [];
            const others = [];

            devices.forEach(dev => {
                const label = dev.label.toLowerCase();
                if (label.includes('back') || label.includes('rear') || label.includes('environment')) {
                    backCameras.push(dev);
                } else if (label.includes('front') || label.includes('user') || label.includes('face')) {
                    frontCameras.push(dev);
                } else {
                    others.push(dev);
                }
            });

            // Если есть тыловая – используем первую, иначе берём первую из всех
            let preferredDevice = null;
            if (backCameras.length > 0) {
                preferredDevice = backCameras[0];
                isSwitchAvailable = (frontCameras.length > 0 || others.length > 0);
            } else if (frontCameras.length > 0) {
                preferredDevice = frontCameras[0];
                isSwitchAvailable = (backCameras.length > 0 || others.length > 0);
            } else if (others.length > 0) {
                preferredDevice = others[0];
                isSwitchAvailable = false;
            }

            // Для переключения сохраняем все устройства
            window.__allVideoDevices = devices; // сохраним глобально для переключения

            return {
                deviceId: preferredDevice?.deviceId || null,
                devices: devices,
                backCameras: backCameras,
                frontCameras: frontCameras,
                others: others
            };
        } catch (error) {
            console.error('Ошибка получения списка камер:', error);
            return null;
        }
    }

    // --- 2. Запуск сканирования с указанием камеры (по deviceId или facingMode) ---
    async function startScanning() {
        if (isScanning) return;

        try {
            setStatus('⏳ Запуск сканера...');

            // Получаем информацию о камерах
            const cameraInfo = await getCamerasInfo();
            if (!cameraInfo || !cameraInfo.deviceId) {
                throw new Error('Не найдена подходящая камера');
            }

            // Сохраняем список для переключения
            window.__cameraInfo = cameraInfo;

            // Создаём ридер – используем BrowserMultiFormatReader (поддерживает Data Matrix)
            codeReader = new ZXing.BrowserMultiFormatReader();
            // Можно также явно указать форматы для ускорения:
            // codeReader = new ZXing.BrowserMultiFormatReader(0, [ZXing.BarcodeFormat.DATA_MATRIX, ZXing.BarcodeFormat.QR_CODE]);

            // Настройка видеопотока: просим высокое разрешение и фокусировку
            const constraints = {
                video: {
                    deviceId: { exact: cameraInfo.deviceId },
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: currentFacingMode, // environment/user
                    focusMode: 'continuous',
                    zoom: 1.0
                }
            };

            // Запускаем декодирование
            codeReader.decodeFromVideoConstraints(constraints, videoElement, (result, error) => {
                if (result) {
                    const text = result.getText();
                    console.log('DataMatrix/QR отсканирован:', text);
                    setResult(text);
                    setStatus('✅ Код найден!');
                    stopScanning(); // останавливаем после первого успеха
                }
                if (error && !(error instanceof ZXing.NotFoundException)) {
                    console.warn('Ошибка сканирования:', error);
                }
            });

            isScanning = true;
            startBtn.disabled = true;
            stopBtn.disabled = false;
            // Показываем кнопку переключения, если есть альтернативные камеры
            if (switchCameraBtn) {
                switchCameraBtn.style.display = (cameraInfo.backCameras.length > 0 && cameraInfo.frontCameras.length > 0) ? 'inline-block' : 'none';
            }
            setStatus('🔍 Сканирование... Наведите камеру на Data Matrix');

        } catch (error) {
            console.error('Ошибка запуска сканера:', error);
            setStatus('❌ Ошибка: ' + error.message, true);
            isScanning = false;
            startBtn.disabled = false;
            stopBtn.disabled = true;
        }
    }

    // --- 3. Остановка ---
    function stopScanning() {
        if (codeReader) {
            try {
                codeReader.reset();
                if (videoElement.srcObject) {
                    const tracks = videoElement.srcObject.getTracks();
                    tracks.forEach(track => track.stop());
                    videoElement.srcObject = null;
                }
            } catch (error) {
                console.warn('Ошибка при остановке сканера:', error);
            }
            codeReader = null;
        }
        isScanning = false;
        startBtn.disabled = false;
        stopBtn.disabled = true;
        if (scanStatus.textContent !== '✅ Код найден!') {
            setStatus('⏹ Остановлен');
        }
    }

    // --- 4. Переключение камеры ---
    async function switchCamera() {
        if (!isScanning) {
            // Если сканирование не активно, просто меняем режим и запускаем
            currentFacingMode = (currentFacingMode === 'environment') ? 'user' : 'environment';
            await startScanning();
            return;
        }

        // Если сканирование активно – останавливаем, меняем режим и перезапускаем
        stopScanning();
        // Даём время на освобождение ресурсов
        await new Promise(resolve => setTimeout(resolve, 300));
        currentFacingMode = (currentFacingMode === 'environment') ? 'user' : 'environment';
        await startScanning();
    }

    // --- 5. Отправка данных в Telegram ---
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

    // --- Инициализация ---
    console.log('DataMatrix Scanner готов. Нажмите "Запустить"');
    setStatus('📷 Готов к работе');
});