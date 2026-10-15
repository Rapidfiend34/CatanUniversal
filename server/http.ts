import type { IncomingMessage, ServerResponse } from 'node:http';
import { Rooms, RoomError } from './rooms.js';
import { BlobStore, FileStore } from './store.js';
const rooms = new Rooms(process.env.VERCEL ? new BlobStore() : new FileStore(process.env.ISLA_ROOM_DIR));
const limits = new Map<string, { count: number; until: number }>();
export function handler(service = rooms) {
  return async (req: IncomingMessage & { body?: unknown }, res: ServerResponse) => {
    res.setHeader('Cache-Control', 'no-store, private'); res.setHeader('Vary', 'Authorization'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status: number, value: unknown) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(value)); };
    try {
      const url = new URL(req.url || '/', 'http://room.local'), token = req.headers.authorization?.replace(/^Bearer /, '') || '';
      if (req.method === 'GET') { send(200, await service.sync(url.searchParams.get('code') || '', token)); return; }
      if (req.method !== 'POST') { send(405, { error: 'Método no permitido.' }); return; }
      if (!req.headers['content-type']?.includes('application/json')) throw new RoomError('Usa JSON para enviar acciones.');
      let input: any = req.body;
      if (input === undefined) { let raw = ''; for await (const chunk of req) { raw += chunk.toString(); if (Buffer.byteLength(raw) > 8192) throw new RoomError('Solicitud demasiado grande.', 413); } input = JSON.parse(raw); }
      else if (typeof input === 'string') { if (input.length > 8192) throw new RoomError('Solicitud demasiado grande.', 413); input = JSON.parse(input); }
      if (!input || typeof input !== 'object' || Array.isArray(input) || JSON.stringify(input).length > 8192) throw new RoomError('Solicitud no válida.');
      if (input.op === 'create' || input.op === 'join') {
        const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local').split(',')[0]; const now = Date.now(), limit = limits.get(ip);
        if (limit && limit.until > now && limit.count >= 30) throw new RoomError('Demasiados intentos. Espera un minuto.', 429);
        limits.set(ip, { count: limit && limit.until > now ? limit.count + 1 : 1, until: limit && limit.until > now ? limit.until : now + 60_000 });
        if (limits.size > 2000) for (const [key, value] of limits) if (value.until < now) limits.delete(key);
      }
      if (input.op === 'create') send(201, await service.create(input));
      else if (input.op === 'join') send(200, await service.join(input.code, input.token, input.name));
      else send(200, await service.update(input.code, token, input));
    } catch (e) { if (e instanceof RoomError) send(e.status, { error: e.message }); else if (e instanceof SyntaxError) send(400, { error: 'JSON no válido.' }); else { console.error('Room storage error:', (e as Error).name); send(503, { error: 'No se ha podido conectar con la sala. Inténtalo de nuevo en unos segundos.' }); } }
  };
}
export default handler();
