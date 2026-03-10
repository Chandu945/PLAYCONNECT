import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { FileStoragePort } from '@application/common/ports/file-storage.port';

@Injectable()
export class LocalFileStorageService implements FileStoragePort {
  private readonly baseDir = path.resolve(process.cwd(), 'uploads');

  async upload(
    folder: string,
    filename: string,
    buffer: Buffer,
    _mimeType: string,
  ): Promise<string> {
    // Sanitize folder and filename to prevent path traversal
    const safeFolder = folder.split('/').map((s) => path.basename(s)).join('/');
    const safeFilename = path.basename(filename);

    const dir = path.join(this.baseDir, safeFolder);
    const filePath = path.join(dir, safeFilename);

    // Ensure resolved path is within baseDir
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(this.baseDir)) {
      throw new Error('Invalid file path');
    }

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, buffer);
    return `/uploads/${safeFolder}/${safeFilename}`;
  }

  async delete(fileUrl: string): Promise<void> {
    if (!fileUrl.startsWith('/uploads/')) return;

    // Sanitize to prevent path traversal
    const relative = fileUrl.replace(/^\/uploads\//, '');
    const safePath = relative.split('/').map((s) => path.basename(s)).join('/');
    const filePath = path.join(this.baseDir, safePath);

    // Ensure resolved path is within baseDir
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(this.baseDir)) return;

    try {
      await fs.unlink(filePath);
    } catch {
      // File may already be deleted — ignore
    }
  }
}
