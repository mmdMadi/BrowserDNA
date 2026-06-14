"use client";

/**
 * Browser fingerprint collector.
 * All functions run client-side only.
 */

// ---------------------------------------------------------------------------
// Canvas fingerprint → short hash (not full data URL)
// ---------------------------------------------------------------------------
async function sha256(str: string): Promise<string> {
  const buf = new TextEncoder().encode(str);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16); // short 16-char hex
}

export async function canvasFingerprint(): Promise<string> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 40;
    const ctx = canvas.getContext("2d")!;
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("BotDetector 🤖", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("BotDetector 🤖", 4, 17);
    const dataUrl = canvas.toDataURL();
    return await sha256(dataUrl);
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// GPU info via WebGL
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
      gpu_vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) ?? "",
      gpu_renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? "",
    };
  } catch {
    return { gpu_vendor: "", gpu_renderer: "" };
  }
}

// ---------------------------------------------------------------------------
// Mouse entropy — 2D velocity variance
// ---------------------------------------------------------------------------
export class MouseTracker {
  private moves: [number, number, number][] = []; // [x, y, t]
  private scrollCount = 0;
  private bound = false;

  private onMove = (e: MouseEvent) => {
    this.moves.push([e.clientX, e.clientY, Date.now()]);
    if (this.moves.length > 200) this.moves.shift();
  };

  private onScroll = () => {
    this.scrollCount++;
  };

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
    const variance =
      deltas.reduce((a, b) => a + (b - mean) ** 2, 0) / deltas.length;
    return Math.sqrt(variance);
  }

  scrollEvents(): number {
    return this.scrollCount;
  }
}

// ---------------------------------------------------------------------------
// Typing delay — average ms between keydowns
// ---------------------------------------------------------------------------
export class TypingTracker {
  private delays: number[] = [];
  private lastKey: number | null = null;
  private bound = false;

  private onKey = () => {
    const now = Date.now();
    if (this.lastKey !== null) {
      this.delays.push(now - this.lastKey);
    }
    this.lastKey = now;
  };

  start() {
    if (this.bound) return;
    window.addEventListener("keydown", this.onKey, { passive: true });
    this.bound = true;
  }

  stop() {
    window.removeEventListener("keydown", this.onKey);
  }

  avgDelay(): number {
    if (!this.delays.length) return 0;
    return this.delays.reduce((a, b) => a + b, 0) / this.delays.length;
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
