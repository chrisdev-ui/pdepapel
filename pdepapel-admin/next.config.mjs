import million from 'million/compiler'
import './lib/env.mjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        port: ''
      }
    ]
  }
}

const millionConfig = {
  auto: { rsc: true }
}

export default million.next(nextConfig, millionConfig)
