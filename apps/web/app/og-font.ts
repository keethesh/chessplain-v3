import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Archivo Black expanded (wdth 125), read once per process for the OG routes. */
export const ogFont = readFile(path.join(process.cwd(), 'public/fonts/Archivo-Expanded-900.ttf'));
