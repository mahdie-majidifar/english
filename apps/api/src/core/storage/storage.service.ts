import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../config/env.js';

/**
 * File storage behind a tiny interface. Today it is the local disk; an S3-compatible driver can
 * replace it later without touching callers.
 */
export interface StorageDriver {
  put(userId: string, data: Buffer, extension: string): Promise<string>;
  stream(key: string): Readable;
  remove(key: string): Promise<void>;
}

@Injectable()
export class StorageService implements StorageDriver {
  constructor(private readonly config: AppConfig) {}

  /** Stores the bytes under a random name. The learner's original filename is never used on disk. */
  async put(userId: string, data: Buffer, extension: string): Promise<string> {
    const year = new Date().getUTCFullYear();
    const key = `${userId}/${year}/${randomUUID()}.${extension.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data, { flag: 'wx' });
    return key;
  }

  stream(key: string): Readable {
    return createReadStream(this.pathFor(key));
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  /** Resolves a key to a path and refuses anything that would escape the storage directory. */
  private pathFor(key: string): string {
    const root = this.config.storageDir;
    const path = resolve(root, key);
    if (!path.startsWith(root + sep)) throw new Error('Invalid storage key.');
    return path;
  }
}
