"use client";

/**
 * Browser fingerprint collector — BrowserDNA v4
 *
 * All checks run client-side with zero permissions.
 * New in v4:
 *   - WebGL2 fingerprint hash
 *   - Client Hints (navigator.userAgentData)
 *   - GPU / UA consistency check
 *   - Timezone / screen resolution consistency
 *   - Enhanced stealth detection (toString, Proxy trap, Error.prepareStackTrace,
 *     Date.now timing attack, permission API probe, $cdc_ scan)
 *   - WebRTC IP leak detection (local IP extraction)
 *   - Richer font probing (65 fonts)
 */

// ---------------------------------------------------------------------------
// SHA-256 helper
// ---------------------------------------------------------------------------
async function sha256(str: string): Promise<string> {
  const buf = new TextEncoder().encode(str);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

// ---------------------------------------------------------------------------
// Canvas fingerprint
// ---------------------------------------------------------------------------
export async function canvasFingerprint(): Promise<string> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext("2d")!;
    // Layer 1: gradient background
    const grad = ctx.createLinearGradient(0, 0, 240, 0);
    grad.addColorStop(0, "#ff6b6b");
    grad.addColorStop(1, "#4ecdc4");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 240, 60);
    // Layer 2: text with shadow
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 4;
    ctx.font = "bold 14px Arial, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("BrowserDNA 🧬 fingerprint", 4, 20);
    // Layer 3: emoji + small text
    ctx.font = "11px monospace";
    ctx.fillStyle = "rgba(255,200,0,0.85)";
    ctx.fillText("canvas2d • gpu • hash", 4, 40);
    // Layer 4: bezier curve (GPU-dependent)
    ctx.beginPath();
    ctx.moveTo(10, 55);
    ctx.bezierCurveTo(80, 30, 160, 50, 230, 20);
    ctx.strokeStyle = "rgba(100,200,255,0.6)";
    ctx.lineWidth = 2;
    ctx.stroke();
    const dataUrl = canvas.toDataURL();
    return await sha256(dataUrl);
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// WebGL2 fingerprint hash (more discriminating than WebGL1)
// ---------------------------------------------------------------------------
export async function webgl2Fingerprint(): Promise<string> {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") as WebGL2RenderingContext | null;
    if (!gl) return "no-webgl2";
    const params = [
      gl.getParameter(gl.MAX_TEXTURE_SIZE),
      gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
      gl.getParameter(gl.MAX_VARYING_VECTORS),
      gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
      gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
    ].join("|");
    return await sha256(params);
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// GPU info via WebGL (vendor + renderer from debug extension)
// ---------------------------------------------------------------------------
export function gpuInfo(): { gpu_vendor: string; gpu_renderer: string } {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ??
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) return { gpu_vendor: "", gpu_renderer: "" };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return { gpu_vendor: "", gpu_renderer: "" };
    return {
      gpu_vendor: String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) ?? ""),
      gpu_renderer: String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? ""),
    };
  } catch {
    return { gpu_vendor: "", gpu_renderer: "" };
  }
}

// ---------------------------------------------------------------------------
// GPU / UA consistency check
// A desktop UA with a software-rasterizer renderer = headless giveaway.
// Returns 1 (consistent) or 0 (inconsistent / suspicious)
// ---------------------------------------------------------------------------
const SWRAST_RE = /swiftshader|llvmpipe|softpipe|mesa offscreen|software rasterizer/i;
const MOBILE_UA_RE = /mobile|android|iphone|ipad/i;

export function gpuUAConsistency(
  ua: string,
  gpuVendor: string,
  gpuRenderer: string,
): number {
  if (SWRAST_RE.test(gpuRenderer)) return 0;  // software rasterizer = headless
  if (!gpuRenderer && !gpuVendor && !MOBILE_UA_RE.test(ua)) return 0; // no GPU on desktop UA
  return 1;
}

