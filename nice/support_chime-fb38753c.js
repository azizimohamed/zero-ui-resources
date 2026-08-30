// Short synthesized chime for live support (no asset file).
// Call unlockSupportChime() from a user gesture so AudioContext can start.

let audioCtx = null;

export function unlockSupportChime() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioCtx = audioCtx || new Ctx();
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playSupportChime({ urgent = false } = {}) {
  const ctx = unlockSupportChime();
  if (!ctx) return;

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(urgent ? 0.12 : 0.08, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (urgent ? 0.28 : 0.22));

  const freqs = urgent ? [880, 1174] : [740, 988];
  freqs.forEach((freq, index) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);
    osc.connect(gain);
    const start = now + index * 0.07;
    osc.start(start);
    osc.stop(start + 0.16);
  });
}

export function nudgeSupportElement(el) {
  if (!el) return;
  el.classList.remove("is-nudging");
  // Restart CSS animation.
  void el.offsetWidth;
  el.classList.add("is-nudging");
  window.setTimeout(() => el.classList.remove("is-nudging"), 1200);
}
