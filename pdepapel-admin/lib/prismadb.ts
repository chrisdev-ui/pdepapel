import { MAX_WAIT_TIME, TIMEOUT_TIME } from "@/constants";
import { Prisma, PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

const prismadb =
  globalThis.prisma ||
  new PrismaClient({
    log: ["query", "info", "warn", "error"],
    transactionOptions: {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: MAX_WAIT_TIME,
      timeout: TIMEOUT_TIME,
    },
  });

if (process.env.NODE_ENV !== "production") globalThis.prisma = prismadb;

export default prismadb;