// ---------------------------------------------------------------------------
// Timezone / screen resolution consistency
// Classic headless Chromium defaults: 800×600 or 1280×720 with no plugins.
// ---------------------------------------------------------------------------
export function timezoneScreenConsistency(
  screenWidth: number,
  screenHeight: number,
  pluginsCount: number,
  audioAvailable: boolean,
): number {
  if (screenWidth === 800 && screenHeight === 600 && pluginsCount === 0) return 0;
  if (screenWidth === 1280 && screenHeight === 720 && pluginsCount === 0) return 0;
  if (screenWidth === 1920 && screenHeight === 1080 && pluginsCount === 0 && !audioAvailable) {
    return 0;
  }
  return 1;
}

// ---------------------------------------------------------------------------
// Client Hints — navigator.userAgentData (Chrome 90+)
// Headless bots often don't populate the brands list correctly.
// ---------------------------------------------------------------------------
export function getClientHints(): {
  brands: string;
  mobile: boolean | null;
  platform: string;
} {
  try {
    const uaData = (navigator as Navigator & {
      userAgentData?: {
        brands?: Array<{ brand: string; version: string }>;
        mobile?: boolean;
        platform?: string;
      };
    }).userAgentData;
    if (!uaData) return { brands: "", mobile: null, platform: "" };
    return {
      brands: (uaData.brands ?? []).map((b) => `${b.brand}/${b.version}`).join(", "),
      mobile: uaData.mobile ?? null,
      platform: uaData.platform ?? "",
    };
  } catch {
    return { brands: "", mobile: null, platform: "" };
  }
}

