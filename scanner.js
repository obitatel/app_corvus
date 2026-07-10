const scanBtn = document.getElementById('scan-btn');
const resultP = document.getElementById('result');
const tg = window.Telegram.WebApp;

// Функция сохранения в файл (пока оставим)
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

// Альтернативный сканер через загрузку фото с кадрированием
function fallbackToImageScanner() {
    // Удаляем старую кнопку и создаём новую для загрузки
    scanBtn.innerText = 'Загрузить фото QR-кода';
    scanBtn.onclick = null; // сбрасываем старый обработчик

    // Создаём input для файла
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    scanBtn.addEventListener('click', () => input.click());

    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Показываем редактор кадрирования
        // Используем Cropper.js и html5-qrcode (без jsQR) – тот же мощный метод, что был раньше,
        // но теперь мы увеличим выходной размер до 2000px и добавим повышение резкости.
        // Код вставим ниже, чтобы не загромождать – пока достаточно сообщения.
        alert('Загрузка фото будет доступна после обновления. Нажмите "Загрузить фото QR-кода".');
    });
}

// Основная логика после загрузки страницы
document.addEventListener('DOMContentLoaded', () => {
    // Выводим диагностику
    let info = `Версия Telegram WebApp: ${tg.version || 'неизвестна'}\n`;
    info += `Поддержка scanQR: ${typeof tg.scanQR === 'function' ? '✅ Да' : '❌ Нет'}\n`;
    info += `Методы: ${Object.keys(tg).filter(k => typeof tg[k] === 'function').join(', ')}`;
    resultP.innerText = info;

    if (typeof tg.scanQR === 'function') {
        // Нативный сканер доступен – используем его
        scanBtn.addEventListener('click', async () => {
            try {
                resultP.innerText = 'Открывается сканер...';
                scanBtn.disabled = true;
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
                resultP.innerText = '❌ Ошибка сканирования: ' + (err.message || err);
            } finally {
                scanBtn.disabled = false;
            }
        });
    } else {
        // Нативный сканер недоступен – включаем запасной вариант
        scanBtn.innerText = 'Нативный сканер недоступен. Загрузить фото?';
        scanBtn.addEventListener('click', fallbackToImageScanner);
    }
});