import { auth } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { recordSkillNodePurchase } from '@/lib/characterHistory';
import { buildAttributeUpdate } from '@/lib/attributeRecalc';
import {
  SKILL_TREE_VERSION,
  canPurchase,
  getSkillTree,
  getSkillTreeState,
} from '@/lib/skillTree';

function serializeBigIntForJson<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v))
  ) as T
}

/**
 * 🌳 Gasta 1 ponto de habilidade num nó da árvore (POST { nodeId }).
 * Validação 100% server-side: nó existe na árvore da combinação classe+forma,
 * pré-requisito (nó anterior do caminho) comprado, custo ≤ availablePoints.
 * Nó de stat aplica o MESMO recálculo do distribute-points (attributeRecalc.ts).
 */
export async function POST(request: NextRequest, { params }: { params: { characterId: string } }) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { nodeId } = await request.json();
    if (!nodeId || typeof nodeId !== 'string') {
      return NextResponse.json({ error: 'nodeId inválido' }, { status: 400 });
    }

    // Toda a validação + escrita roda numa transação Serializable: sem isto, dois
    // POSTs simultâneos leem o mesmo availablePoints/skillTree e ambos "compram"
    // (gasta ponto a mais, ou aprende o mesmo nó duas vezes). A releitura DENTRO da
    // transação garante que o segundo veja o estado já atualizado pelo primeiro.
    const result = await prisma.$transaction(async (tx) => {
      const character = await tx.character.findUnique({
        where: { id: params.characterId },
      });

      if (!character || character.userId !== session.user.id) {
        return { status: 404 as const, error: 'Character not found or unauthorized' };
      }

      const tree = getSkillTree(character.class, character.unlockedTransformation);
      // Primeiro gasto de um personagem novo inicializa o estado; legado só chega
      // aqui depois do respec (a ficha não mostra a árvore com skillTree null).
      const state = getSkillTreeState(character.skillTree) || { version: SKILL_TREE_VERSION, purchased: [] };

      const availablePoints = character.availablePoints || 0;
      const check = canPurchase(tree, state.purchased, nodeId, availablePoints);
      if (!check.ok) {
        return { status: 400 as const, error: check.reason };
      }
      const node = tree.find(n => n.id === nodeId)!;

      // Nó de stat: aplica o recálculo compartilhado (bônus raça/classe, piso 8, derivados)
      let attrData = {};
      if (node.effect.stat) {
        try {
          const recalc = buildAttributeUpdate(character, { [node.effect.stat.attr]: node.effect.stat.amount });
          attrData = recalc.data;
        } catch {
          return { status: 400 as const, error: 'Invalid character race or class' };
        }
      }

      const newState = {
        version: state.version,
        purchased: [...state.purchased, nodeId],
        ...(state.respecAt ? { respecAt: state.respecAt } : {}),
      };

      const updatedCharacter = await tx.character.update({
        where: { id: character.id },
        data: {
          ...attrData,
          skillTree: newState,
          availablePoints: availablePoints - node.cost,
        },
      });

      return { status: 200 as const, character: updatedCharacter, node };
    }, { isolationLevel: 'Serializable' });

    if (result.status !== 200) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    try {
      await recordSkillNodePurchase(result.character.id, result.node.id, result.node.name, result.node.cost);
    } catch (historyError) {
      console.error('Erro ao registrar histórico:', historyError);
    }

    return NextResponse.json({
      success: true,
      character: serializeBigIntForJson(result.character),
      node: { id: result.node.id, name: result.node.name, cost: result.node.cost },
    });
  } catch (error) {
    console.error('Error spending skill point:', error);
    return NextResponse.json({ error: 'Error spending skill point' }, { status: 500 });
  }
}
