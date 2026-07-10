const uploadBtn = document.getElementById('upload-btn');
const resultP = document.getElementById('result');

// Функция сохранения результата в файл
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

// Обработчик кнопки загрузки
uploadBtn.addEventListener('click', () => {
    // Создаём скрытый input для выбора файла
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';  // только изображения
    input.style.display = 'none';

    input.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        resultP.innerText = '⏳ Обработка изображения...';
        uploadBtn.disabled = true;

        try {
            // Создаём сканер без привязки к DOM-элементу
            const html5QrCode = new Html5Qrcode(/* пусто */);
            const decodedText = await html5QrCode.scanFile(file, false);
            resultP.innerText = '✅ Сканировано: ' + decodedText;
            if (confirm('QR-код считан! Сохранить результат в файл?')) {
                saveTextAsFile(decodedText);
            }
        } catch (err) {
            console.error(err);
            resultP.innerText = '❌ QR-код на изображении не найден. Попробуйте другое фото.';
        } finally {
            uploadBtn.disabled = false;
            // Удаляем input
            document.body.removeChild(input);
        }
    });

    document.body.appendChild(input);
    input.click(); // запускаем выбор файла
});