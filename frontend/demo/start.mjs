import { spawn } from 'node:child_process';
import { startMock } from './mock-api.mjs';

const mock = await startMock();
const ng = spawn(process.execPath, [
  'node_modules/@angular/cli/bin/ng.js', 'serve', '--host', '127.0.0.1',
  '--proxy-config', 'demo/proxy.conf.json', ...process.argv.slice(2),
], { stdio: 'inherit', env: { ...process.env, API_BASE_URL: 'http://127.0.0.1:3077' } });

console.log('Локальная заглушка запущена. Админка: demo@kolibri.test / kolibri-demo');
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.once(sig, () => {
    ng.kill(sig);
    mock.close();
  });
}
ng.on('exit', (code) => {
  mock.close();
  process.exitCode = code ?? 0;
});
ng.on('error', (error) => {
  mock.close();
  console.error(error.message);
  process.exitCode = 1;
});
