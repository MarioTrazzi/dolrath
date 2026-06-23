'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import toast from 'react-hot-toast'
import { ethers } from 'ethers'
import { getPolygonFeeOverrides } from '@/lib/gasFees'
import { getWalletTxErrorMessage } from '@/lib/walletErrors'
import { resolveImageUrl } from '@/lib/imageUrl'
import { getItemVisual, getItemTypeLabel } from '@/lib/itemVisuals'

// Miniatura do item: imagem (Cloudinary/URL) ou fallback com emoji/categoria.
function ItemThumb({ image, type, enhancement }: { image?: string | null; type: string; enhancement?: number }) {
  const url = resolveImageUrl(image ?? null)
  const visual = getItemVisual(type)
  return (
    <div
      className="relative w-14 h-14 shrink-0 rounded-lg overflow-hidden ring-1 ring-white/10 flex items-center justify-center"
      style={{ background: `${visual.accent}22` }}
    >
      {url ? (
        <Image
          src={url}
          alt=""
          fill
          sizes="56px"
          className="object-cover"
          unoptimized={!/^https?:\/\//i.test(url)}
        />
      ) : (
        <span className="text-2xl">{visual.emoji}</span>
      )}
      {enhancement && enhancement > 0 ? (
        <span className="absolute bottom-0 right-0 text-[10px] font-black px-1 rounded-tl-md bg-amber-500 text-black">
          +{enhancement}
        </span>
      ) : null}
    </div>
  )
}

// ABIs mínimos para os fluxos on-chain do marketplace.
const ERC20_ABI = [
  'function approve(address spender, uint256 value) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
] as const
const ITEMS_ABI = [
  'function mintWithSig(address to, bytes32 purchaseId, bytes32 itemKey, uint256 paidGold, string tokenURI, uint256 deadline, bytes signature) returns (uint256)',
  'function setApprovalForAll(address operator, bool approved)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
] as const
const MARKET_ABI = [
  'function createListing(uint256 tokenId, uint256 priceGold) returns (uint256)',
  'function buy(uint256 listingId)',
] as const

interface MarketConfig {
  chainId: number
  marketContractAddress: string
  goldContractAddress: string
  itemNftContractAddress: string
  gold: { decimals: number; symbol: string }
}
interface Listing {
  listingId: string
  seller: string
  tokenId: string
  priceGold: { raw: string; formatted: string }
  item: { id: string; name: string; type: string; level: number; goldPrice: number; image?: string | null; enhancementLevel?: number; mintSource?: string } | null
  dbOwner: { userId: string; walletAddress: string | null } | null
}
interface Character { id: string; name: string }
interface InvRow { id: string; quantity: number; enhancementLevel: number; item: { id: string; name: string; type: string; goldPrice: number; image?: string | null } }

async function getSigner(expectedChainId: number) {
  const eth = (window as any)?.ethereum
  if (!eth) throw new Error('MetaMask não encontrada')
  const provider = new ethers.BrowserProvider(eth)
  await provider.send('eth_requestAccounts', [])
  const network = await provider.getNetwork()
  if (Number(network.chainId) !== Number(expectedChainId)) {
    throw new Error(`Troque a rede para chainId ${expectedChainId} na MetaMask`)
  }
  return { provider, signer: await provider.getSigner() }
}

export default function MarketplacePage() {
  const { data: session } = useSession()
  const [config, setConfig] = useState<MarketConfig | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [busy, setBusy] = useState(false)

  // Vender
  const [characters, setCharacters] = useState<Character[]>([])
  const [selectedChar, setSelectedChar] = useState('')
  const [inventory, setInventory] = useState<InvRow[]>([])
  const [prices, setPrices] = useState<Record<string, string>>({})

  const loadConfigAndListings = useCallback(async () => {
    setLoadingList(true)
    try {
      const [cfgRes, lstRes] = await Promise.all([
        fetch('/api/market/config'),
        fetch('/api/market/listings'),
      ])
      if (cfgRes.ok) setConfig(await cfgRes.json())
      const lst = await lstRes.json()
      if (lstRes.ok) setListings(lst.listings || [])
      else toast.error(lst?.error || 'Falha ao carregar o mercado')
    } catch {
      toast.error('Falha ao carregar o mercado')
    } finally {
      setLoadingList(false)
    }
  }, [])

  const loadCharacters = useCallback(async () => {
    try {
      const res = await fetch('/api/character')
      if (!res.ok) return
      const data = await res.json()
      const list: Character[] = (Array.isArray(data) ? data : []).map((c: any) => ({ id: c.id, name: c.name }))
      setCharacters(list)
      if (list.length > 0) setSelectedChar((prev) => prev || list[0].id)
    } catch { /* silencioso */ }
  }, [])

  const loadInventory = useCallback(async (characterId: string) => {
    if (!characterId) return
    try {
      const res = await fetch(`/api/store/inventory?characterId=${characterId}`)
      if (!res.ok) return
      const rows = await res.json()
      const equip: InvRow[] = (Array.isArray(rows) ? rows : [])
        .filter((r: any) => r?.item && r.item.type !== 'CONSUMABLE')
      setInventory(equip)
    } catch { /* silencioso */ }
  }, [])

  useEffect(() => { loadConfigAndListings(); loadCharacters() }, [loadConfigAndListings, loadCharacters])
  useEffect(() => { if (selectedChar) loadInventory(selectedChar) }, [selectedChar, loadInventory])

  // ---- Comprar (wallet: approve GOLD + market.buy) ----
  const handleBuy = async (l: Listing) => {
    if (!config) return
    setBusy(true)
    const id = `buy-${l.listingId}`
    try {
      const { provider, signer } = await getSigner(config.chainId)
      const fees = await getPolygonFeeOverrides(provider)
      const gold = new ethers.Contract(config.goldContractAddress, ERC20_ABI, signer)
      toast.loading('Aprovando GOLD…', { id })
      await (await gold.approve(config.marketContractAddress, BigInt(l.priceGold.raw), fees)).wait()
      const market = new ethers.Contract(config.marketContractAddress, MARKET_ABI, signer)
      toast.loading('Comprando…', { id })
      await (await market.buy(BigInt(l.listingId), fees)).wait()
      toast.success('Compra concluída! O item NFT é seu.', { id })
      loadConfigAndListings()
    } catch (e) {
      toast.error(getWalletTxErrorMessage(e) || 'Falha na compra', { id })
    } finally {
      setBusy(false)
    }
  }

  // ---- Vender via LAZY-MINT (intent → mint → confirm → approve → createListing) ----
  const handleSell = async (row: InvRow) => {
    if (!config) return
    const priceStr = (prices[row.id] || '').trim()
    const priceNum = Number(priceStr)
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      toast.error('Defina um preço em GOLD maior que zero.')
      return
    }
    setBusy(true)
    const id = `sell-${row.id}`
    try {
      // 1) Voucher de mint (servidor assina; valida posse do item ganho).
      toast.loading('Preparando o mint…', { id })
      const intentRes = await fetch('/api/marketplace/list-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventoryId: row.id }),
      })
      const intent = await intentRes.json()
      if (!intentRes.ok) {
        toast.error(intent?.error || 'Falha ao preparar a listagem', { id })
        return
      }

      const { provider, signer } = await getSigner(config.chainId)
      const fees = await getPolygonFeeOverrides(provider)
      const items = new ethers.Contract(config.itemNftContractAddress, ITEMS_ABI, signer)
      const m = intent.mint

      // 2) Mint do NFT (paga só o gas).
      toast.loading('Cunhando o NFT…', { id })
      const mintTx = await items.mintWithSig(m.to, m.purchaseId, m.itemKey, BigInt(m.paidGold), m.tokenURI, BigInt(m.deadline), m.signature, fees)
      await mintTx.wait()

      // 3) Confirma no servidor: QUEIMA a linha de inventário + registra o NFT.
      toast.loading('Registrando o item…', { id })
      const confRes = await fetch('/api/marketplace/list-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventoryId: row.id, mintTxHash: mintTx.hash }),
      })
      const conf = await confRes.json()
      if (!confRes.ok) {
        toast.error(conf?.error || 'Mint feito, mas falha ao registrar. Tente listar de novo.', { id })
        return
      }
      const tokenId = BigInt(conf.tokenId)

      // 4) Aprova o marketplace e cria a listagem.
      const market = new ethers.Contract(config.marketContractAddress, MARKET_ABI, signer)
      const approved = await (items as any).isApprovedForAll(m.to, config.marketContractAddress)
      if (!approved) {
        toast.loading('Autorizando o mercado…', { id })
        await (await items.setApprovalForAll(config.marketContractAddress, true, fees)).wait()
      }
      toast.loading('Publicando a listagem…', { id })
      const priceWei = ethers.parseUnits(String(priceNum), config.gold.decimals)
      await (await market.createListing(tokenId, priceWei, fees)).wait()

      toast.success(`Listado por ${priceNum} ${config.gold.symbol}!`, { id })
      setPrices((p) => ({ ...p, [row.id]: '' }))
      loadInventory(selectedChar)
      loadConfigAndListings()
    } catch (e) {
      toast.error(getWalletTxErrorMessage(e) || 'Falha ao listar', { id })
    } finally {
      setBusy(false)
    }
  }

  if (!session) {
    return <div className="max-w-5xl mx-auto p-8 text-center text-textsec">Faça login para acessar o mercado.</div>
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-8 space-y-10">
      <header>
        <h1 className="text-3xl font-black text-amber-300">🏪 Mercado</h1>
        <p className="text-textsec text-sm mt-1">
          Compre e venda equipamentos entre jogadores. Itens ganhos só viram NFT quando você os lista (lazy-mint) —
          você paga apenas o gás.
        </p>
      </header>

      {/* VENDER */}
      <section className="rounded-2xl border border-amber-400/20 bg-black/30 p-5">
        <h2 className="text-xl font-bold text-amber-200 mb-3">Vender um item</h2>
        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm text-textsec">Personagem:</label>
          <select
            value={selectedChar}
            onChange={(e) => setSelectedChar(e.target.value)}
            className="bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
          >
            {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {inventory.length === 0 ? (
          <p className="text-textsec text-sm">Nenhum equipamento neste personagem para vender.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {inventory.map((row) => (
              <div key={row.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <ItemThumb image={row.item.image} type={row.item.type} enhancement={row.enhancementLevel} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white truncate">
                    {row.item.name}
                    {row.enhancementLevel > 0 ? <span className="text-amber-300"> +{row.enhancementLevel}</span> : null}
                  </div>
                  <div className="text-xs text-textsec">valor base {row.item.goldPrice} 🪙</div>
                </div>
                <input
                  type="number" min={1} placeholder="preço"
                  value={prices[row.id] || ''}
                  onChange={(e) => setPrices((p) => ({ ...p, [row.id]: e.target.value }))}
                  className="w-24 bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white"
                />
                <button
                  onClick={() => handleSell(row)}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg text-sm font-bold text-amber-50 bg-amber-700/70 border border-amber-400/40 disabled:opacity-40"
                >
                  Listar
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* COMPRAR */}
      <section>
        <h2 className="text-xl font-bold text-amber-200 mb-3">À venda</h2>
        {loadingList ? (
          <p className="text-textsec text-sm">Carregando listagens…</p>
        ) : listings.length === 0 ? (
          <p className="text-textsec text-sm">Nenhum item à venda no momento.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((l) => (
              <div key={l.listingId} className="rounded-2xl border border-white/10 bg-slate-900/50 p-4 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <ItemThumb image={l.item?.image} type={l.item?.type ?? ''} enhancement={l.item?.enhancementLevel} />
                  <div className="min-w-0">
                    <div className="font-bold text-white truncate">
                      {l.item?.name ?? `Token #${l.tokenId}`}
                      {l.item?.enhancementLevel ? <span className="text-amber-300"> +{l.item.enhancementLevel}</span> : null}
                    </div>
                    <div className="text-xs text-textsec">
                      {l.item ? `${getItemTypeLabel(l.item.type)} • Nv.${l.item.level}` : 'Item fora do catálogo'}
                    </div>
                  </div>
                </div>
                <div className="text-amber-300 font-black mt-auto">{l.priceGold.formatted} {config?.gold.symbol || 'GOLD'}</div>
                <button
                  onClick={() => handleBuy(l)}
                  disabled={busy || l.dbOwner?.userId === session.user?.id}
                  className="px-3 py-2 rounded-lg text-sm font-bold text-white bg-emerald-700/70 border border-emerald-400/30 disabled:opacity-40"
                  title={l.dbOwner?.userId === session.user?.id ? 'Sua própria listagem' : ''}
                >
                  {l.dbOwner?.userId === session.user?.id ? 'Sua listagem' : '💰 Comprar'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
