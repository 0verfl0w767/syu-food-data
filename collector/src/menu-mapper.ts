import { UnclassifiedNaverMenuItem } from './types'

export const MAX_MENU_PRICE_WON = 1_000_000

const NON_FIXED_PRICE_TYPES = new Set(['amountrange', 'dynamic', 'free'])

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

function isNonFixedPriceType(priceType: string | null): boolean {
  return priceType !== null && NON_FIXED_PRICE_TYPES.has(priceType.toLowerCase())
}

export function parseMenuPrice(value: unknown, priceType: string | null = null): number | null {
  if (isNonFixedPriceType(priceType)) return null
  if (typeof value !== 'string' && typeof value !== 'number') return null

  const text = String(value).trim()
  if (!text || /[~〜]/.test(text) || /\d[\d,\s]*[-–—]\s*\d/.test(text)) return null

  const matchedPrices = text.match(/\d[\d,]*(?:\.\d+)?/gu)
  if (matchedPrices?.length !== 1) return null

  const parsed = Number(matchedPrices[0].replace(/,/g, ''))
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_MENU_PRICE_WON ? parsed : null
}

export function normalizeMenuPrice<T extends { price: number | null; priceType: string | null }>(
  menu: T,
): T {
  const price = parseMenuPrice(menu.price, menu.priceType)
  return price === menu.price ? menu : { ...menu, price }
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
    const priceType = optionalText(rawMenu.priceType)
    const item = {
      name,
      price: parseMenuPrice(rawMenu.price, priceType),
      priceType,
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
