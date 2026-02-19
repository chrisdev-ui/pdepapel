import { MAX_WAIT_TIME, TIMEOUT_TIME } from "@/constants";
import { Prisma, PrismaClient } from "@prisma/client";

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: ["query", "info", "warn", "error"],
    transactionOptions: {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: MAX_WAIT_TIME,
      timeout: TIMEOUT_TIME,
    },
  }).$extends({
    query: {
      async $allOperations({ operation, model, args, query }) {
        const MAX_RETRIES = 3;
        const RETRY_DELAY = 1000; // 1 second

        let retries = 0;
        while (true) {
          try {
            return await query(args);
          } catch (error: any) {
            // P1001: Can't reach database server
            // P1002: The database server was reached but timed out
            // P1008: Operations timed out
            // P1017: Server has closed the connection
            if (
              (error?.code === "P1001" ||
                error?.code === "P1002" ||
                error?.code === "P1008" ||
                error?.code === "P1017") &&
              retries < MAX_RETRIES
            ) {
              retries++;
              console.warn(
                `[Prisma Retry] Retrying operation ${model}.${operation} (Attempt ${retries}/${MAX_RETRIES}) due to error ${error.code}`,
              );
              await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
              continue;
            }
            throw error;
          }
        }
      },
    },
  });
};

export type ExtendedPrismaClient = ReturnType<typeof prismaClientSingleton>;

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prismadb = globalThis.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") globalThis.prisma = prismadb;

export default prismadb;
