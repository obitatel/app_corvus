const scanBtn = document.getElementById('scan-btn');
const resultP = document.getElementById('result');
const tg = window.Telegram.WebApp;

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

scanBtn.addEventListener('click', () => {
    if (typeof tg.showScanQrPopup === 'function') {
        // Подписываемся на событие получения QR-кода
        tg.onEvent('qrTextReceived', (event) => {
            const { data } = event;
            if (data) {
                resultP.innerText = '✅ Сканировано: ' + data;
                if (confirm('QR-код считан! Сохранить результат в файл?')) {
                    saveTextAsFile(data);
                }
                tg.closeScanQrPopup();
            }
        });

        // Показываем сканер
        tg.showScanQrPopup({
            text: 'Наведите камеру на QR-код'
        });
    } else {
        alert('Сканер недоступен. Обновите Telegram.');
    }
});