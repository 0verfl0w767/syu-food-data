import { Browser, chromium, Page } from 'playwright-core'

import { resolveChromeExecutablePath } from './chrome-runtime'
import {
  calculatePlaceDistance,
  filterNaverPlacesByVisitorReviews,
  filterNaverPlacesWithinRadius,
  mapNaverPlace,
  sortNaverPlacesByDistance,
} from './place-mapper'
import {
  EXCLUDED_PLACE_IDS,
  EXCLUDED_PLACE_NAMES,
  MIN_VISITOR_REVIEW_COUNT,
} from './place-policy'
import { NaverPlaceDocument, NaverSearchPlace } from './types'

type PlaceSearch = {
  query: string
  x: number
  y: number
  radius: number
}

const FOOD_DISCOVERY_QUERIES = [
  '음식점',
  '삼육대 후문 맛집',
  '한식',
  '중식',
  '일식',
  '양식',
  '분식',
  '치킨',
  '닭갈비',
  '참맛집',
  '세상만사 감자탕',
]
const CAFE_DISCOVERY_QUERIES = ['카페', '디저트', '베이커리']

export class NaverPlaceCollector {
  private browser: Browser | null = null
  private readonly timeoutMs: number

  constructor() {
    const configuredTimeout = Number(process.env.NAVER_COLLECTOR_TIMEOUT_MS)
    this.timeoutMs =
      Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 30000
  }

  async collect(search: PlaceSearch): Promise<NaverPlaceDocument[]> {
    const browser = await this.getBrowser()
    const context = await browser.newContext({
      locale: 'ko-KR',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 900 },
    })
    const page = await context.newPage()

    try {
      await page.route('**/*', async (route) => {
        if (['image', 'font', 'media'].includes(route.request().resourceType())) {
          await route.abort()
          return
        }
        await route.continue()
      })

      const collectedPlaces: NaverSearchPlace[] = []
      const failedQueries: string[] = []
      const discoveryQueries =
        search.query === '음식점'
          ? FOOD_DISCOVERY_QUERIES
          : search.query === '카페'
          ? CAFE_DISCOVERY_QUERIES
          : [search.query]

      for (const discoveryQuery of discoveryQueries) {
        try {
          collectedPlaces.push(
            ...(await this.readExpandedSearchPlaces(page, search, discoveryQuery)),
          )
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          failedQueries.push(`${discoveryQuery}: ${detail}`)
          console.warn(`Naver place search failed for "${discoveryQuery}": ${detail}`)
        }
      }

      if (collectedPlaces.length === 0) {
        throw new Error(`No Naver place data was collected. ${failedQueries.join(' | ')}`)
      }

      const uniquePlaces = Array.from(
        collectedPlaces
          .filter((place) => place.id)
          .reduce((places, place) => {
            const id = place.id as string
            if (!places.has(id)) places.set(id, place)
            return places
          }, new Map<string, NaverSearchPlace>())
          .values(),
      )
      const sortedDocuments = sortNaverPlacesByDistance(
        uniquePlaces
          .map(mapNaverPlace)
          .filter((place) => place.id && place.name)
          .map((place) => calculatePlaceDistance(place, search.x, search.y)),
      )
      const placesWithinRadius = filterNaverPlacesWithinRadius(sortedDocuments, search.radius)

      return filterNaverPlacesByVisitorReviews(
        placesWithinRadius.filter(
          (place) =>
            !EXCLUDED_PLACE_IDS.has(place.id) && !EXCLUDED_PLACE_NAMES.has(place.name.trim()),
        ),
        MIN_VISITOR_REVIEW_COUNT,
      )
    } finally {
      await context.close()
    }
  }

  async close(): Promise<void> {
    await this.browser?.close()
    this.browser = null
  }

  private buildSearchUrl(search: PlaceSearch, query: string): string {
    const params = new URLSearchParams({
      query,
      x: String(search.x),
      y: String(search.y),
      display: '70',
      locale: 'ko',
      sortingOrder: 'distance',
    })
    return `https://pcmap.place.naver.com/place/list?${params}`
  }

  private async readExpandedSearchPlaces(
    page: Page,
    search: PlaceSearch,
    query: string,
  ): Promise<NaverSearchPlace[]> {
    const response = await page.goto(this.buildSearchUrl(search, query), {
      waitUntil: 'domcontentloaded',
      timeout: this.timeoutMs,
    })
    if (response && !response.ok()) {
      throw new Error(`Naver place page returned HTTP ${response.status()}`)
    }

    await page.waitForFunction(
      () => Boolean((window as typeof window & { __APOLLO_STATE__?: unknown }).__APOLLO_STATE__),
      undefined,
      { timeout: Math.min(this.timeoutMs, 8000) },
    )

    return (await page.locator('body').evaluate(() => {
      const state = (
        window as typeof window & {
          __APOLLO_STATE__?: Record<string, Record<string, unknown>>
        }
      ).__APOLLO_STATE__

      return Object.values(state ?? {}).flatMap((value) => {
        if (!value.id || !value.name || !value.x || !value.y) return []

        const category = Array.isArray(value.category)
          ? value.category.filter((item): item is string => typeof item === 'string')
          : typeof value.category === 'string'
          ? [value.category]
          : []
        const imageUrls = Array.isArray(value.imageUrls)
          ? value.imageUrls.filter((item): item is string => typeof item === 'string')
          : []
        const microReview = Array.isArray(value.microReview)
          ? value.microReview.filter((item): item is string => typeof item === 'string')
          : typeof value.microReview === 'string'
          ? value.microReview
          : undefined

        return [
          {
            id: String(value.id),
            name: String(value.name),
            category,
            address: typeof value.address === 'string' ? value.address : undefined,
            roadAddress: typeof value.roadAddress === 'string' ? value.roadAddress : undefined,
            tel: typeof value.phone === 'string' ? value.phone : undefined,
            telDisplay: typeof value.virtualPhone === 'string' ? value.virtualPhone : undefined,
            x: String(value.x),
            y: String(value.y),
            distance: typeof value.distance === 'string' ? value.distance : undefined,
            reviewCount: value.blogCafeReviewCount as number | string | undefined,
            placeReviewCount: value.visitorReviewCount as number | string | undefined,
            visitorReviewScore: value.visitorReviewScore as number | string | undefined,
            thumUrl: typeof value.imageUrl === 'string' ? value.imageUrl : undefined,
            thumUrls: imageUrls,
            microReview,
          },
        ]
      })
    })) as NaverSearchPlace[]
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser

    const executablePath = resolveChromeExecutablePath()
    if (process.platform === 'linux' && !executablePath) {
      throw new Error('Chrome or Chromium was not found on this Linux system')
    }

    console.log(`Launching Chrome with ${executablePath ?? 'installed Chrome channel'}`)
    this.browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : { channel: 'chrome' as const }),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    })
    return this.browser
  }
}
