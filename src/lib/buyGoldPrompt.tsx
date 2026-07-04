import toast from 'react-hot-toast';

// 💰 "Tela" de compra de GOLD on-chain: um card de toast com confirmação.
// Aparece quando falta GOLD na mão para uma compra da loja/forja/alquimia.
// Resolve `true` se o jogador optar por comprar on-chain, `false` se cancelar.
// A compra é de GOLD (recarga off-chain) — nunca do item/NFT direto (isso é
// papel do market).
export function confirmBuyGold(amountGold: number): Promise<boolean> {
  const amount = Math.max(1, Math.ceil(amountGold));
  return new Promise((resolve) => {
    const finish = (id: string, value: boolean) => {
      toast.dismiss(id);
      resolve(value);
    };
    toast(
      (t) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 240 }}>
          <div style={{ fontWeight: 700, color: '#fde68a' }}>💰 GOLD insuficiente na mão</div>
          <div style={{ fontSize: 13, lineHeight: 1.35, color: '#e5e7eb' }}>
            Comprar <b>{amount.toLocaleString('pt-BR')}</b> GOLD on-chain pela carteira? O valor
            é creditado na mão do personagem e a compra é concluída em seguida.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
            <button
              onClick={() => finish(t.id, true)}
              style={{
                flex: 1,
                padding: '7px 10px',
                borderRadius: 8,
                border: '1px solid #b45309',
                background: 'linear-gradient(180deg,#f59e0b,#d97706)',
                color: '#1c1917',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Comprar on-chain
            </button>
            <button
              onClick={() => finish(t.id, false)}
              style={{
                padding: '7px 12px',
                borderRadius: 8,
                border: '1px solid #4b5563',
                background: '#1f2937',
                color: '#d1d5db',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ),
      { duration: Infinity }
    );
  });
}
