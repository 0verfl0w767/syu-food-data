import { UnclassifiedNaverMenuItem } from './types'

export type RawNaverMenu = {
  name?: unknown
  price?: unknown
  priceType?: unknown
  description?: unknown
  images?: unknown
  recommend?: unknown
  index?: unknown
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/\s+/g, ' ').trim()
  return text || null
}

function menuPrice(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const normalized = String(value).replace(/[^\d.-]/g, '')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function menuIndex(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER
}

export function parseNaverMenus(rawMenus: RawNaverMenu[]): UnclassifiedNaverMenuItem[] {
  const uniqueMenus = new Map<string, UnclassifiedNaverMenuItem & { index: number }>()

  rawMenus.forEach((rawMenu) => {
    const name = optionalText(rawMenu.name)
    if (!name) return

    const images = Array.isArray(rawMenu.images)
      ? rawMenu.images.filter((image): image is string => typeof image === 'string' && !!image)
      : []
    const item = {
      name,
      price: menuPrice(rawMenu.price),
      priceType: optionalText(rawMenu.priceType),
      description: optionalText(rawMenu.description),
      imageUrl: images[0] ?? null,
      recommended: rawMenu.recommend === true,
      index: menuIndex(rawMenu.index),
    }
    const key = `${item.name.toLocaleLowerCase('ko-KR')}\u0000${item.price ?? ''}`
    const existing = uniqueMenus.get(key)
    if (!existing || item.index < existing.index) uniqueMenus.set(key, item)
  })

  return Array.from(uniqueMenus.values())
    .sort((a, b) => a.index - b.index || a.name.localeCompare(b.name, 'ko-KR'))
    .map(({ index: _index, ...menu }) => menu)
}
