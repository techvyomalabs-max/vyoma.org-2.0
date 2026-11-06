/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Matches the URL shape s3.adapter.js builds
    // (https://<bucket>.s3.<region>.amazonaws.com/<key>) once AWS_* env vars
    // are set — next/image refuses any host not explicitly allow-listed here.
    // vyoma.org (both protocols — the WXR export stores many real media
    // URLs as plain http://, and www/bare-domain both appear in source
    // data) is the legacy WordPress site these real Leadership/Core Team/
    // Awards photos are still hosted on, pending a future S3 re-host.
    remotePatterns: [
      { protocol: 'https', hostname: '*.s3.*.amazonaws.com' },
      { protocol: 'http', hostname: 'vyoma.org' },
      { protocol: 'https', hostname: 'vyoma.org' },
      { protocol: 'http', hostname: 'www.vyoma.org' },
      { protocol: 'https', hostname: 'www.vyoma.org' },
    ],
  },
};

export default nextConfig;
