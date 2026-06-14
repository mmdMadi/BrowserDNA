"use client";

/**
 * Audio fingerprinting via OfflineAudioContext.
 * Produces a short hash from the audio processing signature of the browser.
 */
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
