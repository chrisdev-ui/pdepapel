import { MAX_WAIT_TIME, TIMEOUT_TIME } from "@/constants";
import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { createPool } from "mariadb";

declare global {
  var prisma: PrismaClient | undefined;
}

const prismadb = globalThis.prisma || createPrismaClient();

function createPrismaClient() {
  const url = new URL(process.env.DATABASE_URL!);

  // Explicit configuration to match Prisma v6 stability and v7 requirements
  const poolConfig = {
    host: url.hostname,
    user: url.username,
    password: url.password,
    port: Number(url.port),
    database: url.pathname.slice(1),
    connectionLimit: 10,
    acquireTimeout: 10000,
    connectTimeout: 5000, // Increased from v7 default (1s) to 5s (v6 default)
    idleTimeout: 300, // Reduced from v7 default (1800s) to 300s (v6 default)
    ssl: { rejectUnauthorized: false },
    pipelining: true,
    insertIdAsNumber: true,
  };

  const adapter = new PrismaMariaDb(poolConfig as any);

  return new PrismaClient({
    adapter,
    log: ["query", "info", "warn", "error"],
    transactionOptions: {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: MAX_WAIT_TIME,
      timeout: TIMEOUT_TIME,
    },
  });
}

if (process.env.NODE_ENV !== "production") globalThis.prisma = prismadb;

export default prismadb;
