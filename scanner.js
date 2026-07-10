const scanBtn = document.getElementById('scan-btn');
const cameraInput = document.getElementById('camera-input');
const cropContainer = document.getElementById('crop-container');
const imageToCrop = document.getElementById('image-to-crop');
const cropScanBtn = document.getElementById('crop-scan-btn');
const cancelCropBtn = document.getElementById('cancel-crop-btn');
const resultP = document.getElementById('result');
const tg = window.Telegram.WebApp;
tg.ready();

let cropper = null;

// Шаг 1: Открыть камеру
scanBtn.addEventListener('click', () => {
    cameraInput.click();
});

// Шаг 2: Загрузить снимок в редактор кадрирования
cameraInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        imageToCrop.src = e.target.result;
        cropContainer.style.display = 'block';
        resultP.innerText = '';
        if (cropper) cropper.destroy();
        cropper = new Cropper(imageToCrop, {
            aspectRatio: NaN,
            viewMode: 1,
            autoCropArea: 0.5,
            responsive: true,
            background: false,
        });
    };
    reader.readAsDataURL(file);
    cameraInput.value = ''; // сброс для повторной съёмки
});

// Шаг 3: Сканировать выделенную область
cropScanBtn.addEventListener('click', () => {
    if (!cropper) return;
    resultP.innerText = '⏳ Сканирую...';

    // Получаем кроп 800x800 (быстро и достаточно для Data Matrix)
    const croppedCanvas = cropper.getCroppedCanvas({ width: 800, height: 800 });
    const imageData = croppedCanvas.getContext('2d').getImageData(0, 0, croppedCanvas.width, croppedCanvas.height);

    try {
        const hints = new Map();
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.DATA_MATRIX]);
        const reader = new ZXing.BrowserMultiFormatReader();
        reader.hints = hints;

        const result = reader.decode(imageData);
        resultP.innerText = '✅ Считано: ' + result.text;
        closeCrop();
    } catch (err) {
        resultP.innerText = '❌ Код не найден. Обведите точнее или сфотографируйте ближе.';
    }
});

cancelCropBtn.addEventListener('click', closeCrop);

function closeCrop() {
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
    cropContainer.style.display = 'none';
}