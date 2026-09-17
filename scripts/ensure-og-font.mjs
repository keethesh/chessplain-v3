import fs from 'node:fs';
import path from 'node:path';

const src = path.resolve('apps/web/public/fonts/Geist-Regular.ttf');
if (fs.existsSync(src)) {
  const pnpmDir = path.resolve('node_modules/.pnpm');
  if (fs.existsSync(pnpmDir)) {
    for (const entry of fs.readdirSync(pnpmDir)) {
      if (entry.startsWith('next@16.3.5')) {
        const targetDir = path.join(pnpmDir, entry, 'node_modules/next/dist/compiled/@vercel/og');
        if (fs.existsSync(targetDir)) {
          const target = path.join(targetDir, 'Geist-Regular.ttf');
          if (!fs.existsSync(target)) {
            fs.copyFileSync(src, target);
            console.log(`[prepare] Copied Geist-Regular.ttf to ${target}`);
          }
        }
      }
    }
  }
}
