import toast from 'react-hot-toast';
import { clientT, getClientLocale } from './i18n/client';

// 💰 "Tela" de compra de GOLD on-chain: um card de toast com confirmação.
// Aparece quando falta GOLD na mão para uma compra da loja/forja/alquimia.
// Resolve `true` se o jogador optar por comprar on-chain, `false` se cancelar.
// A compra é de GOLD (recarga off-chain) — nunca do item/NFT direto (isso é
// papel do market).
export function confirmBuyGold(amountGold: number): Promise<boolean> {
  const amount = Math.max(1, Math.ceil(amountGold));
  // Fora de componente: o locale vem do cookie, não de um hook.
  const t = clientT();
  const locale = getClientLocale();
  return new Promise((resolve) => {
    const finish = (id: string, value: boolean) => {
      toast.dismiss(id);
      resolve(value);
    };
    toast(
      (toastItem) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 240 }}>
          <div style={{ fontWeight: 700, color: '#fde68a' }}>{t('💰 Not enough GOLD on hand')}</div>
          <div style={{ fontSize: 13, lineHeight: 1.35, color: '#e5e7eb' }}>
            {t('Buy {amount} GOLD on-chain with the wallet? The amount is credited to the character and the purchase completes right after.', {
              amount: amount.toLocaleString(locale === 'pt' ? 'pt-BR' : 'en-US'),
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
            <button
              onClick={() => finish(toastItem.id, true)}
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
              {t('Buy on-chain')}
            </button>
            <button
              onClick={() => finish(toastItem.id, false)}
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
              {t('Cancel')}
            </button>
          </div>
        </div>
      ),
      { duration: Infinity }
    );
  });
}
