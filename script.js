/**
 * Smart Doorbell - Web App Camera Listener
 * 
 * This script continuously polls the ThingSpeak API to detect when the 
 * doorbell push button in Wokwi is pressed (field1 == "1").
 * Upon detection, it automatically:
 *   1. Requests browser access to the user's webcam (`getUserMedia`).
 *   2. Displays the live video feed inside a <video> element.
 *   3. Synthesizes a doorbell chime via Web Audio API.
 *   4. Resets the ThingSpeak state back to '0' to avoid repeated loops.
 */

// ==========================================
// 1. CONFIGURATION
// ==========================================
const CONFIG = {
    CHANNEL_ID: "3433070",     // Replace with your ThingSpeak Channel ID
    READ_API_KEY: "B9SC45D5HXQ6ZVPG
",   // Replace with your ThingSpeak Read API Key
    WRITE_API_KEY: "5WN4JU80SLVSZNXT
", // Replace with your Write API Key (for auto-reset)
    POLL_INTERVAL_MS: 2000,                          // Check ThingSpeak every 2 seconds
    AUTO_RESET_STATE: true                           // Automatically reset field1 to 0 after trigger
};

// ==========================================
// 2. STATE & DOM SELECTORS
// ==========================================
let isCameraActive = false;
let pollingIntervalId = null;
let mediaStream = null;

// DOM Elements (Ensure your HTML elements match these IDs)
const videoElement = document.getElementById("webcamVideo");
const statusElement = document.getElementById("statusMessage");
const lastTriggerElement = document.getElementById("lastTriggerTime");
const startPollBtn = document.getElementById("startPollBtn");
const stopPollBtn = document.getElementById("stopPollBtn");
const stopCamBtn = document.getElementById("stopCamBtn");

// ==========================================
// 3. INITIALIZATION
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    updateStatus("System initialized. Click 'Start Polling' to listen for Wokwi events.", "info");
    
    // Attach Event Listeners to Buttons
    if (startPollBtn) startPollBtn.addEventListener("click", startPolling);
    if (stopPollBtn) stopPollBtn.addEventListener("click", stopPolling);
    if (stopCamBtn) stopCamBtn.addEventListener("click", stopWebcam);
});

// ==========================================
// 4. THINGSPEAK POLLING LOGIC
// ==========================================

/**
 * Starts the polling loop to check ThingSpeak state periodically
 */
function startPolling() {
    if (pollingIntervalId) return; // Prevent multiple intervals

    updateStatus("Polling ThingSpeak for doorbell button press...", "active");
    if (startPollBtn) startPollBtn.disabled = true;
    if (stopPollBtn) stopPollBtn.disabled = false;

    // Run first check immediately, then repeatedly on interval
    checkDoorbellState();
    pollingIntervalId = setInterval(checkDoorbellState, CONFIG.POLL_INTERVAL_MS);
}

/**
 * Stops the active polling loop
 */
function stopPolling() {
    if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
        pollingIntervalId = null;
    }
    updateStatus("Polling paused.", "warning");
    if (startPollBtn) startPollBtn.disabled = false;
    if (stopPollBtn) stopPollBtn.disabled = true;
}

/**
 * Fetches the latest channel entry from ThingSpeak
 */
async function checkDoorbellState() {
    const url = `https://api.thingspeak.com/channels/${CONFIG.CHANNEL_ID}/fields/1/last.json?api_key=${CONFIG.READ_API_KEY}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error status: ${response.status}`);
        
        const data = await response.json();
        
        // ThingSpeak field1 holds "1" when Wokwi doorbell is pressed
        if (data && data.field1 === "1") {
            console.log("Doorbell Trigger Detected from Wokwi!", data.created_at);
            onDoorbellTriggered(data.created_at);
        }
    } catch (error) {
        console.error("ThingSpeak Polling Error:", error);
        updateStatus("Connection error with ThingSpeak cloud.", "error");
    }
}

// ==========================================
// 5. EVENT HANDLERS & CAMERA CONTROLS
// ==========================================

/**
 * Executed when a doorbell button press event is received
 */
async function onDoorbellTriggered(timestamp) {
    const triggerTime = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
    
    if (lastTriggerElement) {
        lastTriggerElement.textContent = `Last Doorbell Press: ${triggerTime}`;
    }

    updateStatus(`🔔 DOORBELL PRESSED at ${triggerTime}! Opening Webcam...`, "alert");
    
    // Play audio notification chime
    playDoorbellChime();

    // Open webcam feed
    await openWebcam();

    // Reset cloud state so it doesn't repeatedly trigger every 2 seconds
    if (CONFIG.AUTO_RESET_STATE && CONFIG.WRITE_API_KEY) {
        await resetThingSpeakState();
    }
}

/**
 * Requests webcam access via WebRTC API and attaches stream to HTML5 <video> tag
 */
async function openWebcam() {
    if (isCameraActive) return;

    try {
        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user"
            },
            audio: false
        };

        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (videoElement) {
            videoElement.srcObject = mediaStream;
            videoElement.play();
        }

        isCameraActive = true;
        if (stopCamBtn) stopCamBtn.disabled = false;
        updateStatus("Webcam stream LIVE.", "success");
    } catch (err) {
        console.error("Webcam Access Error:", err);
        updateStatus("Failed to access camera: " + err.message, "error");
    }
}

/**
 * Stops and releases the active webcam stream
 */
function stopWebcam() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }

    if (videoElement) {
        videoElement.srcObject = null;
    }

    isCameraActive = false;
    if (stopCamBtn) stopCamBtn.disabled = true;
    updateStatus("Webcam stream closed.", "info");
}

/**
 * Resets field1 back to '0' on ThingSpeak so next button press can trigger fresh
 */
async function resetThingSpeakState() {
    const resetUrl = `https://api.thingspeak.com/update?api_key=${CONFIG.WRITE_API_KEY}&field1=0`;
    try {
        await fetch(resetUrl);
        console.log("ThingSpeak trigger field reset to '0'.");
    } catch (err) {
        console.error("Failed to reset ThingSpeak trigger field:", err);
    }
}

// ==========================================
// 6. UTILITIES & AUDIO
// ==========================================

/**
 * Generates a two-tone doorbell chime using Web Audio API (no external MP3 needed)
 */
function playDoorbellChime() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        
        // Tone 1 ("Ding" - E5)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.frequency.setValueAtTime(659.25, ctx.currentTime);
        gain1.gain.setValueAtTime(0.3, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.8);

        // Tone 2 ("Dong" - C5)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.frequency.setValueAtTime(523.25, ctx.currentTime + 0.4);
        gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.4);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.4);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(ctx.currentTime + 0.4);
        osc2.stop(ctx.currentTime + 1.4);
    } catch (e) {
        console.warn("Web Audio API not supported or user gesture needed:", e);
    }
}

/**
 * Updates UI status text and styling
 */
function updateStatus(message, styleType) {
    if (!statusElement) return;
    statusElement.textContent = message;
    statusElement.className = `status-banner status-${styleType}`;
}
```eof

The `script.js` file is now ready! Remember to update `CONFIG.CHANNEL_ID`, `CONFIG.READ_API_KEY`, and `CONFIG.WRITE_API_KEY` with your actual ThingSpeak credentials. Let me know if you need an accompanying `index.html` file or further assistance!
