import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'

import { resolveChromeExecutablePath } from './chrome-runtime'
import { parseNaverVisitorReviewTexts } from './review-mapper'
import { ProductionPlacesFile, ProductionReviewsFile } from './types'

const collectorRoot = resolve(__dirname, '..')
const dataDirectory = resolve(collectorRoot, 'data')
const placesFilePath = resolve(dataDirectory, 'places.production.json')
const reviewsFilePath = resolve(dataDirectory, 'reviews.production.json')
const temporaryReviewsFilePath = `${reviewsFilePath}.tmp`

async function readExistingReviews(): Promise<ProductionReviewsFile | null> {
  try {
    return JSON.parse(await readFile(reviewsFilePath, 'utf8')) as ProductionReviewsFile
  } catch {
    return null
  }
}

async function main() {
  await mkdir(dataDirectory, { recursive: true })
  const placesData = JSON.parse(await readFile(placesFilePath, 'utf8')) as ProductionPlacesFile
  const existingReviews = await readExistingReviews()
  const collectedReviews: ProductionReviewsFile = {
    generatedAt: new Date().toISOString(),
    places: Object.fromEntries(
      placesData.documents.map((place) => [
        place.id,
        {
          placeName: place.name,
          reviews: existingReviews?.places[place.id]?.reviews ?? [],
        },
      ]),
    ),
  }
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
        await page.goto(`https://pcmap.place.naver.com/restaurant/${place.id}/review/visitor`, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        })
        await page
          .locator('a[data-pui-click-code="rvshowmore"]')
          .first()
          .waitFor({ state: 'attached', timeout: 8000 })
          .catch(() => undefined)

        const rawReviewTexts = await page
          .locator('a[data-pui-click-code="rvshowmore"]')
          .allInnerTexts()
        const reviews = parseNaverVisitorReviewTexts(rawReviewTexts)
        if (reviews.length === 0) throw new Error('No visitor review text was collected')

        collectedReviews.places[place.id] = { placeName: place.name, reviews }
        successfulCollections += 1
        console.log(
          `[${index + 1}/${placesData.documents.length}] ${place.name}: ${reviews.length} reviews`,
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
        `Only ${successfulCollections}/${placesData.documents.length} places were refreshed. ` +
          'The existing collector file was not replaced.',
      )
    }

    collectedReviews.generatedAt = new Date().toISOString()
    await writeFile(temporaryReviewsFilePath, `${JSON.stringify(collectedReviews, null, 2)}\n`)
    await rename(temporaryReviewsFilePath, reviewsFilePath)
    console.log(
      `Saved reviews for ${placesData.documents.length} places; ` +
        `${successfulCollections} refreshed, ${failedPlaceIds.length} preserved.`,
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
