// scanner.js - обновлённая версия для маленьких QR-кодов

const startScanBtn = document.getElementById('start-scan-btn');
const readerDiv = document.getElementById('reader');
const resultP = document.getElementById('result');

let html5QrCode;

function saveTextAsFile(text) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qr_code_data.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function onScanSuccess(decodedText, decodedResult) {
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().then(() => {
            readerDiv.style.display = 'none';
            startScanBtn.style.display = 'inline-block';
        }).catch(err => console.error('Ошибка остановки:', err));
    }
    resultP.innerText = 'Сканировано: ' + decodedText;
    if (confirm('QR-код считан! Сохранить результат в файл?')) {
        saveTextAsFile(decodedText);
    }
}

function onScanError(errorMessage) {
    // Выводим ошибку в консоль для диагностики — полезно понять, видит ли камера что-то похожее на QR
    console.log('Scan error:', errorMessage);
    // Также можно показывать пользователю, но не будем засорять интерфейс
    // resultP.innerText = 'Поиск QR-кода... (ошибка: ' + errorMessage + ')';
}

startScanBtn.addEventListener('click', async () => {
    startScanBtn.style.display = 'none';
    readerDiv.style.display = 'block';
    resultP.innerText = 'Наведите камеру на QR-код (2×2 см) и удерживайте неподвижно';

    html5QrCode = new Html5Qrcode("reader");

    // Конфигурация: рамка 200x200, частота кадров 10
    const config = {
        fps: 10,
        qrbox: { width: 200, height: 200 },
        // Попробуем аспектное соотношение, если нужно
        aspectRatio: 1.0
    };

    // Дополнительные настройки камеры: попытка применить зум (работает не на всех устройствах)
    const cameraConfig = {
        facingMode: "environment"
    };

    // Некоторые устройства позволяют задать zoom через constraints, но html5-qrcode не поддерживает напрямую.
    // Можно попробовать запросить разрешение побольше, чтобы улучшить распознавание.
    // Альтернативно, если есть возможность, используем заднюю камеру с максимальным разрешением.

    try {
        await html5QrCode.start(
            cameraConfig,
            config,
            onScanSuccess,
            onScanError
        );
    } catch (err) {
        console.error('Ошибка запуска камеры:', err);
        alert('Не удалось запустить камеру: ' + err.message);
        startScanBtn.style.display = 'inline-block';
        readerDiv.style.display = 'none';
    }
});