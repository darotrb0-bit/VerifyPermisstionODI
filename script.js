// =================================================================================
// --- CONFIGURATION ---
// =================================================================================
const API_KEY = "AIzaSyBcLvey5a-_JdXZqN37tNLUFncQ9j4lulY"; // <--- ដាក់ API Key របស់អ្នក
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwyl-6WxEgEXE3gZF1SmVq1xq1vwecC4xxs_JyBGDnqI1FRffqejA5MrpZ0OR49tFWB2Q/exec"; // <--- ដាក់ Web App URL

const REQUESTS_SHEET_ID = "18oonwPyyU6I0hHX-vucvoYSqGf_S7wPnQX817CqauPE";
const FETCH_TIMEOUT = 25000; // Timeout in milliseconds (25 seconds)

// =================================================================================
// --- DOM ELEMENTS & APP STATE ---
// =================================================================================
const identitySelect = document.getElementById("identity-select");
const verificationSection = document.getElementById("verification-section");
const employeeNameEl = document.getElementById("employee-name");
const referencePhotoEl = document.getElementById("reference-photo");
const startCameraBtn = document.getElementById("start-camera-btn");
const switchCameraBtn = document.getElementById("switch-camera-btn");
const captureBtn = document.getElementById("capture-btn");
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const cameraContainer = document.getElementById("camera-container");
const resultCard = document.getElementById("result-card");
const resultText = document.getElementById("result-text");
const loaderOverlay = document.getElementById("loader-overlay");
const loaderText = document.getElementById("loader-text");

let allRequestsData = [];
let referenceFaceDescriptor;
let currentStream;
let facingMode = "user";

// =================================================================================
// --- CORE FUNCTIONS ---
// =================================================================================

function showLoader(text) {
  loaderText.textContent = text;
  loaderOverlay.classList.remove("hidden");
}

function hideLoader() {
  loaderOverlay.classList.add("hidden");
}

async function loadModels() {
  showLoader("កំពុងរៀបចំម៉ូឌែល AI...");
  const MODEL_URL = "./models";
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
}

// ** UPDATED with new filtering logic **
function populateDropdown() {
  identitySelect.innerHTML =
    '<option value="" disabled selected>--- ជ្រើសរើសអត្តលេខ ---</option>';

  // CHANGED: Filter now checks if column N (index 11) is empty.
  // The data range C to N means C=0, D=1, E=2, F=3, G=4, H=5, I=6, J=7, K=8, L=9, M=10, N=11.
  const availableIDs = allRequestsData.filter(
    (row) => !row[11] || row[11].trim() === ""
  );

  if (availableIDs.length === 0) {
    identitySelect.innerHTML =
      "<option disabled>គ្មានអត្តលេខដែលត្រូវផ្ទៀងផ្ទាត់</option>";
    return;
  }
  availableIDs.forEach((row) => {
    const idValue = row[0];
    if (idValue) {
      const option = document.createElement("option");
      option.value = idValue;
      option.textContent = idValue;
      identitySelect.appendChild(option);
    }
  });
}

