document.addEventListener('DOMContentLoaded', () => {
    const uploadBtn = document.getElementById('upload-btn');
    const cropContainer = document.getElementById('crop-container');
    const imageToCrop = document.getElementById('image-to-crop');
    const cropScanBtn = document.getElementById('crop-scan-btn');
    const cancelCropBtn = document.getElementById('cancel-crop-btn');
    const resultP = document.getElementById('result');
    const tg = window.Telegram.WebApp;
    tg.ready();

    let cropper = null;
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    // --- Загрузка фото ---
    uploadBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
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
                autoCropArea: 0.4,
                responsive: true,
                background: false,
            });
        };
        reader.readAsDataURL(file);
        fileInput.value = '';
    });

    // --- Сканирование выделенной области ---
    cropScanBtn.addEventListener('click', async () => {
        if (!cropper) return;
        resultP.innerText = '⏳ Сканирую Data Matrix...';
        cropScanBtn.disabled = true;

        const croppedCanvas = cropper.getCroppedCanvas({ width: 2000, height: 2000 });
        const blob = await new Promise(resolve => croppedCanvas.toBlob(resolve, 'image/png', 1.0));

        // Используем постоянный скрытый div #reader (он есть в index.html)
        const html5QrCode = new Html5Qrcode("reader");
        try {
            const result = await html5QrCode.scanFile(blob, false);
            resultP.innerText = '✅ Считано: ' + result;
            closeCrop();
        } catch (err) {
            resultP.innerText = '❌ Data Matrix не найден. Попробуйте обвести точнее, снять ближе и без бликов.';
        } finally {
            cropScanBtn.disabled = false;
            html5QrCode.clear();
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