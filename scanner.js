// --- Инициализация Telegram Web App ---
const tg = window.Telegram?.WebApp;

if (tg) {
    tg.ready();
    tg.expand();
} else {
    console.warn('Telegram Web App SDK не загружен. Работа в обычном браузере.');
}

// --- Ожидаем полной загрузки DOM, чтобы гарантировать наличие элементов ---
document.addEventListener('DOMContentLoaded', function() {

    // --- Получение элементов DOM (с проверкой) ---
    const videoElement = document.getElementById('video');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const sendDataBtn = document.getElementById('send-data-btn');
    const resultText = document.getElementById('result-text');
    const scanStatus = document.getElementById('scan-status');

    // Проверяем, что все элементы найдены
    if (!videoElement || !startBtn || !stopBtn || !sendDataBtn || !resultText || !scanStatus) {
        console.error('Один или несколько элементов DOM не найдены! Проверьте id в index.html.');
        return;
    }

    // --- Состояние ---
    let isScanning = false;
    let codeReader = null;
    let selectedDeviceId = null;

    // --- Функция обновления статуса ---
    function setStatus(text, isError = false) {
        scanStatus.textContent = text;
        scanStatus.style.background = isError ? 'rgba(220, 53, 69, 0.9)' : 'rgba(0,0,0,0.7)';
    }

    // --- Функция обновления результата ---
    function setResult(text) {
        resultText.textContent = text || 'Отсканированный код появится здесь';
        sendDataBtn.style.display = text ? 'inline-block' : 'none';
    }

    // --- 1. Получение камеры ---
    async function getCamera() {
        try {
            // Временно создаём ридер только для получения списка устройств
            const tempReader = new ZXing.BrowserMultiFormatReader();
            const videoInputDevices = await tempReader.listVideoInputDevices();

            if (videoInputDevices.length === 0) {
                throw new Error('Камеры не найдены');
            }

            selectedDeviceId = videoInputDevices[0].deviceId;
            console.log('Выбрана камера:', videoInputDevices[0].label || 'Камера');
            return true;
        } catch (error) {
            console.error('Ошибка получения камер:', error);
            setStatus('❌ Ошибка доступа к камере: ' + error.message, true);
            return false;
        }
    }

    // --- 2. Запуск сканирования ---
    async function startScanning() {
        if (isScanning) return;

        if (!selectedDeviceId) {
            const success = await getCamera();
            if (!success) return;
        }

        try {
            setStatus('⏳ Запуск сканера...');

            // Используем специализированный ридер для Data Matrix
            codeReader = new ZXing.BrowserDatamatrixCodeReader();
            // Альтернатива для всех форматов (работает медленнее):
            // codeReader = new ZXing.BrowserMultiFormatReader();

            codeReader.decodeFromVideoDevice(selectedDeviceId, videoElement, (result, error) => {
                if (result) {
                    const text = result.getText();
                    console.log('DataMatrix отсканирован:', text);
                    setResult(text);
                    setStatus('✅ Код найден!');
                    stopScanning(); // Останавливаем после первого успешного сканирования
                }

                if (error && !(error instanceof ZXing.NotFoundException)) {
                    console.warn('Ошибка сканирования:', error);
                }
            });

            isScanning = true;
            startBtn.disabled = true;
            stopBtn.disabled = false;
            setStatus('🔍 Сканирование... Наведите камеру на Data Matrix');
            setResult('');

        } catch (error) {
            console.error('Ошибка запуска сканера:', error);
            setStatus('❌ Ошибка: ' + error.message, true);
            isScanning = false;
            startBtn.disabled = false;
            stopBtn.disabled = true;
        }
    }

    // --- 3. Остановка сканирования ---
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

    // --- 4. Отправка данных в Telegram ---
    function sendDataToTelegram(data) {
        if (!data) {
            alert('Нет данных для отправки');
            return;
        }

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
            alert('Telegram WebApp не инициализирован. Данные (для демонстрации): ' + data);
            console.log('Данные для отправки (Telegram недоступен):', data);
        }
    }

    // --- Назначение обработчиков событий ---
    startBtn.addEventListener('click', startScanning);
    stopBtn.addEventListener('click', stopScanning);
    sendDataBtn.addEventListener('click', () => {
        const currentResult = resultText.textContent;
        if (currentResult && currentResult !== 'Отсканированный код появится здесь') {
            sendDataToTelegram(currentResult);
        } else {
            alert('Сначала отсканируйте код!');
        }
    });

    // --- Остановка сканирования при закрытии страницы ---
    window.addEventListener('beforeunload', () => {
        if (isScanning) stopScanning();
    });

    // --- Если Telegram приложение сворачивается, останавливаем сканирование ---
    if (tg) {
        tg.onEvent('viewportChanged', () => {
            if (tg.isExpanded === false && isScanning) {
                console.log('Приложение свернуто, останавливаем сканирование');
                stopScanning();
            }
        });
    }

    // --- Инициализация ---
    console.log('DataMatrix Scanner инициализирован. Нажмите "Запустить" для начала.');
    setStatus('📷 Готов к работе');

    // (Опционально) Предварительно запрашиваем доступ к камере
    // getCamera();
});