async function handleIdSelection() {
  const selectedId = this.value;
  if (!selectedId) return;
  verificationSection.classList.remove("hidden");
  resultCard.classList.add("hidden");
  referencePhotoEl.src = "";
  employeeNameEl.textContent = "ឈ្មោះ៖ កំពុងស្វែងរក...";
  referenceFaceDescriptor = null;
  startCameraBtn.disabled = true;
  stopCamera();
  showLoader("កំពុងទាញព័ត៌មានបុគ្គលិក...");
  try {
    const employeeRecord = allRequestsData.find((row) => row[0] === selectedId);
    employeeNameEl.textContent = `ឈ្មោះ៖ ${
      employeeRecord ? employeeRecord[1] || "មិនមាន" : "រកមិនឃើញ"
    }`;
    showLoader("កំពុងទាញយករូបថតពី Server...");
    const imageUrlRequest = `${APPS_SCRIPT_URL}?action=getImage&id=${selectedId}`;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Server Timeout")), FETCH_TIMEOUT)
    );
    const response = await Promise.race([
      fetch(imageUrlRequest),
      timeoutPromise,
    ]);
    const data = await response.json();
    if (data.status === "success") {
      referencePhotoEl.src = data.imageData;
      referencePhotoEl.onload = async () => {
        showLoader("កំពុងវិភាគផ្ទៃមុខយោង...");
        try {
          const detections = await faceapi
            .detectSingleFace(referencePhotoEl)
            .withFaceLandmarks()
            .withFaceDescriptor();
          if (detections) {
            referenceFaceDescriptor = detections.descriptor;
            startCameraBtn.disabled = false;
          } else {
            alert("រកមិនឃើញផ្ទៃមុខក្នុងរូបថតយោង!");
          }
        } catch (faceError) {
          alert("មានបញ្ហាក្នុងការវិភាគរូបថតយោង។");
        } finally {
          hideLoader();
        }
      };
      referencePhotoEl.onerror = () => {
        hideLoader();
        alert("មានបញ្ហាក្នុងការបង្ហាញរូបថត (Base64)។");
      };
    } else {
      hideLoader();
      alert(`មានបញ្ហាពី Server: ${data.message}`);
    }
  } catch (error) {
    hideLoader();
    console.error("Error processing selection:", error);
    if (error.message === "Server Timeout") {
      alert(
        `Server ใช้เวลาตอบสนองนานเกิน ${
          FETCH_TIMEOUT / 1000
        } វិនាទី។ สาเหตุหลักអាចមកពីរូបថតមានទំហំធំពេក។`
      );
    } else {
      alert("មានបញ្ហាក្នុងការទាក់ទងទៅកាន់ Apps Script។");
    }
  }
}

async function startCamera() {
  if (currentStream) stopCamera();
  try {
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facingMode },
    });
    video.srcObject = currentStream;
    cameraContainer.classList.remove("hidden");
    startCameraBtn.classList.add("hidden");
    switchCameraBtn.classList.remove("hidden");
    captureBtn.classList.remove("hidden");
  } catch (err) {
    console.error("Camera Error:", err);
    if (
      err.name === "NotAllowedError" ||
      err.name === "PermissionDeniedError"
    ) {
      alert(
        "ការអនុញ្ញាតឲ្យប្រើកាមេរ៉ាត្រូវបានបដិសេធ។\n\nសូមពិនិត្យមើលការកំណត់ (Settings) របស់ Browser រួចអនុញ្ញាតឲ្យเว็บនេះប្រើកាមេរ៉ា។"
      );
    } else {
      alert(`មិនអាចបើកកាមេរ៉ាបានទេ ដោយសារមានបញ្ហា៖ ${err.name}`);
    }
  }
}

function stopCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
  }
  video.srcObject = null;
  cameraContainer.classList.add("hidden");
  startCameraBtn.classList.remove("hidden");
  switchCameraBtn.classList.add("hidden");
  captureBtn.classList.add("hidden");
}

function switchCamera() {
  facingMode = facingMode === "user" ? "environment" : "user";
  startCamera();
}

