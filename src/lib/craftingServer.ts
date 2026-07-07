// ⚒️⚗️ Profissões de craft — leitura server-side do XP da CONTA.
//
// Como a Fazenda (farmServer.ts): o XP de cada craft é creditado no personagem
// que craftou (Character.forgeXp / alchemyXp), mas o NÍVEL da profissão é da
// conta inteira — soma do XP de todos os personagens do usuário. Todo mundo
// desenvolve a mesma forja/bancada; trocar de herói não zera o progresso.

import { prisma } from './prisma';

/** XP de Forja da CONTA: soma do forgeXp de todos os personagens do usuário. */
export async function getUserForgeXp(userId: string): Promise<number> {
  const agg = await prisma.character.aggregate({ where: { userId }, _sum: { forgeXp: true } });
  return agg._sum.forgeXp ?? 0;
}

/** XP de Alquimia da CONTA: soma do alchemyXp de todos os personagens do usuário. */
export async function getUserAlchemyXp(userId: string): Promise<number> {
  const agg = await prisma.character.aggregate({ where: { userId }, _sum: { alchemyXp: true } });
  return agg._sum.alchemyXp ?? 0;
}
