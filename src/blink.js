// Webcam blink detection with MediaPipe Face Landmarker + Eye Aspect Ratio (EAR).
// The MediaPipe library is loaded lazily, so keyboard-only players never download it.
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const LEFT = [33, 160, 158, 133, 153, 144];
const RIGHT = [362, 385, 387, 263, 373, 380];
const COOLDOWN = 350;

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
export function eyeEAR(lm, idx) {
  const [p1, p2, p3, p4, p5, p6] = idx.map(i => lm[i]);
  const h = dist(p1, p4);
  return h > 0 ? (dist(p2, p6) + dist(p3, p5)) / (2 * h) : 0;
}

export class BlinkDetector {
  constructor() {
    this.ear = 0; this.baseline = 0; this.threshold = 0;
    this.closed = false; this.closedAt = 0; this.lastBlink = 0;
    this.onBlink = null; this.face = false; this.running = false;
    this.sensitivity = 0.75;
    this.calSamples = null;
  }

  async start(video) {
    this.video = video;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false });
    video.srcObject = stream;
    await video.play();
    this.stream = stream;
    const vision = await import('@mediapipe/tasks-vision');
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: 'VIDEO', numFaces: 1,
    });
    try { this.lm = await vision.FaceLandmarker.createFromOptions(fileset, opts('GPU')); }
    catch { this.lm = await vision.FaceLandmarker.createFromOptions(fileset, opts('CPU')); }
    this.running = true;
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
  }

  loop() {
    if (!this.running) return;
    const v = this.video;
    const now = performance.now();
    if (v.readyState >= 2 && now - (this.lastT || 0) > 30) {
      this.lastT = now;
      try {
        const r = this.lm.detectForVideo(v, now);
        const lm = r.faceLandmarks && r.faceLandmarks[0];
        this.face = !!lm;
        if (lm) this.process((eyeEAR(lm, LEFT) + eyeEAR(lm, RIGHT)) / 2, now);
      } catch { /* frame skipped */ }
    }
    requestAnimationFrame(() => this.loop());
  }

  process(ear, now) {
    this.ear = ear;
    if (this.calSamples) { this.calSamples.push(ear); return; }
    if (!this.threshold) return;
    if (!this.closed && ear < this.threshold) { this.closed = true; this.closedAt = now; }
    else if (this.closed && ear > this.threshold * 1.08) {
      this.closed = false;
      const dur = now - this.closedAt;
      if (dur > 30 && dur < 1200 && now - this.lastBlink > COOLDOWN) {
        this.lastBlink = now;
        if (this.onBlink) this.onBlink();
      }
    }
  }

  // Keep eyes open for `ms`; baseline = median open-eye EAR.
  calibrate(ms = 3000, onProgress) {
    this.calSamples = [];
    const t0 = performance.now();
    return new Promise((resolve) => {
      const tick = () => {
        const p = (performance.now() - t0) / ms;
        if (onProgress) onProgress(Math.min(1, p));
        if (p < 1) return requestAnimationFrame(tick);
        const s = this.calSamples.sort((a, b) => a - b);
        this.calSamples = null;
        if (s.length < 10) return resolve(false);
        this.baseline = s[Math.floor(s.length * 0.6)];
        this.setSensitivity(this.sensitivity);
        resolve(true);
      };
      tick();
    });
  }

  setSensitivity(v) {
    this.sensitivity = v;
    if (this.baseline) this.threshold = this.baseline * v;
  }
}
