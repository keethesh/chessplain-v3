import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['react-chessboard'],
  // A stray package-lock.json above this repo in the user profile makes Next
  // infer the wrong workspace root, which silently changes which files are
  // traced into the deployment bundle. Pin it to the monorepo root.
  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
