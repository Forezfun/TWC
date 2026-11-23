import { DestroyRef, Service, inject } from '@angular/core';

/** Opens the output only after Play, before a recording or system voice starts. */
@Service()
export class AudioOutput {
  private context?: AudioContext;
  private silence?: AudioBufferSourceNode;
  private timer?: number;
  private pending?: () => void;
  private generation = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.stop();
      void this.context?.close().catch(() => {});
    });
  }

  prepare(): Promise<void> | null {
    this.stop();
    if (typeof AudioContext === 'undefined') return null;
    const current = ++this.generation;
    try {
      this.context ??= new AudioContext();
      const context = this.context;
      const silence = context.createBufferSource();
      silence.buffer = context.createBuffer(1, 1024, context.sampleRate);
      silence.loop = true;
      silence.connect(context.destination);
      silence.start();
      this.silence = silence;
      // resume() must be called inside the user's click, before any asynchronous work.
      const resumed = context.resume();
      return new Promise<void>((resolve) => {
        this.pending = resolve;
        // A blocked AudioContext must not prevent ordinary audio/TTS playback.
        this.timer = window.setTimeout(() => {
          if (current === this.generation) this.stop();
        }, 1200);
        void resumed.then(() => {
          if (current !== this.generation) {
            if (!this.silence && context.state === 'running') void context.suspend().catch(() => {});
            return;
          }
          // Keep the device open across fragments. Firefox/output devices may need
          // a few hundred milliseconds before the first audible samples reach it.
          const latency = (context.baseLatency || 0) + (context.outputLatency || 0);
          window.clearTimeout(this.timer);
          this.timer = window.setTimeout(() => this.finish(), Math.max(300, Math.min(700, latency * 1000 + 150)));
        }, () => {
          if (current === this.generation) this.stop();
        });
      });
    } catch {
      this.stop();
      return null;
    }
  }

  stop(): void {
    this.generation++;
    if (typeof window !== 'undefined') window.clearTimeout(this.timer);
    this.timer = undefined;
    this.silence?.stop();
    this.silence?.disconnect();
    this.silence = undefined;
    if (this.context?.state === 'running') void this.context.suspend().catch(() => {});
    this.finish();
  }

  private finish(): void {
    const resolve = this.pending;
    this.pending = undefined;
    resolve?.();
  }
}
