import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'

import { resolveChromeExecutablePath } from './chrome-runtime'
import { applyManualMenuOverride } from './manual-menu-overrides'
import { classifyMenus } from './menu-classifier'
import { parseNaverMenus, RawNaverMenu } from './menu-mapper'
import { ProductionMenusFile, ProductionPlacesFile } from './types'

const collectorRoot = resolve(__dirname, '..')
const dataDirectory = resolve(collectorRoot, '..')
const placesFilePath = resolve(dataDirectory, 'places.production.json')
const menusFilePath = resolve(dataDirectory, 'menus.production.json')
const temporaryMenusFilePath = `${menusFilePath}.tmp`

async function readExistingMenus(): Promise<ProductionMenusFile | null> {
  try {
    return JSON.parse(await readFile(menusFilePath, 'utf8')) as ProductionMenusFile
  } catch {
    return null
  }
}

async function main() {
  await mkdir(dataDirectory, { recursive: true })
  const placesData = JSON.parse(await readFile(placesFilePath, 'utf8')) as ProductionPlacesFile
  const existingMenus = await readExistingMenus()
  const menuPlaces = Object.fromEntries(
    placesData.documents.map((place) => {
      const existingPlaceMenus = existingMenus?.places[place.id] ?? {
        placeName: place.name,
        menus: [],
        menuImageAvailable: false,
      }
      const manualResult = applyManualMenuOverride(place.id, existingPlaceMenus.menus)

      return [
        place.id,
        {
          ...existingPlaceMenus,
          placeName: place.name,
          menus: classifyMenus(manualResult.menus, {
            placeName: place.name,
            placeCategory: place.category,
          }),
        },
      ]
    }),
  )
  const executablePath = resolveChromeExecutablePath()
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : { channel: 'chrome' as const }),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })
  const context = await browser.newContext({
    locale: 'ko-KR',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    viewport: { width: 720, height: 900 },
  })
  const page = await context.newPage()
  let successfulCollections = 0
  const failedPlaceIds: string[] = []

  await page.route('**/*', async (route) => {
    if (['image', 'font', 'media'].includes(route.request().resourceType())) {
      await route.abort()
      return
    }
    await route.continue()
  })

  try {
    for (const [index, place] of placesData.documents.entries()) {
      try {
        const sourceUrl = `https://pcmap.place.naver.com/restaurant/${place.id}/menu/list`
        const response = await page.goto(sourceUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        })
        if (response && !response.ok()) {
          throw new Error(`Naver menu page returned HTTP ${response.status()}`)
        }

        await page.waitForFunction(
          () =>
            Boolean((window as typeof window & { __APOLLO_STATE__?: unknown }).__APOLLO_STATE__),
          undefined,
          { timeout: 8000 },
        )
        const raw = (await page.locator('body').evaluate(() => {
          const state = (
            window as typeof window & {
              __APOLLO_STATE__?: Record<string, Record<string, unknown>>
            }
          ).__APOLLO_STATE__
          const values = Object.values(state ?? {})
          const base = values.find((value) => value.__typename === 'PlaceDetailBase')
          const missingInfo = base?.missingInfo as Record<string, unknown> | undefined

          return {
            menus: values
              .map((value, index) => ({ value, index }))
              .filter(
                ({ value }) =>
                  ['Menu', 'PlaceMenuItem', 'PlaceDetail_BaeminMenu'].includes(
                    String(value.__typename),
                  ) && typeof value.name === 'string',
              )
              .map(({ value, index }) => {
                const price =
                  value.price && typeof value.price === 'object'
                    ? (value.price as Record<string, unknown>)
                    : null
                const images = Array.isArray(value.images)
                  ? value.images.flatMap((image) => {
                      if (typeof image === 'string') return image ? [image] : []
                      if (!image || typeof image !== 'object') return []
                      const url = (image as Record<string, unknown>).url
                      return typeof url === 'string' && url ? [url] : []
                    })
                  : typeof value.thumbnailUrl === 'string' && value.thumbnailUrl
                  ? [value.thumbnailUrl]
                  : []

                return {
                  name: value.name,
                  price: price?.displayText ?? value.price,
                  priceType: price?.priceType ?? value.priceType,
                  description: value.description ?? value.desc,
                  images,
                  recommend: value.recommend ?? value.isRepresentative,
                  index: value.index ?? value.order ?? index,
                }
              }),
            menuImageAvailable: missingInfo?.isMenuImageMissing === false,
          }
        })) as { menus: RawNaverMenu[]; menuImageAvailable: boolean }
        const scrapedMenus = parseNaverMenus(raw.menus)
        const manualResult = applyManualMenuOverride(place.id, scrapedMenus)
        if (scrapedMenus.length === 0 && manualResult.mode !== 'replacement') {
          throw new Error('No menu entries were collected; preserving the previous menu data')
        }
        const previousMenuCount = existingMenus?.places[place.id]?.menus.length ?? 0
        const minimumSafeMenuCount = Math.ceil(previousMenuCount * 0.5)
        if (
          manualResult.mode !== 'replacement' &&
          previousMenuCount >= 5 &&
          manualResult.menus.length < minimumSafeMenuCount
        ) {
          throw new Error(
            `Menu count dropped from ${previousMenuCount} to ${manualResult.menus.length}; ` +
              'preserving the previous menu data',
          )
        }
        const menus = classifyMenus(manualResult.menus, {
          placeName: place.name,
          placeCategory: place.category,
        })

        menuPlaces[place.id] = {
          placeName: place.name,
          menus,
          menuImageAvailable: raw.menuImageAvailable,
        }
        successfulCollections += 1
        console.log(
          `[${index + 1}/${placesData.documents.length}] ${place.name}: ${menus.length} menus` +
            (manualResult.applied ? ' (manual override)' : ''),
        )
      } catch (error) {
        failedPlaceIds.push(place.id)
        console.warn(
          `[${index + 1}/${placesData.documents.length}] ${place.name}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
      await page.waitForTimeout(250)
    }

    const minimumSuccessfulCollections = Math.ceil(placesData.documents.length * 0.8)
    if (successfulCollections < minimumSuccessfulCollections) {
      throw new Error(
        `Only ${successfulCollections}/${placesData.documents.length} menu pages were refreshed. ` +
          'The existing collector file was not replaced.',
      )
    }

    const entries = Object.values(menuPlaces)
    const result: ProductionMenusFile = {
      generatedAt: new Date().toISOString(),
      meta: {
        placeCount: entries.length,
        placesWithMenus: entries.filter((place) => place.menus.length > 0).length,
        totalMenuCount: entries.reduce((sum, place) => sum + place.menus.length, 0),
        notice:
          '네이버 플레이스 등록 정보와 수동 확인을 통해 수집한 메뉴이며 실제 메뉴는 다를 수 있습니다.',
      },
      places: menuPlaces,
    }
    await writeFile(temporaryMenusFilePath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    await rename(temporaryMenusFilePath, menusFilePath)
    console.log(
      `Saved ${result.meta.totalMenuCount} menus for ${result.meta.placesWithMenus}/` +
        `${result.meta.placeCount} places; ${failedPlaceIds.length} failures preserved.`,
    )
  } finally {
    await context.close()
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
