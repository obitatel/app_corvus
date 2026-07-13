// --- Инициализация Telegram Web App ---
const tg = window.Telegram?.WebApp;

if (tg) {
    // Сообщаем Telegram, что приложение готово к отображению
    tg.ready();
    // Расширяем приложение на весь экран (опционально)
    tg.expand();
} else {
    console.warn('Telegram Web App SDK не загружен. Работа в обычном браузере.');
}

// --- Получение элементов DOM ---
const videoElement = document.getElementById('video');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const sendDataBtn = document.getElementById('send-data-btn');
const resultText = document.getElementById('result-text');
const scanStatus = document.getElementById('scan-status');

// --- Состояние ---
let isScanning = false;
let codeReader = null; // Экземпляр ридера ZXing
let selectedDeviceId = null;

// --- Функция обновления статуса ---
function setStatus(text, isError = false) {
    scanStatus.textContent = text;
    scanStatus.style.background = isError ? 'rgba(220, 53, 69, 0.9)' : 'rgba(0,0,0,0.7)';
}

// --- Функция обновления результата ---
function setResult(text) {
    resultText.textContent = text || 'Отсканированный код появится здесь';
    // Показываем кнопку отправки, если есть результат
    sendDataBtn.style.display = text ? 'inline-block' : 'none';
}

// --- 1. Получение списка камер и выбор первой доступной ---
async function getCamera() {
    try {
        // Временно создаем ридер только для получения списка устройств
        const tempReader = new ZXing.BrowserMultiFormatReader();
        const videoInputDevices = await tempReader.listVideoInputDevices();
        
        if (videoInputDevices.length === 0) {
            throw new Error('Камеры не найдены');
        }
        
        // Выбираем первую камеру (обычно это задняя камера на телефонах)
        // Для выбора конкретной можно использовать videoInputDevices[0].deviceId
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
    
    // Если камера еще не выбрана, получаем её
    if (!selectedDeviceId) {
        const success = await getCamera();
        if (!success) return;
    }

    try {
        setStatus('⏳ Запуск сканера...');
        
        // Создаем ридер, специализированный для Data Matrix
        // Можно использовать BrowserMultiFormatReader для поддержки всех форматов
        codeReader = new ZXing.BrowserDatamatrixCodeReader();
        // Альтернатива для всех форматов (работает медленнее):
        // codeReader = new ZXing.BrowserMultiFormatReader();

        // Запускаем декодирование с камеры
        // Параметры: deviceId, videoElement, callback(result, error)
        codeReader.decodeFromVideoDevice(selectedDeviceId, videoElement, (result, error) => {
            if (result) {
                // Успешно отсканирован код
                const text = result.getText();
                console.log('DataMatrix отсканирован:', text);
                setResult(text);
                setStatus('✅ Код найден!');
                
                // Автоматически останавливаем сканирование после первого успеха
                // (можно закомментировать, если нужно сканировать несколько раз)
                stopScanning();
            }
            
            if (error && !(error instanceof ZXing.NotFoundException)) {
                // Игнорируем NotFoundException (это нормально, когда код не найден в кадре)
                // Логируем другие ошибки
                console.warn('Ошибка сканирования:', error);
                // Не показываем ошибку пользователю, чтобы не сбивать с толку
            }
        });

        isScanning = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        setStatus('🔍 Сканирование... Наведите камеру на Data Matrix');
        setResult(''); // Очищаем предыдущий результат
        
    } catch (error) {
        console.error('Ошибка запуска сканера:', error);
        setStatus('❌ Ошибка: ' + error.message, true);
        // Сбрасываем состояние
        isScanning = false;
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
}

// --- 3. Остановка сканирования ---
function stopScanning() {
    if (codeReader) {
        try {
            // Останавливаем видеопоток и очищаем ресурсы
            codeReader.reset();
            // Дополнительно останавливаем все треки видео, чтобы погасить камеру
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
    
    // Меняем статус, если не было успешного сканирования
    if (scanStatus.textContent !== '✅ Код найден!') {
        setStatus('⏹ Остановлен');
    }
}

// --- 4. Отправка результата в Telegram ---
function sendDataToTelegram(data) {
    if (!data) {
        alert('Нет данных для отправки');
        return;
    }
    
    if (tg) {
        try {
            // Отправляем данные боту
            tg.sendData(data);
            console.log('Данные отправлены в Telegram:', data);
            
            // Показываем всплывающее уведомление об успехе
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
        // Если Telegram SDK недоступен (работа в обычном браузере)
        alert('Telegram WebApp не инициализирован. Данные (для демонстрации): ' + data);
        console.log('Данные для отправки (Telegram недоступен):', data);
    }
}

// --- Обработчики событий кнопок ---

// Запуск сканирования
startBtn.addEventListener('click', startScanning);

// Остановка сканирования
stopBtn.addEventListener('click', stopScanning);

// Отправка данных в Telegram
sendDataBtn.addEventListener('click', () => {
    const currentResult = resultText.textContent;
    if (currentResult && currentResult !== 'Отсканированный код появится здесь') {
        sendDataToTelegram(currentResult);
    } else {
        alert('Сначала отсканируйте код!');
    }
});

// --- Дополнительно: Обработка закрытия/сворачивания приложения ---
// Если пользователь закрывает Mini App, останавливаем сканирование
window.addEventListener('beforeunload', () => {
    if (isScanning) {
        stopScanning();
    }
});

// Если Telegram отправляет событие о закрытии (не во всех версиях SDK)
if (tg) {
    tg.onEvent('viewportChanged', () => {
        // Если приложение свернуто, можно остановить сканирование для экономии ресурсов
        if (tg.isExpanded === false && isScanning) {
            console.log('Приложение свернуто, останавливаем сканирование');
            stopScanning();
        }
    });
}

// --- Инициализация при загрузке ---
console.log('DataMatrix Scanner инициализирован. Нажмите "Запустить" для начала.');
setStatus('📷 Готов к работе');
// Предварительно получаем доступ к камере, чтобы запросить разрешение
// (это улучшает пользовательский опыт, но не обязательно)
// getCamera(); // Раскомментируйте, если хотите запросить разрешение сразу