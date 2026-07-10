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
        }).catch(err => console.error(err));
    }
    resultP.innerText = '✅ Сканировано: ' + decodedText;
    if (confirm('QR-код считан! Сохранить результат в файл?')) {
        saveTextAsFile(decodedText);
    }
}

function onScanError(errorMessage) {
    console.warn('Scan error:', errorMessage);
    resultP.innerText = 'Ищу QR-код... Поднесите ближе и держите ровно';
}

startScanBtn.addEventListener('click', async () => {
    startScanBtn.style.display = 'none';
    readerDiv.style.display = 'block';
    resultP.innerText = 'Запуск камеры...';

    html5QrCode = new Html5Qrcode("reader");

    // Только один ключ — facingMode
    const cameraConfig = { facingMode: "environment" };
    const config = {
        fps: 10,
        qrbox: { width: 400, height: 400 },
        aspectRatio: 1.0
    };

    try {
        await html5QrCode.start(
            cameraConfig,
            config,
            onScanSuccess,
            onScanError
        );
        resultP.innerText = 'Наведите на QR-код (2×2 см) и медленно приближайте';
        console.log('Камера запущена');
    } catch (err) {
        console.error('Ошибка запуска камеры:', err);
        resultP.innerText = '❌ Не удалось запустить камеру: ' + (err.message || err);
        startScanBtn.style.display = 'inline-block';
        readerDiv.style.display = 'none';
    }
});