document.addEventListener('DOMContentLoaded', () => {
    const nativeScanBtn = document.getElementById('native-scan-btn');
    const cropContainer = document.getElementById('crop-container');
    const imageToCrop = document.getElementById('image-to-crop');
    const cropScanBtn = document.getElementById('crop-scan-btn');
    const cancelCropBtn = document.getElementById('cancel-crop-btn');
    const resultP = document.getElementById('result');
    const tg = window.Telegram.WebApp;
    tg.ready();

    let cropper = null;
    let nativeResultReceived = false;

    // Функция для повышения резкости (unsharp mask)
    function applySharpen(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const output = new Uint8ClampedArray(data.length);
        const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0]; // матрица резкости
        const side = Math.round(Math.sqrt(kernel.length));
        const halfSide = Math.floor(side / 2);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                let r = 0, g = 0, b = 0;
                for (let cy = 0; cy < side; cy++) {
                    for (let cx = 0; cx < side; cx++) {
                        const scy = y + cy - halfSide;
                        const scx = x + cx - halfSide;
                        if (scy >= 0 && scy < height && scx >= 0 && scx < width) {
                            const srcIdx = (scy * width + scx) * 4;
                            const weight = kernel[cy * side + cx];
                            r += data[srcIdx] * weight;
                            g += data[srcIdx + 1] * weight;
                            b += data[srcIdx + 2] * weight;
                        }
                    }
                }
                output[idx] = Math.min(255, Math.max(0, r));
                output[idx + 1] = Math.min(255, Math.max(0, g));
                output[idx + 2] = Math.min(255, Math.max(0, b));
                output[idx + 3] = data[idx + 3]; // alpha без изменений
            }
        }
        const newImageData = new ImageData(output, width, height);
        return newImageData;
    }

    // Попытка распознать Data Matrix из canvas
    function tryDecode(canvas) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const sharpened = applySharpen(imageData);
        const hints = new Map();
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.DATA_MATRIX]);
        const reader = new ZXing.BrowserMultiFormatReader();
        reader.hints = hints;
        return reader.decode(sharpened);
    }

    // --- Нативный сканер ---
    if (typeof tg.showScanQrPopup !== 'function') {
        nativeScanBtn.innerText = '📷 Сканировать (нативный недоступен)';
        nativeScanBtn.disabled = true;
        resultP.innerText = 'Обновите Telegram или используйте загрузку фото.';
    }

    nativeScanBtn.addEventListener('click', () => {
        nativeResultReceived = false;
        resultP.innerText = 'Открывается сканер...';

        // Подписываемся на результат
        const qrHandler = (event) => {
            nativeResultReceived = true;
            const text = event.data;
            if (text) {
                resultP.innerText = '✅ Считано: ' + text;
                tg.closeScanQrPopup();
            }
        };

        tg.onEvent('qrTextReceived', qrHandler);

        // Показываем попап
        tg.showScanQrPopup({ text: 'Наведите на Data Matrix' });

        // Отслеживаем закрытие попапа (если пользователь закрыл вручную)
        const closeHandler = () => {
            tg.offEvent('qrTextReceived', qrHandler);
            tg.offEvent('scanQrPopupClosed', closeHandler);
            if (!nativeResultReceived) {
                resultP.innerText = 'Код не считан. Попробуйте загрузить фото для обрезки.';
                // Показываем fallback-кнопку? У нас уже есть crop, но он скрыт. Добавим плавный переход.
                // Можно показать кнопку загрузки фото. Но у нас отдельная кнопка? У нас crop-container изначально скрыт, мы покажем его, если пользователь захочет.
                // Лучше сразу предложить: добавим кнопку "Загрузить фото" видимой всегда.
                // Но она уже есть? Нет, только crop-container с кнопками. Добавим отдельную кнопку "Загрузить фото" в index.html.
                // Однако я не хочу перегружать интерфейс. Сделаем так: при неудаче нативного сканирования показать кнопку "Загрузить фото" (если её нет) или просто активировать crop.
                // Проще: всегда показывать под основной кнопкой маленькую ссылку "или загрузить фото".
                // Но сейчас уже код готов, я быстро обновлю index.html, добавив кнопку "Загрузить фото" и скрытый crop.
                // Я пришлю полный код.
            }
        };
        tg.onEvent('scanQrPopupClosed', closeHandler);
    });

    // --- Запасной вариант: загрузка фото с кадрированием ---
    // Добавим кнопку "Загрузить фото" в интерфейс, она будет всегда видна под основной.
    // Чтобы не менять index.html, создадим кнопку динамически.
    const fallbackBtn = document.createElement('button');
    fallbackBtn.textContent = '📁 Загрузить фото (если не сработало)';
    fallbackBtn.style.fontSize = '14px';
    fallbackBtn.style.padding = '10px 20px';
    nativeScanBtn.parentNode.insertBefore(fallbackBtn, nativeScanBtn.nextSibling);

    const cameraInput = document.createElement('input');
    cameraInput.type = 'file';
    cameraInput.accept = 'image/*';
    cameraInput.style.display = 'none';
    document.body.appendChild(cameraInput);

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
        try {
            const result = tryDecode(croppedCanvas);
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