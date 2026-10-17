import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import roomHandler from './server/http';

function offlineGame(): Plugin {
  return {
    name: 'isla-offline-game', apply: 'build', enforce: 'post',
    generateBundle: {
      order: 'post', handler(_, bundle) {
        const files = ['index.html', 'manifest.webmanifest', 'favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];
        const template = readFileSync(new URL('./src/service-worker.js', import.meta.url), 'utf8');
        const hash = createHash('sha256').update(template);
        for (const [name, output] of Object.entries(bundle).sort(([a], [b]) => a.localeCompare(b))) {
          if (name.endsWith('.map')) continue;
          files.push(name); hash.update(name).update(output.type === 'chunk' ? output.code : output.source);
        }
        for (const name of files.filter(file => !bundle[file])) hash.update(name).update(readFileSync(new URL('./public/' + name, import.meta.url)));
        this.emitFile({ type: 'asset', fileName: 'sw.js', source: template.replace("'__CACHE_VERSION__'", JSON.stringify(hash.digest('hex').slice(0, 20))).replace('__PRECACHE_MANIFEST__', JSON.stringify([...new Set(files)].sort().map(file => '/' + file))) });
      },
    },
  };
}
export default defineConfig({ plugins: [{ name: 'isla-local-rooms', configureServer(server) { server.middlewares.use('/api/rooms', (req, res) => { void roomHandler(req, res); }); }, configurePreviewServer(server) { server.middlewares.use('/api/rooms', (req, res) => { void roomHandler(req, res); }); } }, offlineGame()] });
