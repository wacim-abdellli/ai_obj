// DOM Elements
const video = document.getElementById("video");
const canvas = document.getElementById('c1');
const ctx = canvas.getContext('2d');
const aiToggle = document.getElementById("ai");
const fpsSlider = document.getElementById("fps");
const confidenceSlider = document.getElementById("confidence");
const loadingText = document.getElementById("loadingText");
const statusText = document.getElementById("statusText");
const objectCounter = document.getElementById("objectCounter");
const objectList = document.getElementById("objectList");
const captureBtn = document.getElementById("captureBtn");
const cameraSelect = document.getElementById("cameraSelect");

// App state
let cameraAvailable = false;
let aiEnabled = false;
let fps = 16;
let confidenceThreshold = 0.5;
let isProcessing = false;
let detectionColors = {};
let currentStream = null;

// Detection memory
let detectionHistory = [];
const HISTORY_DURATION = 1000; // milliseconds

// Initialize event listeners
aiToggle.addEventListener("change", toggleAi);
fpsSlider.addEventListener("input", changeFps);
confidenceSlider.addEventListener("input", changeConfidence);
captureBtn.addEventListener("click", captureFrame);
cameraSelect.addEventListener("change", switchCamera);

// Initialize app when page loads
window.onload = function() {
    setupCameras();
    timerCallback();
}

