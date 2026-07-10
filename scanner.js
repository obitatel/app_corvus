document.addEventListener('DOMContentLoaded', () => {
    const nativeScanBtn = document.getElementById('native-scan-btn');
    const fallbackBtn = document.getElementById('fallback-btn');
    const cropContainer = document.getElementById('crop-container');
    const imageToCrop = document.getElementById('image-to-crop');
    const cropScanBtn = document.getElementById('crop-scan-btn');
    const cancelCropBtn = document.getElementById('cancel-crop-btn');
    const resultP = document.getElementById('result');
    const tg = window.Telegram.WebApp;
    tg.ready();

    let cropper = null;
    const cameraInput = document.createElement('input');
    cameraInput.type = 'file';
    cameraInput.accept = 'image/*';
    cameraInput.style.display = 'none';
    document.body.appendChild(cameraInput);

    // --- Нативный сканер ---
    if (typeof tg.showScanQrPopup !== 'function') {
        nativeScanBtn.disabled = true;
        nativeScanBtn.innerText = 'Нативный сканер недоступен';
        resultP.innerText = 'Обновите Telegram или используйте загрузку фото.';
    } else {
        nativeScanBtn.addEventListener('click', () => {
            resultP.innerText = 'Открывается сканер...';
            tg.onEvent('qrTextReceived', (event) => {
                const text = event.data;
                if (text) {
                    resultP.innerText = '✅ Считано: ' + text;
                    tg.closeScanQrPopup();
                }
            });
            tg.showScanQrPopup({ text: 'Наведите на Data Matrix' });
        });
    }

    // --- Загрузка фото с кадрированием ---
    fallbackBtn.addEventListener('click', () => {
        cameraInput.click();
    });

    cameraInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            imageToCrop.src = ev.target.result;
            cropContainer.style.display = 'block';
            resultP.innerText = 'Обведите Data Matrix';
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
        cameraInput.value = '';
    });

    cropScanBtn.addEventListener('click', () => {
        if (!cropper) return;
        resultP.innerText = '⏳ Сканирую...';
        const croppedCanvas = cropper.getCroppedCanvas({ width: 1200, height: 1200 });
        const ctx = croppedCanvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, croppedCanvas.width, croppedCanvas.height);
        // Повышение резкости (unsharp mask)
        const sharpen = (data, w, h) => {
            const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
            const side = 3, half = 1;
            const output = new Uint8ClampedArray(data.length);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = (y * w + x) * 4;
                    let r = 0, g = 0, b = 0;
                    for (let ky = 0; ky < side; ky++) {
                        for (let kx = 0; kx < side; kx++) {
                            const sy = y + ky - half, sx = x + kx - half;
                            if (sy >= 0 && sy < h && sx >= 0 && sx < w) {
                                const srcIdx = (sy * w + sx) * 4;
                                const weight = kernel[ky * side + kx];
                                r += data[srcIdx] * weight;
                                g += data[srcIdx + 1] * weight;
                                b += data[srcIdx + 2] * weight;
                            }
                        }
                    }
                    output[idx] = Math.min(255, Math.max(0, r));
                    output[idx+1] = Math.min(255, Math.max(0, g));
                    output[idx+2] = Math.min(255, Math.max(0, b));
                    output[idx+3] = data[idx+3];
                }
            }
            return new ImageData(output, w, h);
        };
        const sharpened = sharpen(imageData.data, croppedCanvas.width, croppedCanvas.height);
        try {
            const hints = new Map();
            hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.DATA_MATRIX]);
            const reader = new ZXing.BrowserMultiFormatReader();
            reader.hints = hints;
            const result = reader.decode(sharpened);
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
});