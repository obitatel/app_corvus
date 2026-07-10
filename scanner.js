const nativeScanBtn = document.getElementById('native-scan-btn');
const uploadBtn = document.getElementById('upload-btn');
const cropContainer = document.getElementById('crop-container');
const imageToCrop = document.getElementById('image-to-crop');
const cropScanBtn = document.getElementById('crop-scan-btn');
const cancelCropBtn = document.getElementById('cancel-crop-btn');
const resultP = document.getElementById('result');

let cropper = null;
const tg = window.Telegram.WebApp;
tg.ready();

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

// ---------- Нативный сканер ----------
nativeScanBtn.addEventListener('click', () => {
    if (typeof tg.showScanQrPopup !== 'function') {
        alert('Нативный сканер недоступен. Обновите Telegram или используйте загрузку фото.');
        return;
    }
    tg.onEvent('qrTextReceived', (event) => {
        const text = event.data;
        if (text) {
            resultP.innerText = '✅ Сканировано: ' + text;
            if (confirm('Сохранить результат в файл?')) saveTextAsFile(text);
            tg.closeScanQrPopup();
        }
    });
    tg.showScanQrPopup({ text: 'Наведите на код' });
});

// ---------- Загрузка фото + кадрирование + ZXing (Data Matrix) ----------
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
            if (cropper) cropper.destroy();
            cropper = new Cropper(imageToCrop, {
                aspectRatio: NaN,
                viewMode: 1,
                autoCropArea: 0.4,
                responsive: true,
                background: false,
            });
        };
        reader.readAsDataURL(file);
    });
    input.click();
});

cropScanBtn.addEventListener('click', async () => {
    if (!cropper) return;
    resultP.innerText = '⏳ Обработка...';
    const croppedCanvas = cropper.getCroppedCanvas({ width: 2000, height: 2000 });
    const imageData = croppedCanvas.getContext('2d').getImageData(0, 0, croppedCanvas.width, croppedCanvas.height);

    // Используем ZXing с явным указанием форматов: QR, Data Matrix, Aztec и т.д.
    const hints = new Map();
    const formats = [BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX, BarcodeFormat.AZTEC, BarcodeFormat.PDF_417];
    hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
    const reader = new ZXingBrowserReader();
    reader.hints = hints;

    try {
        const result = reader.decode(imageData);
        resultP.innerText = '✅ Сканировано: ' + result.text;
        if (confirm('Сохранить результат в файл?')) saveTextAsFile(result.text);
        closeCrop();
    } catch (err) {
        resultP.innerText = '❌ Код не найден. Попробуйте обвести точнее или используйте нативный сканер.';
    }
});

cancelCropBtn.addEventListener('click', closeCrop);

function closeCrop() {
    if (cropper) cropper.destroy();
    cropper = null;
    cropContainer.style.display = 'none';
}