// Set up available cameras
async function setupCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        cameraSelect.innerHTML = '';

        const envOption = document.createElement('option');
        envOption.value = 'environment';
        envOption.textContent = 'Back Camera';
        cameraSelect.appendChild(envOption);

        const userOption = document.createElement('option');
        userOption.value = 'user';
        userOption.textContent = 'Front Camera';
        cameraSelect.appendChild(userOption);

        videoDevices.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Camera ${index + 1}`;
            cameraSelect.appendChild(option);
        });

        switchCamera();
    } catch (err) {
        console.error("Error enumerating devices:", err);
        setupCamera();
    }
}

// Setup default camera
function setupCamera() {
    const constraints = {
        audio: false,
        video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 }
        }
    };

    navigator.mediaDevices.getUserMedia(constraints)
        .then(function(stream) {
            video.srcObject = stream;
            currentStream = stream;
            cameraAvailable = true;
            updateStatus("Camera ready");
        })
        .catch(function(err) {
            console.error("Camera error:", err);
            updateStatus("Camera error: " + err.message, "error");
            setTimeout(setupCamera, 2000);
        });
}

// Switch between cameras
async function switchCamera() {
    const selection = cameraSelect.value;
    if (currentStream) currentStream.getTracks().forEach(track => track.stop());

    const constraints = {
        audio: false,
        video: {}
    };

    if (selection === 'environment' || selection === 'user') {
        constraints.video.facingMode = selection;
    } else {
        constraints.video.deviceId = { exact: selection };
    }

    constraints.video.width = { ideal: 1280 };
    constraints.video.height = { ideal: 720 };

    try {
        cameraAvailable = false;
        updateStatus("Switching camera...");

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        currentStream = stream;
        cameraAvailable = true;

        updateStatus("Camera switched successfully");
    } catch (err) {
        console.error("Error switching camera:", err);
        updateStatus("Failed to switch camera: " + err.message, "error");
        setupCamera();
    }
}

// Main processing loop
function timerCallback() {
    if (isReady()) {
        setCanvasSize();
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        if (aiEnabled && !isProcessing) runDetection();
    }
    setTimeout(timerCallback, fps);
}

// Check if app is ready
function isReady() {
    if (modelIsLoaded && cameraAvailable) {
        loadingText.style.display = "none";
        document.getElementById("controls").style.display = "block";
        aiToggle.disabled = false;
        return true;
    } else {
        return false;
    }
}

// Set canvas size based on video dimensions
function setCanvasSize() {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
        const maxWidth = Math.min(window.innerWidth * 0.9, 800);
        if (maxWidth < video.videoWidth) {
            canvas.width = maxWidth;
            const ratio = canvas.width / video.videoWidth;
            canvas.height = video.videoHeight * ratio;
        } else {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }
    }
}

// Toggle AI detection
function toggleAi() {
    aiEnabled = aiToggle.checked;
    updateStatus(aiEnabled ? "AI detection activated" : "AI detection deactivated");
    if (!aiEnabled) clearObjectList();
}

// Change FPS based on slider
function changeFps() {
    fps = 1000 / fpsSlider.value;
    document.getElementById("fpsValue").textContent = fpsSlider.value;
}

// Change confidence threshold
function changeConfidence() {
    confidenceThreshold = confidenceSlider.value / 100;
    document.getElementById("confidenceValue").textContent = confidenceSlider.value + "%";
}

// Run object detection
function runDetection() {
    isProcessing = true;

    objectDetector.detect(canvas, (err, results) => {
        if (err) {
            console.error("Detection error:", err);
            isProcessing = false;
            return;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const filteredResults = results.filter(item => item.confidence >= confidenceThreshold);
        drawDetections(filteredResults);
        updateObjectList(filteredResults);
        isProcessing = false;
    });
}

// Modified detection drawing
function drawDetections(detections) {
    const now = Date.now();

    // Add new detections
    detections.forEach(obj => {
        detectionHistory.push({
            ...obj,
            timestamp: now
        });
    });

    // Keep only recent detections
    detectionHistory = detectionHistory.filter(obj => now - obj.timestamp < HISTORY_DURATION);

    // Draw perimeter only
    detectionHistory.forEach(obj => {
        const color = getColorForLabel(obj.label);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);

        const label = `${obj.label} (${(obj.confidence * 100).toFixed(0)}%)`;
        const textWidth = ctx.measureText(label).width + 10;

// Label background (dark semi-transparent)
ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
ctx.fillRect(obj.x, obj.y - 24, textWidth, 22);

// Label text (white)
ctx.fillStyle = "white";
ctx.font = "bold 14px Arial";
ctx.fillText(label, obj.x + 5, obj.y - 9);

    });
}

// Generate consistent color per label
function getColorForLabel(label) {
    if (detectionColors[label]) return detectionColors[label];
    let hash = 0;
    for (let i = 0; i < label.length; i++) {
        hash = label.charCodeAt(i) + ((hash << 5) - hash);
    }
    const r = (hash & 0xFF0000) >> 16;
    const g = (hash & 0x00FF00) >> 8;
    const b = hash & 0x0000FF;
    const color = `rgb(${r}, ${g}, ${b})`;
    detectionColors[label] = color;
    return color;
}

// Update list of detected objects
function updateObjectList(detections) {
    objectList.innerHTML = '';
    const counts = {};
    detections.forEach(obj => {
        counts[obj.label] = (counts[obj.label] || 0) + 1;
    });

    const sortedObjects = Object.keys(counts).sort().map(label => ({
        label: label,
        count: counts[label],
        color: getColorForLabel(label)
    }));

    sortedObjects.forEach(obj => {
        const item = document.createElement('div');
        item.className = 'object-item';
        const colorBox = document.createElement('span');
        colorBox.className = 'color-box';
        colorBox.style.backgroundColor = obj.color;
        const text = document.createElement('span');
        text.textContent = `${obj.label}: ${obj.count}`;
        item.appendChild(colorBox);
        item.appendChild(text);
        objectList.appendChild(item);
    });

    objectCounter.textContent = detections.length;
    objectCounter.style.display = detections.length > 0 ? 'inline-block' : 'none';
}

// Clear object list
function clearObjectList() {
    objectList.innerHTML = '';
    objectCounter.style.display = 'none';
}

// Save image
function captureFrame() {
    const link = document.createElement('a');
    link.download = 'detection-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    updateStatus("Image saved to downloads");
}

// Update status message
function updateStatus(message, type = "normal") {
    statusText.textContent = message;
    statusText.className = "status";
    if (type === "error") {
        statusText.classList.add("status-error");
    } else if (type === "success") {
        statusText.classList.add("status-success");
    }
    statusText.style.display = "block";
}
