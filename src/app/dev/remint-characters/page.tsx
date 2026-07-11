'use client';

// Página utilitária (não linkada no menu): reemite a NFT de personagens que já
// existem no banco mas perderam o vínculo on-chain (ex.: depois de um reset de
// banco). Usa /api/nft/character/remint-intent + remint-confirm — sem pagamento
// em DOL, só o gas da mint (testnet).

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ethers } from 'ethers';
import { decodeContractCustomErrorMessage, getWalletTxErrorMessage } from '@/lib/walletErrors';

const POLYGON_AMOY_CHAIN_ID_HEX = '0x13882';

type Character = {
  id: string;
  name: string;
  race: string;
  class: string;
  nftTokenId: string | null;
};

export default function RemintCharactersPage() {
  const { data: session } = useSession();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/character')
      .then((r) => r.json())
      .then((data) => setCharacters(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  const log = (id: string, msg: string) =>
    setLogs((prev) => ({ ...prev, [id]: `${prev[id] ? prev[id] + '\n' : ''}${msg}` }));

  const remint = async (character: Character) => {
    setBusyId(character.id);
    try {
      const eth = (window as any).ethereum;
      if (!eth) throw new Error('MetaMask não encontrada');

      const provider = new ethers.BrowserProvider(eth);
      await provider.send('eth_requestAccounts', []);

      const network = await provider.getNetwork();
      if (Number(network.chainId) !== 80002) {
        try {
          await provider.send('wallet_switchEthereumChain', [{ chainId: POLYGON_AMOY_CHAIN_ID_HEX }]);
        } catch (switchErr: any) {
          if (switchErr?.code === 4902) {
            await provider.send('wallet_addEthereumChain', [
              {
                chainId: POLYGON_AMOY_CHAIN_ID_HEX,
                chainName: 'Polygon Amoy',
                nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
                rpcUrls: ['https://rpc-amoy.polygon.technology/'],
                blockExplorerUrls: ['https://amoy.polygonscan.com/'],
              },
            ]);
          } else {
            throw new Error('Troque a MetaMask para a rede Polygon Amoy (chainId 80002).');
          }
        }
      }

      const providerAfterSwitch = new ethers.BrowserProvider(eth);
      const signer = await providerAfterSwitch.getSigner();
      const to = await signer.getAddress();

      log(character.id, `Pedindo assinatura do servidor…`);
      const intentRes = await fetch('/api/nft/character/remint-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: character.id }),
      });
      const intent = await intentRes.json();
      if (!intentRes.ok) throw new Error(intent?.error || 'Falha no remint-intent');

      const nftContract = new ethers.Contract(
        intent.contractAddress,
        [
          'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
          'function mintWithSig(address to, string tokenURI, uint256 deadline, bytes signature) returns (uint256)',
        ],
        signer
      );

      const deadline = BigInt(intent.deadline);

      log(character.id, `Estimando gas…`);
      let gasLimit: bigint | undefined;
      try {
        const est = (await nftContract.mintWithSig.estimateGas(
          to,
          intent.tokenURI,
          deadline,
          intent.signature
        )) as bigint;
        const buffered = (est * 15n) / 10n + 50_000n;
        gasLimit = buffered < 350_000n ? 350_000n : buffered;
      } catch (preErr: any) {
        const decoded = decodeContractCustomErrorMessage({ contractInterface: nftContract.interface, err: preErr });
        throw new Error(decoded || getWalletTxErrorMessage(preErr));
      }

      log(character.id, `Confirme na MetaMask…`);
      const mintTx = await nftContract.mintWithSig(to, intent.tokenURI, deadline, intent.signature, { gasLimit });
      log(character.id, `Tx enviada: ${mintTx.hash}. Aguardando confirmação…`);
      await mintTx.wait();

      log(character.id, `Confirmando no servidor…`);
      const confirmRes = await fetch('/api/nft/character/remint-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: character.id, mintTxHash: mintTx.hash }),
      });
      const confirmed = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(confirmed?.error || 'Falha ao confirmar');

      log(character.id, `✅ Pronto! tokenId ${confirmed.character.nftTokenId}`);
      setCharacters((prev) =>
        prev.map((c) => (c.id === character.id ? { ...c, nftTokenId: confirmed.character.nftTokenId } : c))
      );
    } catch (e: any) {
      log(character.id, `❌ ${e?.message || String(e)}`);
    } finally {
      setBusyId(null);
    }
  };

  if (!session) return <div style={{ padding: 24 }}>Faça login primeiro.</div>;
  if (loading) return <div style={{ padding: 24 }}>Carregando…</div>;

  return (
    <div style={{ padding: 24, fontFamily: 'monospace', color: '#eee', background: '#111', minHeight: '100vh' }}>
      <h1>Remint de personagens</h1>
      <p>Reemite a NFT de personagens do banco sem token vinculado. Um clique = uma transação (MetaMask).</p>
      {characters.map((c) => (
        <div key={c.id} style={{ border: '1px solid #333', padding: 12, marginBottom: 12 }}>
          <strong>{c.name}</strong> — {c.race}/{c.class} — nftTokenId: {c.nftTokenId ?? 'nenhum'}
          <div>
            <button
              disabled={busyId === c.id}
              onClick={() => remint(c)}
              style={{ marginTop: 8, padding: '6px 12px', cursor: 'pointer' }}
            >
              {busyId === c.id ? 'Mintando…' : 'Remint'}
            </button>
          </div>
          {logs[c.id] && <pre style={{ whiteSpace: 'pre-wrap', color: '#9c9' }}>{logs[c.id]}</pre>}
        </div>
      ))}
    </div>
  );
}
