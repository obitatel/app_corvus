const uploadBtn = document.getElementById('upload-btn');
const cropContainer = document.getElementById('crop-container');
const imageToCrop = document.getElementById('image-to-crop');
const cropScanBtn = document.getElementById('crop-scan-btn');
const cancelCropBtn = document.getElementById('cancel-crop-btn');
const resultP = document.getElementById('result');

let cropper = null;

// Сохранение в файл
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

// Запуск выбора файла
uploadBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            imageToCrop.src = ev.target.result;
            // Показываем контейнер и скрываем кнопку загрузки
            cropContainer.style.display = 'block';
            uploadBtn.style.display = 'none';
            resultP.innerText = '';

            // Инициализируем Cropper
            if (cropper) cropper.destroy();
            cropper = new Cropper(imageToCrop, {
                aspectRatio: NaN,       // свободное соотношение
                viewMode: 1,            // ограничивает кроп пределами изображения
                autoCropArea: 0.5,      // начальная область 50% (в центре)
                responsive: true,
                background: false,
                zoomable: true,
                movable: true,
            });
        };
        reader.readAsDataURL(file);
    });
    input.click();
});

// Сканирование выделенной области
cropScanBtn.addEventListener('click', () => {
    if (!cropper) return;
    resultP.innerText = '⏳ Сканирование...';

    // Получаем обрезанный canvas
    const croppedCanvas = cropper.getCroppedCanvas({
        width: 800,   // увеличиваем для лучшего распознавания
        height: 800
    });

    // Пытаемся найти QR-код
    const imageData = croppedCanvas.getContext('2d').getImageData(0, 0, croppedCanvas.width, croppedCanvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (code) {
        resultP.innerText = '✅ Сканировано: ' + code.data;
        if (confirm('QR-код считан! Сохранить результат в файл?')) {
            saveTextAsFile(code.data);
        }
        // Закрываем редактор
        closeCrop();
    } else {
        resultP.innerText = '❌ QR-код не найден в выделенной области. Попробуйте обвести точнее.';
    }
});

// Отмена кадрирования
cancelCropBtn.addEventListener('click', closeCrop);

function closeCrop() {
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
    cropContainer.style.display = 'none';
    uploadBtn.style.display = 'inline-block';
}