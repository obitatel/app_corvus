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
    resultP.innerText = 'Поиск камеры...';

    try {
        // Получаем список камер
        const cameras = await Html5Qrcode.getCameras();
        if (!cameras || cameras.length === 0) {
            throw new Error('Камеры не найдены');
        }

        // Берём заднюю камеру (обычно последняя или с ключевыми словами)
        let cameraId = cameras[0].id;
        for (let cam of cameras) {
            if (/back|rear|environment|задн/i.test(cam.label)) {
                cameraId = cam.id;
                break;
            }
        }

        html5QrCode = new Html5Qrcode("reader");
        const config = {
            fps: 10,
            qrbox: { width: 400, height: 400 },
            aspectRatio: 1.0
        };

        await html5QrCode.start(
            cameraId,          // ← строка, а не объект
            config,
            onScanSuccess,
            onScanError
        );
        resultP.innerText = 'Наведите на QR-код (2×2 см) и медленно приближайте';
    } catch (err) {
        console.error('Ошибка запуска камеры:', err);
        resultP.innerText = '❌ Не удалось запустить камеру: ' + (err.message || err);
        startScanBtn.style.display = 'inline-block';
        readerDiv.style.display = 'none';
    }
});