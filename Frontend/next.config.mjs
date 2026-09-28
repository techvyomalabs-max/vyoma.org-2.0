/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Matches the URL shape s3.adapter.js builds
    // (https://<bucket>.s3.<region>.amazonaws.com/<key>) once AWS_* env vars
    // are set — next/image refuses any host not explicitly allow-listed here.
    remotePatterns: [{ protocol: 'https', hostname: '*.s3.*.amazonaws.com' }],
  },
};

export default nextConfig;
