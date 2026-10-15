import { defineConfig } from 'vite';
import roomHandler from './server/http';
export default defineConfig({ plugins: [{ name: 'isla-local-rooms', configureServer(server) { server.middlewares.use('/api/rooms', (req, res) => { void roomHandler(req, res); }); }, configurePreviewServer(server) { server.middlewares.use('/api/rooms', (req, res) => { void roomHandler(req, res); }); } }] });
