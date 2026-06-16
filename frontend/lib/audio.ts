"use client";

/**
 * Audio fingerprinting — Phase 1 enhanced (v2).
 *
 * v1: Single OfflineAudioContext (triangle → DynamicsCompressor).
 * v2: Three independent techniques composited into one hash:
 *   1. Triangle oscillator → DynamicsCompressor (original)
 *   2. Sine oscillator → AnalyserNode frequency domain
 *   3. Square oscillator → BiquadFilter lowpass
 *
 * The composite hash is far more discriminating than the single-technique v1.
 */

async function sha256(str: string): Promise<string> {
  const buf = new TextEncoder().encode(str);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

export interface AudioFingerprintResult {
  hash: string;
  value: number;
  v2_hash: string;
  techniques: {
    triangle_compressor: number;
    sine_analyser: number;
    square_biquad: number;
  };
}

export async function audioFingerprint(): Promise<{ hash: string; value: number }> {
  try {
    const ctx = new OfflineAudioContext(1, 5000, 44100);

    const oscillator = ctx.createOscillator();
    oscillator.type = "triangle";
    oscillator.frequency.value = 10000;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -50;
    compressor.knee.value = 40;
    compressor.ratio.value = 12;
    compressor.attack.value = 0;
    compressor.release.value = 0.25;

    oscillator.connect(compressor);
    compressor.connect(ctx.destination);
    oscillator.start(0);

    const buffer = await ctx.startRendering();
    const data = buffer.getChannelData(0).slice(0, 500);
    const sum = data.reduce((a, b) => a + Math.abs(b), 0);
    const hash = sum.toString(36).slice(0, 10);
    return { hash, value: sum };
  } catch {
    return { hash: "unavailable", value: 0 };
  }
}

export async function audioFingerprintV2(): Promise<AudioFingerprintResult> {
  const fallback: AudioFingerprintResult = {
    hash: "unavailable",
    value: 0,
    v2_hash: "unavailable",
    techniques: { triangle_compressor: 0, sine_analyser: 0, square_biquad: 0 },
  };

  try {
    // Technique 1: Triangle → DynamicsCompressor (original v1)
    const ctx1 = new OfflineAudioContext(1, 5000, 44100);
    const osc1 = ctx1.createOscillator();
    osc1.type = "triangle";
    osc1.frequency.value = 10000;
    const comp = ctx1.createDynamicsCompressor();
    comp.threshold.value = -50;
    comp.knee.value = 40;
    comp.ratio.value = 12;
    comp.attack.value = 0;
    comp.release.value = 0.25;
    osc1.connect(comp);
    comp.connect(ctx1.destination);
    osc1.start(0);
    const buf1 = await ctx1.startRendering();
    const data1 = buf1.getChannelData(0).slice(0, 500);
    const t1 = data1.reduce((a, b) => a + Math.abs(b), 0);

    // Technique 2: Sine → AnalyserNode (frequency analysis)
    const ctx2 = new OfflineAudioContext(1, 5000, 44100);
    const osc2 = ctx2.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = 8000;
    const analyser = ctx2.createAnalyser();
    analyser.fftSize = 2048;
    osc2.connect(analyser);
    analyser.connect(ctx2.destination);
    osc2.start(0);
    const buf2 = await ctx2.startRendering();
    const data2 = buf2.getChannelData(0).slice(0, 500);
    const t2 = data2.reduce((a, b) => a + Math.abs(b), 0);

    // Technique 3: Square → BiquadFilter lowpass
    const ctx3 = new OfflineAudioContext(1, 5000, 44100);
    const osc3 = ctx3.createOscillator();
    osc3.type = "square";
    osc3.frequency.value = 6000;
    const filter = ctx3.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 3000;
    filter.Q.value = 5;
    osc3.connect(filter);
    filter.connect(ctx3.destination);
    osc3.start(0);
    const buf3 = await ctx3.startRendering();
    const data3 = buf3.getChannelData(0).slice(0, 500);
    const t3 = data3.reduce((a, b) => a + Math.abs(b), 0);

    const composite = `${t1.toFixed(8)}|${t2.toFixed(8)}|${t3.toFixed(8)}`;
    const v2Hash = await sha256(composite);

    return {
      hash: t1.toString(36).slice(0, 10),
      value: t1,
      v2_hash: v2Hash,
      techniques: {
        triangle_compressor: t1,
        sine_analyser: t2,
        square_biquad: t3,
      },
    };
  } catch {
    return fallback;
  }
}
