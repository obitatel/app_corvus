const scanBtn = document.getElementById('scan-btn');
const resultP = document.getElementById('result');
const tg = window.Telegram.WebApp;

// Функция сохранения в файл
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

// Основное действие
scanBtn.addEventListener('click', async () => {
    // Проверяем, поддерживается ли нативный сканер
    if (tg.scanQR) {
        try {
            resultP.innerText = 'Открывается сканер...';
            scanBtn.disabled = true;

            // Запускаем нативный сканер Telegram
            const scannedText = await tg.scanQR();

            if (scannedText) {
                resultP.innerText = '✅ Сканировано: ' + scannedText;
                if (confirm('QR-код считан! Сохранить результат в файл?')) {
                    saveTextAsFile(scannedText);
                }
            } else {
                resultP.innerText = '❌ QR-код не распознан';
            }
        } catch (err) {
            console.error(err);
            resultP.innerText = '❌ Ошибка сканирования: ' + (err.message || err);
        } finally {
            scanBtn.disabled = false;
        }
    } else {
        // Если метод не поддерживается, предупредим пользователя
        alert('Ваша версия Telegram не поддерживает нативный сканер. Пожалуйста, обновите Telegram.');
    }
});