import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { get, put, BlobPreconditionFailedError } from '@vercel/blob';

export class Conflict extends Error {}
export interface Stored<T> { value: T; etag: string }
export interface Store { read<T>(key: string): Promise<Stored<T> | null>; write<T>(key: string, value: T, etag: string | null): Promise<void> }
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export class MemoryStore implements Store {
  private data = new Map<string, string>();
  async read<T>(key: string): Promise<Stored<T> | null> { const raw = this.data.get(key); return raw ? { value: JSON.parse(raw), etag: digest(raw) } : null; }
  async write<T>(key: string, value: T, etag: string | null) { const raw = this.data.get(key); if ((raw ? digest(raw) : null) !== etag) throw new Conflict(); this.data.set(key, JSON.stringify(value)); }
}
export class FileStore implements Store {
  constructor(private root = path.resolve('.isla-rooms')) {}
  private file(key: string) { if (!/^[A-Z2-9]{7}$/.test(key)) throw new Error('Invalid store key'); return path.join(this.root, key + '.json'); }
  async read<T>(key: string): Promise<Stored<T> | null> { try { const raw = await readFile(this.file(key), 'utf8'); return { value: JSON.parse(raw), etag: digest(raw) }; } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; } }
  async write<T>(key: string, value: T, etag: string | null) {
    await mkdir(this.root, { recursive: true }); const file = this.file(key); let lock;
    try { lock = await open(file + '.lock', 'wx'); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new Conflict(); throw e; }
    try { const current = await this.read(key); if ((current?.etag || null) !== etag) throw new Conflict(); const temporary = file + '.' + randomUUID() + '.tmp'; await writeFile(temporary, JSON.stringify(value), { mode: 0o600 }); await rename(temporary, file); }
    finally { await lock.close(); await unlink(file + '.lock'); }
  }
}
export class BlobStore implements Store {
  private file(key: string) { if (!/^[A-Z2-9]{7}$/.test(key)) throw new Error('Invalid store key'); return 'rooms/v1/' + key + '.json'; }
  async read<T>(key: string): Promise<Stored<T> | null> {
    // Compressed responses may carry a weak ETag, which cannot authorize a conditional write.
    const result = await get(this.file(key), { access: 'private', useCache: false, headers: { 'Accept-Encoding': 'identity' } });
    if (!result || !result.stream) return null;
    return { value: await new Response(result.stream).json() as T, etag: result.blob.etag };
  }
  async write<T>(key: string, value: T, etag: string | null) {
    try { await put(this.file(key), JSON.stringify(value), { access: 'private', addRandomSuffix: false, allowOverwrite: etag !== null, ...(etag ? { ifMatch: etag } : {}), contentType: 'application/json', cacheControlMaxAge: 60 }); }
    catch (e) { if (e instanceof BlobPreconditionFailedError || /already exists/i.test((e as Error).message)) throw new Conflict(); throw e; }
  }
}
