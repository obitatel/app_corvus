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

// Вспомогательная функция: преобразовать canvas в Blob
function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Не удалось создать Blob'));
        }, 'image/png', 1.0);
    });
}

// Сканирование QR из Blob через html5-qrcode
async function scanQRFromBlob(blob) {
    const html5QrCode = new Html5Qrcode(/* пустой элемент */);
    try {
        const result = await html5QrCode.scanFile(blob, false);
        return result;
    } finally {
        // cleanup
        html5QrCode.clear();
    }
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
            cropContainer.style.display = 'block';
            uploadBtn.style.display = 'none';
            resultP.innerText = 'Обведите QR-код рамкой, затем нажмите «Сканировать».';

            if (cropper) cropper.destroy();
            cropper = new Cropper(imageToCrop, {
                aspectRatio: NaN,
                viewMode: 1,
                autoCropArea: 0.3,      // начальная рамка меньше (30%), чтобы охватить мелкий код
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
cropScanBtn.addEventListener('click', async () => {
    if (!cropper) return;
    resultP.innerText = '⏳ Обработка...';
    cropScanBtn.disabled = true;

    try {
        // Получаем кропнутый холст с очень высоким разрешением
        const croppedCanvas = cropper.getCroppedCanvas({
            width: 1600,   // большое разрешение, чтобы разглядеть мелкий код
            height: 1600
        });

        if (!croppedCanvas) {
            throw new Error('Не удалось обработать область');
        }

        // Преобразуем canvas в Blob
        const blob = await canvasToBlob(croppedCanvas);

        // Сканируем QR-код
        const decodedText = await scanQRFromBlob(blob);

        resultP.innerText = '✅ Сканировано: ' + decodedText;
        if (confirm('QR-код считан! Сохранить результат в файл?')) {
            saveTextAsFile(decodedText);
        }
        closeCrop();
    } catch (err) {
        console.error(err);
        resultP.innerText = '❌ QR-код не найден в выделенной области. Попробуйте:\n' +
            '– обвести рамку точнее вокруг кода\n' +
            '– сфотографировать QR-код крупнее (так, чтобы он занимал больше места в кадре)';
    } finally {
        cropScanBtn.disabled = false;
    }
});

cancelCropBtn.addEventListener('click', closeCrop);

function closeCrop() {
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
    cropContainer.style.display = 'none';
    uploadBtn.style.display = 'inline-block';
}