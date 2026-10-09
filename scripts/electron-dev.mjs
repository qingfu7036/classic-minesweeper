/**
 * Electron 开发模式启动器：
 * 先用 Vite 起本地开发服务器，再把地址通过环境变量交给 Electron 主进程。
 * 不依赖 concurrently / wait-on 之类的额外工具。
 *
 * 运行：npm run electron:dev
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import electronPath from 'electron';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const server = await createServer({ configFile: path.join(projectRoot, 'vite.config.js') });
await server.listen();

const url = server.resolvedUrls?.local?.[0] ?? `http://localhost:${server.config.server.port}`;
console.log(`[electron:dev] Vite 开发服务器：${url}`);

const child = spawn(electronPath, [projectRoot], {
  stdio: 'inherit',
  env: { ...process.env, CLASSIC_MINESWEEPER_DEV_SERVER: url },
});

function shutdown(code = 0) {
  server.close().finally(() => process.exit(code));
}

child.on('close', (code) => {
  console.log(`[electron:dev] Electron 已退出（code=${code}）`);
  shutdown(code ?? 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill();
    shutdown(0);
  });
}