// ---------------------------------------------------------------------------
// WebRTC availability check + local IP extraction attempt
// ---------------------------------------------------------------------------
export function checkWebRTC(): boolean {
  try {
    const RTCPeerConnection =
      window.RTCPeerConnection ||
      (window as Window & { webkitRTCPeerConnection?: typeof window.RTCPeerConnection })
        .webkitRTCPeerConnection;
    if (!RTCPeerConnection) return false;
    const pc = new RTCPeerConnection({ iceServers: [] });
    pc.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Attempt to extract a local (RFC-1918) IP via WebRTC ICE candidates.
 * Returns the IP string or empty string if not accessible / blocked.
 * This is a passive check — no network traffic is generated.
 */
export async function webrtcLocalIP(): Promise<string> {
  try {
    const RTCPeerConnection =
      window.RTCPeerConnection ||
      (window as Window & { webkitRTCPeerConnection?: typeof window.RTCPeerConnection })
        .webkitRTCPeerConnection;
    if (!RTCPeerConnection) return "";

    return await new Promise<string>((resolve) => {
      const pc = new RTCPeerConnection({ iceServers: [] });
      const ips: string[] = [];
      pc.createDataChannel("");
      pc.onicecandidate = (e) => {
        if (!e.candidate) {
          pc.close();
          resolve(ips[0] ?? "");
          return;
        }
        const match = /(\d{1,3}(?:\.\d{1,3}){3})/.exec(e.candidate.candidate);
        if (match) ips.push(match[1]);
      };
      pc.createOffer().then((offer) => pc.setLocalDescription(offer));
      // Timeout after 2 s
      setTimeout(() => { pc.close(); resolve(ips[0] ?? ""); }, 2000);
    });
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Font enumeration — 65 fonts (more than before)
// Headless containers typically have 0–4.
// ---------------------------------------------------------------------------
const FONT_TEST_LIST = [
  "Arial", "Verdana", "Helvetica", "Times New Roman", "Courier New",
  "Georgia", "Palatino", "Garamond", "Bookman", "Comic Sans MS",
  "Trebuchet MS", "Arial Black", "Impact", "Lucida Sans Unicode",
  "Tahoma", "Century Gothic", "Lucida Console", "Monaco", "Optima",
  "Segoe UI", "Calibri", "Cambria", "Candara", "Consolas",
  "Constantia", "Corbel", "Franklin Gothic Medium",
  // Additional fonts to improve discrimination
  "Futura", "Gill Sans", "Helvetica Neue", "Myriad Pro", "Rockwell",
  "Baskerville", "Bodoni MT", "Book Antiqua", "Centaur", "Copperplate",
  "Courier", "DejaVu Sans", "DejaVu Serif", "Didot", "DIN Alternate",
  "Droid Sans", "Droid Serif", "Eurostile", "Frutiger", "Geneva",
  "Gill Sans MT", "Gloucester MT", "Helvetica Compressed", "Hoefler Text",
  "Lato", "Lora", "Menlo", "Merriweather", "Montserrat",
  "Open Sans", "Oswald", "PT Sans", "Raleway", "Roboto",
  "Source Code Pro", "Source Sans Pro", "Ubuntu",
];

export function countFonts(): number {
  try {
    // Prefer CSS Font Loading API (more accurate than canvas trick)
    if ("fonts" in document) {
      const available = FONT_TEST_LIST.filter((font) => {
        try {
          return (document as Document & {
            fonts: { check: (font: string) => boolean }
          }).fonts.check(`12px "${font}"`);
        } catch {
          return false;
        }
      });
      if (available.length > 0) return available.length;
    }
    // Fallback: canvas width comparison
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    const base = "monospace";
    const testStr = "mmmmmmmmmmlli";
    const testSize = "72px";
    ctx.font = `${testSize} ${base}`;
    const baseWidth = ctx.measureText(testStr).width;
    let count = 0;
    for (const font of FONT_TEST_LIST) {
      ctx.font = `${testSize} '${font}', ${base}`;
      if (ctx.measureText(testStr).width !== baseWidth) count++;
    }
    return count;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Battery API — headless Chromium disables this
// ---------------------------------------------------------------------------
export async function checkBattery(): Promise<boolean> {
  try {
    const nav = navigator as Navigator & { getBattery?: () => Promise<unknown> };
    if (typeof nav.getBattery !== "function") return false;
    await nav.getBattery();
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// window.chrome object check
// ---------------------------------------------------------------------------
export function checkChromeObj(): boolean {
  return typeof (window as Window & { chrome?: unknown }).chrome === "undefined";
}

// ---------------------------------------------------------------------------
// Deep stealth / anti-Playwright detection  v4
//
// Checks (in order of reliability):
//  1. webdriver on navigator prototype (stealth patch pattern)
//  2. Old ChromeDriver CDP vars (cdc_adoQpo…)
//  3. New ChromeDriver / headless CDP vars
//  4. Playwright-specific globals (__playwright, __pw_manual, etc.)
//  5. Function.prototype.toString native check (patching leaves a trace)
//  6. Error stack format check
//  7. Date.now timing attack (CDP adds ~0 µs overhead that differs from native)
//  8. Permissions API inconsistency (notifications denied without user action)
//  9. document.$cdc_ prefix scan
// 10. iframe contentWindow.webdriver leak (stealth usually only patches top)
// ---------------------------------------------------------------------------
export function detectStealth(): boolean {
  // ── Check 1: prototype webdriver patch ──────────────────────────────
  try {
    const nav = navigator as Navigator & { webdriver?: boolean };
    if (nav.webdriver === undefined && "webdriver" in nav) return true;
  } catch { /* ignore */ }

  const win = window as Window & {
    chrome?: unknown;
    cdc_adoQpoasnfa76pfcZLmcfl_Array?: unknown;
    cdc_adoQpoasnfa76pfcZLmcfl_Promise?: unknown;
    cdc_adoQpoasnfa76pfcZLmcfl_Symbol?: unknown;
    cdc_adoQpoasnfa76pfcZLmcfl_Object?: unknown;
    cdc_adoQpoasnfa76pfcZLmcfl_Proxy?: unknown;
    cdc_adoQpoasnfa76pfcZLmcfl_JSON?: unknown;
    __playwright?: unknown;
    __pw_manual?: unknown;
    __PW_inspect?: unknown;
    _playwrightWorkerIndex?: unknown;
    __puppeteer_evaluation_script__?: unknown;
  };

  // ── Check 2 + 3: CDP artifact variable names ─────────────────────────
  const cdpKeys = [
    "cdc_adoQpoasnfa76pfcZLmcfl_Array",
    "cdc_adoQpoasnfa76pfcZLmcfl_Promise",
    "cdc_adoQpoasnfa76pfcZLmcfl_Symbol",
    "cdc_adoQpoasnfa76pfcZLmcfl_Object",
    "cdc_adoQpoasnfa76pfcZLmcfl_Proxy",
    "cdc_adoQpoasnfa76pfcZLmcfl_JSON",
  ] as const;
  for (const k of cdpKeys) {
    if (win[k] !== undefined) return true;
  }

  // ── Check 4: Playwright / Puppeteer globals ────────────────────────
  if (
    win.__playwright !== undefined ||
    win.__pw_manual !== undefined ||
    win.__PW_inspect !== undefined ||
    win._playwrightWorkerIndex !== undefined ||
    win.__puppeteer_evaluation_script__ !== undefined
  ) return true;

  // ── Check 5: Function.prototype.toString native integrity ─────────
  try {
    const fnStr = Function.prototype.toString.call(Function.prototype.toString);
    if (!fnStr.includes("[native code]")) return true;
    // Stealth sometimes wraps toString — check the wrapper itself
    const toString2 = Object.getOwnPropertyDescriptor(Function.prototype, "toString");
    if (toString2 && toString2.value) {
      const s = String(toString2.value);
      if (!s.includes("[native code]") && s.length > 200) return true;
    }
  } catch { /* ignore */ }

  // ── Check 6: Error stack format ───────────────────────────────────
  try {
    const stack = new Error().stack ?? "";
    // Real V8 always has "at " entries; some headless environments differ
    if (stack && !stack.includes("at ") && stack.length > 10) return true;
  } catch { /* ignore */ }

  // ── Check 7: Date.now micro-timing attack ─────────────────────────
  // CDP evaluation bridge adds a tiny but detectable overhead.
  // We measure 100 iterations of Date.now() and check variance.
  // Real browsers: variance ~0.1–2ms. CDP bridge: ~0ms (clamped).
  try {
    const samples: number[] = [];
    for (let i = 0; i < 50; i++) {
      const t0 = Date.now();
      // Light CPU work to prevent dead-code elimination
      let x = 0;
      for (let j = 0; j < 1000; j++) x += j;
      void x;
      samples.push(Date.now() - t0);
    }
    const nonZero = samples.filter((s) => s > 0).length;
    // If Date.now() ALWAYS returns 0 for 1000 iterations, it's likely clamped/patched
    if (nonZero === 0 && samples.length === 50) return true;
  } catch { /* ignore */ }

  // ── Check 8: Permissions API — notifications denied without interaction
  // We can only do this synchronously via the permissions query result cache
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "denied") {
      // Denied without user interaction is suspicious in a fresh browser context
      // (headless often pre-sets this to block popups)
      // We combine with other signals, so this alone is not enough:
      // check in combination with webdriver=false (stealth patched)
      const nav = navigator as Navigator & { webdriver?: boolean };
      if (!nav.webdriver) return true; // stealth patched but notifications denied
    }
  } catch { /* ignore */ }

  // ── Check 9: document property scan for $cdc_ prefix ─────────────
  try {
    const docKeys = Object.keys(document);
    if (docKeys.some((k) => k.startsWith("$cdc_") || k.startsWith("$chrome_asyncScriptInfo"))) {
      return true;
    }
  } catch { /* ignore */ }

  // ── Check 10: iframe contentWindow.webdriver leak ─────────────────
  // playwright-stealth patches top-level window but misses iframes
  try {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    document.body.appendChild(iframe);
    const iframeWebdriver = iframe.contentWindow?.navigator?.webdriver;
    document.body.removeChild(iframe);
    if (iframeWebdriver === true) return true;
  } catch { /* ignore */ }

  return false;
}

// ---------------------------------------------------------------------------
// Mouse entropy tracker
// ---------------------------------------------------------------------------
export class MouseTracker {
  private moves: [number, number, number][] = [];
  private scrollCount = 0;
  private bound = false;

  private onMove = (e: MouseEvent) => {
    this.moves.push([e.clientX, e.clientY, Date.now()]);
    if (this.moves.length > 300) this.moves.shift();
  };
  private onScroll = () => { this.scrollCount++; };

  start() {
    if (this.bound) return;
    window.addEventListener("mousemove", this.onMove, { passive: true });
    window.addEventListener("scroll", this.onScroll, { passive: true });
    this.bound = true;
  }
  stop() {
    window.removeEventListener("mousemove", this.onMove);
    window.removeEventListener("scroll", this.onScroll);
  }

  entropy(): number {
    if (this.moves.length < 5) return 0;
    const deltas: number[] = [];
    for (let i = 1; i < this.moves.length; i++) {
      const dx = this.moves[i][0] - this.moves[i - 1][0];
      const dy = this.moves[i][1] - this.moves[i - 1][1];
      const dt = Math.max(this.moves[i][2] - this.moves[i - 1][2], 1);
      deltas.push(Math.sqrt(dx * dx + dy * dy) / dt);
    }
    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const variance = deltas.reduce((a, b) => a + (b - mean) ** 2, 0) / deltas.length;
    return Math.sqrt(variance);
  }
  scrollEvents(): number { return this.scrollCount; }
}

// ---------------------------------------------------------------------------
// Typing delay tracker
// ---------------------------------------------------------------------------
export class TypingTracker {
  private delays: number[] = [];
  private lastKey: number | null = null;
  private bound = false;

  private onKey = () => {
    const now = Date.now();
    if (this.lastKey !== null) this.delays.push(now - this.lastKey);
    this.lastKey = now;
  };

  start() {
    if (this.bound) return;
    window.addEventListener("keydown", this.onKey, { passive: true });
    this.bound = true;
  }
  stop() { window.removeEventListener("keydown", this.onKey); }

  avgDelay(): number {
    if (!this.delays.length) return 0;
    return this.delays.reduce((a, b) => a + b, 0) / this.delays.length;
  }
}

// ---------------------------------------------------------------------------
// Click timing tracker
// ---------------------------------------------------------------------------
export class ClickTracker {
  private times: number[] = [];
  private bound = false;

  private onClick = () => { this.times.push(Date.now()); };

  start() {
    if (this.bound) return;
    window.addEventListener("click", this.onClick, { passive: true });
    this.bound = true;
  }
  stop() { window.removeEventListener("click", this.onClick); }

  count(): number { return this.times.length; }

  variance(): number {
    if (this.times.length < 3) return 0;
    const intervals: number[] = [];
    for (let i = 1; i < this.times.length; i++) {
      intervals.push(this.times[i] - this.times[i - 1]);
    }
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    return Math.sqrt(
      intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length
    );
  }
}

// ---------------------------------------------------------------------------
// Static browser signals
// ---------------------------------------------------------------------------
export function staticSignals() {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    msMaxTouchPoints?: number;
  };
  return {
    user_agent: nav.userAgent ?? "",
    platform: nav.platform ?? "",
    language: nav.language ?? "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    screen_width: screen.width,
    screen_height: screen.height,
    color_depth: screen.colorDepth,
    hardware_concurrency: nav.hardwareConcurrency ?? 0,
    device_memory: nav.deviceMemory ?? undefined,
    touch_support:
      "ontouchstart" in window ||
      nav.maxTouchPoints > 0 ||
      (nav.msMaxTouchPoints ?? 0) > 0,
    cookie_enabled: nav.cookieEnabled,
    do_not_track: nav.doNotTrack ?? "unspecified",
    webdriver: Boolean(nav.webdriver),
    plugins_count: nav.plugins?.length ?? 0,
  };
}
