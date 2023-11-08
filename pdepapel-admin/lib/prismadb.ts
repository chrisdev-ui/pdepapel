import { PrismaClient } from '@prisma/client'

import { env } from '@/lib/env.mjs'

declare global {
  var prisma: PrismaClient | undefined
}

const prismadb =
  globalThis.prisma ||
  new PrismaClient({
    log: ['query', 'info', 'warn', 'error']
  })

if (env.NODE_ENV !== 'production') globalThis.prisma = prismadb

export default prismadb
