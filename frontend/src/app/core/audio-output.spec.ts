import { TestBed } from '@angular/core/testing';
import { AudioOutput } from './audio-output';

class TestContext {
  static instances: TestContext[] = [];
  sampleRate = 48000;
  baseLatency = 0;
  outputLatency = 0;
  state = 'suspended';
  destination = {};
  source = { start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn() };
  createBuffer = vi.fn();
  createBufferSource = () => this.source;
  resume = vi.fn(async () => { this.state = 'running'; });
  suspend = vi.fn(async () => { this.state = 'suspended'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  constructor() { TestContext.instances.push(this); }
}

beforeEach(() => {
  vi.useFakeTimers();
  TestContext.instances = [];
  vi.stubGlobal('AudioContext', TestContext);
});
afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('opens no device until Play, allows startup time, and releases it on Stop', async () => {
  const output = TestBed.inject(AudioOutput);
  expect(TestContext.instances).toHaveLength(0);
  const ready = vi.fn();
  void output.prepare()!.then(ready);
  await vi.advanceTimersByTimeAsync(299);
  expect(ready).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(ready).toHaveBeenCalledOnce();
  const context = TestContext.instances[0];
  expect(context.source.start).toHaveBeenCalledOnce();
  output.stop();
  expect(context.source.stop).toHaveBeenCalledOnce();
  expect(context.suspend).toHaveBeenCalledOnce();
});

it('settles a cancelled preparation and handles a late resume without leaving the output open', async () => {
  let resume!: () => void;
  vi.stubGlobal('AudioContext', class extends TestContext {
    override resume = vi.fn(() => new Promise<void>((resolve) => {
      resume = () => { this.state = 'running'; resolve(); };
    }));
  });
  const output = TestBed.inject(AudioOutput);
  const ready = output.prepare();
  output.stop();
  await expect(ready).resolves.toBeUndefined();
  resume();
  await vi.advanceTimersByTimeAsync(1000);
  expect(TestContext.instances[0].state).toBe('suspended');
});

it('does not block speech when AudioContext is unavailable or resume is denied', async () => {
  vi.stubGlobal('AudioContext', undefined);
  const output = TestBed.inject(AudioOutput);
  expect(output.prepare()).toBeNull();
  vi.stubGlobal('AudioContext', class extends TestContext {
    override resume = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
  });
  await expect(output.prepare()).resolves.toBeUndefined();
  expect(TestContext.instances[0].source.stop).toHaveBeenCalledOnce();
});

it('times out a blocked resume and closes the context when the app is destroyed', async () => {
  vi.stubGlobal('AudioContext', class extends TestContext {
    override resume = vi.fn(() => new Promise<void>(() => {}));
  });
  const ready = TestBed.inject(AudioOutput).prepare();
  await vi.advanceTimersByTimeAsync(1200);
  await expect(ready).resolves.toBeUndefined();
  const context = TestContext.instances[0];
  TestBed.resetTestingModule();
  expect(context.close).toHaveBeenCalledOnce();
});
