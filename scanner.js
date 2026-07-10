// Получаем элементы
const startScanBtn = document.getElementById('start-scan-btn');
const readerDiv = document.getElementById('reader');
const resultP = document.getElementById('result');

let html5QrCode; // объект сканера

// Функция для сохранения текста в файл (скачивание)
function saveTextAsFile(text) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qr_code_data.txt'; // имя файла
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Успешное сканирование
function onScanSuccess(decodedText, decodedResult) {
    // Останавливаем сканер
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().then(() => {
            readerDiv.style.display = 'none';
            startScanBtn.style.display = 'inline-block';
        }).catch(err => console.error('Ошибка остановки:', err));
    }

    // Показываем результат
    resultP.innerText = 'Сканировано: ' + decodedText;

    // Спрашиваем, сохранить ли в файл (можно сделать и без подтверждения)
    if (confirm('QR-код считан! Сохранить результат в файл?')) {
        saveTextAsFile(decodedText);
    }
}

// Ошибка сканирования (игнорируем, иначе будет спамить)
function onScanError(errorMessage) {
    // Можно выводить в консоль для отладки
    // console.warn(errorMessage);
}

// Запуск сканера по кнопке
startScanBtn.addEventListener('click', () => {
    startScanBtn.style.display = 'none';
    readerDiv.style.display = 'block';
    resultP.innerText = ''; // очищаем предыдущий результат

    html5QrCode = new Html5Qrcode("reader");
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrCode.start(
        { facingMode: "environment" }, // задняя камера
        config,
        onScanSuccess,
        onScanError
    ).catch(err => {
        console.error('Не удалось запустить камеру:', err);
        alert('Ошибка доступа к камере. Проверьте разрешения и HTTPS-соединение.');
        startScanBtn.style.display = 'inline-block';
        readerDiv.style.display = 'none';
    });
});