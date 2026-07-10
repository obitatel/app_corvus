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
    resultP.innerText = '✅ Сканировано: ' + decodedText;
    if (confirm('QR-код считан! Сохранить результат в файл?')) {
        saveTextAsFile(decodedText);
    }
}

function onScanError(errorMessage) {
    // Выводим ошибку в консоль для диагностики
    console.log('Scan error:', errorMessage);
    // Покажем на странице, что сканер пытается, но не находит
    resultP.innerText = 'Ищу QR-код... (держите неподвижно)';
}

startScanBtn.addEventListener('click', async () => {
    startScanBtn.style.display = 'none';
    readerDiv.style.display = 'block';
    resultP.innerText = 'Наведите камеру на QR-код (2×2 см) и удерживайте неподвижно';

    html5QrCode = new Html5Qrcode("reader");

    // Запрашиваем высокое разрешение (1280x720) — это улучшит распознавание мелких деталей
    const cameraConfig = {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 }
    };

    // Увеличиваем область поиска до 300x300, чтобы точно захватить код
    const config = {
        fps: 10,
        qrbox: { width: 300, height: 300 },
        aspectRatio: 1.0
    };

    try {
        await html5QrCode.start(
            cameraConfig,
            config,
            onScanSuccess,
            onScanError
        );
        console.log('Камера запущена');
    } catch (err) {
        console.error('Ошибка запуска камеры:', err);
        alert('Не удалось запустить камеру. ' + err.message);
        startScanBtn.style.display = 'inline-block';
        readerDiv.style.display = 'none';
    }
});