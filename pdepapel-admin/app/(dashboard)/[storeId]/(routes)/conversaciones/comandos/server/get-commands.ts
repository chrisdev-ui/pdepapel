import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";

export interface CommandRow {
  id: string;
  command: string;
  args: string | null;
  status: string;
  outcome: string | null;
  reply: string | null;
  orderId: string | null;
  delivered: number;
  sentAt: Date;
}

/** Los últimos comandos del chat consigo misma. Solo la dueña. */
export async function getCommands(storeId: string, take = 100): Promise<CommandRow[]> {
  await requireStoreOwner(storeId);
  return prismadb.whatsAppAdminCommand.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, command: true, args: true, status: true, outcome: true, reply: true, orderId: true, delivered: true, sentAt: true },
  });
}