async function captureAndVerify() {
  if (!referenceFaceDescriptor)
    return alert("សូមរង់ចាំរូបថតយោងដំណើរការជាមុនសិន។");
  showLoader("កំពុងផ្ទៀងផ្ទាត់...");
  const LIVENESS_MAX_SIZE = 480;
  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d");
  let newWidth = video.videoWidth;
  let newHeight = video.videoHeight;
  if (newWidth > LIVENESS_MAX_SIZE || newHeight > LIVENESS_MAX_SIZE) {
    if (newWidth > newHeight) {
      newHeight = Math.round(newHeight * (LIVENESS_MAX_SIZE / newWidth));
      newWidth = LIVENESS_MAX_SIZE;
    } else {
      newWidth = Math.round(newWidth * (LIVENESS_MAX_SIZE / newHeight));
      newHeight = LIVENESS_MAX_SIZE;
    }
  }
  tempCanvas.width = newWidth;
  tempCanvas.height = newHeight;
  if (facingMode === "user") {
    tempCtx.translate(newWidth, 0);
    tempCtx.scale(-1, 1);
  }
  tempCtx.drawImage(video, 0, 0, newWidth, newHeight);
  stopCamera();
  try {
    const detection = await faceapi
      .detectSingleFace(tempCanvas)
      .withFaceLandmarks()
      .withFaceDescriptor();
    resultCard.classList.remove("hidden", "success", "fail");
    if (detection) {
      const faceMatcher = new faceapi.FaceMatcher([referenceFaceDescriptor]);
      const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
      if (bestMatch.label !== "unknown") {
        resultText.textContent = `ផ្ទៀងផ្ទាត់ជោគជ័យ! (ភាពស្រដៀងគ្នា: ${(
          (1 - bestMatch.distance) *
          100
        ).toFixed(2)}%)`;
        resultCard.classList.add("success");
        showLoader("កំពុងរក្សាទុកម៉ោងចូល...");
        await writeTimeToSheetViaAppsScript(identitySelect.value);
      } else {
        resultText.textContent =
          "ផ្ទៀងផ្ទាត់មិនត្រឹមត្រូវ! ផ្ទៃមុខមិនត្រូវគ្នា។";
        resultCard.classList.add("fail");
      }
    } else {
      resultText.textContent = "រកមិនឃើញផ្ទៃមុខក្នុងរូបដែលបានថត។";
      resultCard.classList.add("fail");
    }
  } catch (error) {
    resultText.textContent = "មានបញ្ហាក្នុងពេលកំពុងផ្ទៀងផ្ទាត់។";
    resultCard.classList.add("fail");
  } finally {
    hideLoader();
  }
}

function closeApplication() {
  document.body.innerHTML = `
        <div class="final-message-container">
          <h1>ដំណើរការបានបញ្ចប់</h1>
          <p>ការផ្ទៀងផ្ទាត់ និងកត់ត្រាបានជោគជ័យ។</p>
          <p>កម្មវិធីនឹងព្យាយាមបិទដោយស្វ័យប្រវត្តិ។</p>
        </div>
      `;
  setTimeout(() => {
    window.close();
  }, 1500);
}

async function writeTimeToSheetViaAppsScript(employeeId) {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL === "YOUR_APPS_SCRIPT_URL_HERE") {
    return alert(
      "សូមបញ្ចូល APPS_SCRIPT_URL របស់អ្នកក្នុងไฟล์ script.js ជាមុនសិន!"
    );
  }
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ employeeId: employeeId }),
    });
    const result = await response.json();
    if (result.status === "success") {
      alert("បានរក្សាទុកម៉ោងចូលเรียบร้อยแล้ว!");
      closeApplication();
    } else {
      throw new Error(result.message);
    }
  } catch (err) {
    alert(`មានបញ្ហាក្នុងការសរសេរទិន្នន័យ៖ ${err.message}`);
  }
}

// ** UPDATED with new data range **
async function initializeApp() {
  await loadModels();
  try {
    showLoader("កំពុងទាញបញ្ជីឈ្មោះ...");

    // CHANGED: Expanded range to include column N for filtering.
    const requestsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${REQUESTS_SHEET_ID}/values/Requests!C2:N?key=${API_KEY}`;

    const response = await fetch(requestsUrl);
    if (!response.ok) throw new Error("Network response was not ok.");
    const jsonData = await response.json();
    allRequestsData = jsonData.values || [];
    populateDropdown();
  } catch (error) {
    console.error("Initialization failed:", error);
    identitySelect.innerHTML = `<option disabled>មានបញ្ហាក្នុងការទាញទិន្នន័យ</option>`;
  } finally {
    hideLoader();
  }
}

// =================================================================================
// --- EVENT LISTENERS & APP START ---
// =================================================================================
identitySelect.addEventListener("change", handleIdSelection);
startCameraBtn.addEventListener("click", startCamera);
switchCameraBtn.addEventListener("click", switchCamera);
captureBtn.addEventListener("click", captureAndVerify);

initializeApp();
