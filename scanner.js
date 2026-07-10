const video = document.getElementById('video');
const captureBtn = document.getElementById('capture-btn');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomSlider = document.getElementById('zoom-slider');
const resultP = document.getElementById('result');
const cropContainer = document.getElementById('crop-container');
const imageToCrop = document.getElementById('image-to-crop');
const cropScanBtn = document.getElementById('crop-scan-btn');
const cancelCropBtn = document.getElementById('cancel-crop-btn');

let stream = null;
let currentZoom = 1;
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

async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        });
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play();
            applyZoom(currentZoom);
        };
    } catch (err) {
        resultP.innerText = '❌ Ошибка камеры: ' + err.message;
    }
}

function applyZoom(zoom) {
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;
    const capabilities = videoTrack.getCapabilities();
    if ('zoom' in capabilities) {
        const newZoom = Math.min(capabilities.zoom.max, Math.max(capabilities.zoom.min, zoom));
        videoTrack.applyConstraints({ advanced: [{ zoom: newZoom }] })
            .then(() => {
                currentZoom = newZoom;
                zoomSlider.value = newZoom;
            })
            .catch(err => console.warn('Зум не поддерживается', err));
    } else {
        console.warn('Зум недоступен');
    }
}

zoomInBtn.addEventListener('click', () => applyZoom(currentZoom + 0.5));
zoomOutBtn.addEventListener('click', () => applyZoom(currentZoom - 0.5));
zoomSlider.addEventListener('input', (e) => applyZoom(parseFloat(e.target.value)));

captureBtn.addEventListener('click', async () => {
    resultP.innerText = '⏳ Обработка...';
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    try {
        const html5QrCode = new Html5Qrcode();
        const result = await html5QrCode.scanFile(blob, false);
        resultP.innerText = '✅ Сканировано: ' + result;
        if (confirm('Сохранить результат в файл?')) {
            saveTextAsFile(result);
        }
    } catch (err) {
        resultP.innerText = '❌ Не распознано. Можно обрезать снимок.';
        const url = URL.createObjectURL(blob);
        imageToCrop.src = url;
        cropContainer.style.display = 'flex';
        if (cropper) cropper.destroy();
        cropper = new Cropper(imageToCrop, {
            aspectRatio: NaN,
            viewMode: 1,
            autoCropArea: 0.3,
            responsive: true,
            background: false,
            zoomable: true,
            movable: true,
        });
    }
});

cropScanBtn.addEventListener('click', async () => {
    if (!cropper) return;
    const croppedCanvas = cropper.getCroppedCanvas({ width: 2400, height: 2400 });
    const blob = await new Promise(resolve => croppedCanvas.toBlob(resolve, 'image/png'));
    try {
        const html5QrCode = new Html5Qrcode();
        const result = await html5QrCode.scanFile(blob, false);
        resultP.innerText = '✅ Сканировано: ' + result;
        if (confirm('Сохранить результат в файл?')) {
            saveTextAsFile(result);
        }
        closeCrop();
    } catch (err) {
        resultP.innerText = '❌ Код не найден. Попробуйте обвести точнее.';
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

startCamera();