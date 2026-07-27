'use client'

import { useEffect, useState } from 'react'
import { resolveImageUrl } from '@/lib/imageUrl'
import { itemImagePath } from '@/lib/itemCatalog'

/**
 * Resolve a arte do item com fallback em cascata:
 *   1) item.image (DB / Cloudinary / path)
 *   2) /item-art/<slug>.webp pelo nome
 *   3) null → o caller mostra ItemIcon/emoji
 *
 * Cada onError avança para o próximo candidato (não desiste no primeiro 404).
 */
export function useResolvedItemImage(image?: string | null, name?: string | null) {
  const primary = resolveImageUrl(image)
  const byName = name ? itemImagePath(name) : null
  const candidates = [primary, byName].filter(
    (u, i, arr): u is string => !!u && arr.indexOf(u) === i,
  )

  const [index, setIndex] = useState(0)
  useEffect(() => {
    setIndex(0)
  }, [image, name])

  return {
    src: candidates[index] ?? null,
    onError: () => setIndex((n) => n + 1),
  }
}
