import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Include the Google SA credentials file (written at build time) in the
  // standalone output so it's available to server-side API routes at runtime.
  outputFileTracingIncludes: {
    '/api/describe-scene': ['./google-sa-credentials.json'],
  },
  webpack: (config) => {
    // If Next uses webpack (e.g., for some plugins), Spark’s WASM URL resolution is safer this way.
    // See: spark-react-nextjs / spark-react-r3f notes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parser = (config.module as any)?.parser ?? {};
    config.module.parser = {
      ...parser,
      javascript: {
        ...(parser.javascript ?? {}),
        url: false
      },
    };
    return config;
  },
};

export default nextConfig;
