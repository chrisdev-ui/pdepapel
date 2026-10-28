import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";
import { COMMAND_USAGE_DAYS, summarizeCommandUsage, type CommandUsage } from "@/lib/whatsapp/command-usage";

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

/** Cuántos salieron bien y por qué fallaron los demás, por comando. Solo la dueña. */
export async function getCommandUsage(storeId: string, now = new Date()): Promise<CommandUsage[]> {
  await requireStoreOwner(storeId);
  const groups = await prismadb.whatsAppAdminCommand.groupBy({
    by: ["command", "outcome"],
    where: { storeId, createdAt: { gte: new Date(now.getTime() - COMMAND_USAGE_DAYS * 86_400_000) } },
    _count: { _all: true },
  });
  return summarizeCommandUsage(groups.map((group) => ({ command: group.command, outcome: group.outcome, count: group._count._all })));
}
