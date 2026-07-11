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

    const character = await prisma.character.findUnique({
      where: { id: params.characterId },
    });

    if (!character || character.userId !== session.user.id) {
      return NextResponse.json({ error: 'Character not found or unauthorized' }, { status: 404 });
    }

    const tree = getSkillTree(character.class, character.unlockedTransformation);
    // Primeiro gasto de um personagem novo inicializa o estado; legado só chega
    // aqui depois do respec (a ficha não mostra a árvore com skillTree null).
    const state = getSkillTreeState(character.skillTree) || { version: SKILL_TREE_VERSION, purchased: [] };

    const availablePoints = character.availablePoints || 0;
    const check = canPurchase(tree, state.purchased, nodeId, availablePoints);
    if (!check.ok) {
      return NextResponse.json({ error: check.reason }, { status: 400 });
    }
    const node = tree.find(n => n.id === nodeId)!;

    // Nó de stat: aplica o recálculo compartilhado (bônus raça/classe, piso 8, derivados)
    let attrData = {};
    if (node.effect.stat) {
      try {
        const recalc = buildAttributeUpdate(character, { [node.effect.stat.attr]: node.effect.stat.amount });
        attrData = recalc.data;
      } catch {
        return NextResponse.json({ error: 'Invalid character race or class' }, { status: 400 });
      }
    }

    const newState = {
      version: state.version,
      purchased: [...state.purchased, nodeId],
      ...(state.respecAt ? { respecAt: state.respecAt } : {}),
    };

    const updatedCharacter = await prisma.character.update({
      where: { id: character.id },
      data: {
        ...attrData,
        skillTree: newState,
        availablePoints: availablePoints - node.cost,
      },
    });

    try {
      await recordSkillNodePurchase(character.id, node.id, node.name, node.cost);
    } catch (historyError) {
      console.error('Erro ao registrar histórico:', historyError);
    }

    return NextResponse.json({
      success: true,
      character: serializeBigIntForJson(updatedCharacter),
      node: { id: node.id, name: node.name, cost: node.cost },
    });
  } catch (error) {
    console.error('Error spending skill point:', error);
    return NextResponse.json({ error: 'Error spending skill point' }, { status: 500 });
  }
}
