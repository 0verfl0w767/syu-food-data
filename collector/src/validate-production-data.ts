import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { applyManualMenuOverride } from './manual-menu-overrides'
import { classifyMenus } from './menu-classifier'
import {
  COLLECTION_RADIUS_METERS,
  EXCLUDED_PLACE_IDS,
  EXCLUDED_PLACE_NAMES,
  isPlaceWithinCollectionPolicy,
  REQUIRED_PLACE_IDS,
} from './place-policy'
import {
  MENU_CATEGORIES,
  MENU_CUISINES,
  ProductionMenusFile,
  ProductionPlacesFile,
  ProductionReviewsFile,
} from './types'

const dataDirectory = resolve(__dirname, '..', 'data')

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function isValidDate(value: string | undefined) {
  return Boolean(value && Number.isFinite(Date.parse(value)))
}

async function main() {
  const places = JSON.parse(
    await readFile(resolve(dataDirectory, 'places.production.json'), 'utf8'),
  ) as ProductionPlacesFile
  const reviews = JSON.parse(
    await readFile(resolve(dataDirectory, 'reviews.production.json'), 'utf8'),
  ) as ProductionReviewsFile
  const menus = JSON.parse(
    await readFile(resolve(dataDirectory, 'menus.production.json'), 'utf8'),
  ) as ProductionMenusFile

  assert(Array.isArray(places.documents), 'places.production.json documents must be an array')
  assert(places.documents.length >= 10, 'places.production.json contains too few places')
  assert(
    places.meta.totalCount === places.documents.length,
    'places.production.json meta.totalCount does not match documents length',
  )
  assert(isValidDate(places.generatedAt), 'places.production.json generatedAt is invalid')
  assert(isValidDate(reviews.generatedAt), 'reviews.production.json generatedAt is invalid')
  assert(isValidDate(menus.generatedAt), 'menus.production.json generatedAt is invalid')

  const placeIds = places.documents.map((place) => String(place.id))
  const uniquePlaceIds = new Set(placeIds)
  assert(uniquePlaceIds.size === placeIds.length, 'places.production.json contains duplicate IDs')
  places.documents.forEach((place) => {
    assert(/^\d{1,20}$/.test(String(place.id)), `Invalid place ID: ${place.id}`)
    assert(place.name?.trim(), `Place ${place.id} has no name`)
    assert(
      isPlaceWithinCollectionPolicy(place),
      `Place ${place.id} violates the ${COLLECTION_RADIUS_METERS}m collection policy`,
    )
  })
  REQUIRED_PLACE_IDS.forEach((placeId) => {
    assert(uniquePlaceIds.has(placeId), `Required place is missing: ${placeId}`)
  })
  EXCLUDED_PLACE_IDS.forEach((placeId) => {
    assert(!uniquePlaceIds.has(placeId), `Excluded place is still present: ${placeId}`)
  })
  places.documents.forEach((place) => {
    assert(
      !EXCLUDED_PLACE_NAMES.has(place.name.trim()),
      `Excluded place name is still present: ${place.name}`,
    )
  })

  const reviewIds = Object.keys(reviews.places)
  const menuIds = Object.keys(menus.places)
  const missingReviewIds = placeIds.filter((placeId) => !reviews.places[placeId])
  const extraReviewIds = reviewIds.filter((placeId) => !uniquePlaceIds.has(placeId))
  const missingMenuIds = placeIds.filter((placeId) => !menus.places[placeId])
  const extraMenuIds = menuIds.filter((placeId) => !uniquePlaceIds.has(placeId))
  assert(missingReviewIds.length === 0, `Missing review entries: ${missingReviewIds.join(', ')}`)
  assert(extraReviewIds.length === 0, `Unknown review entries: ${extraReviewIds.join(', ')}`)
  assert(missingMenuIds.length === 0, `Missing menu entries: ${missingMenuIds.join(', ')}`)
  assert(extraMenuIds.length === 0, `Unknown menu entries: ${extraMenuIds.join(', ')}`)

  let totalReviews = 0
  let placesWithReviews = 0
  reviewIds.forEach((placeId) => {
    const placeReviews = reviews.places[placeId].reviews
    assert(Array.isArray(placeReviews), `Reviews for ${placeId} must be an array`)
    assert(placeReviews.length <= 5, `Place ${placeId} contains more than five reviews`)
    placeReviews.forEach((review) => {
      assert(
        typeof review === 'string' && review.trim().length > 1,
        `Invalid review for ${placeId}`,
      )
    })
    totalReviews += placeReviews.length
    if (placeReviews.length > 0) placesWithReviews += 1
  })
  assert(
    placesWithReviews >= Math.ceil(placeIds.length * 0.8),
    'Fewer than 80% of places have visitor review text',
  )

  let totalMenus = 0
  let placesWithMenus = 0
  menuIds.forEach((placeId) => {
    const placeMenus = menus.places[placeId]
    const place = places.documents.find((candidate) => candidate.id === placeId)
    assert(
      placeMenus.placeName === place?.name,
      `Menu place name does not match for ${placeId}`,
    )
    assert(Array.isArray(placeMenus.menus), `Menus for ${placeId} must be an array`)
    assert(placeMenus.menus.length <= 300, `Place ${placeId} contains too many menus`)
    const manualResult = applyManualMenuOverride(placeId, placeMenus.menus)
    const classifiedManualMenus = classifyMenus(manualResult.menus, {
      placeName: place?.name ?? '',
      placeCategory: place?.category ?? '',
    })
    assert(
      JSON.stringify(classifiedManualMenus) === JSON.stringify(placeMenus.menus),
      `Menu classification or manual override is stale for ${placeId}`,
    )
    placeMenus.menus.forEach((menu) => {
      assert(
        typeof menu.name === 'string' && menu.name.trim().length > 0,
        `Invalid menu name for ${placeId}`,
      )
      assert(
        menu.price === null || (Number.isFinite(menu.price) && menu.price >= 0),
        `Invalid menu price for ${placeId}`,
      )
      assert(
        MENU_CATEGORIES.includes(menu.category),
        `Invalid menu category for ${placeId}: ${menu.category}`,
      )
      assert(
        MENU_CUISINES.includes(menu.cuisine),
        `Invalid menu cuisine for ${placeId}: ${menu.cuisine}`,
      )
    })
    totalMenus += placeMenus.menus.length
    if (placeMenus.menus.length > 0) placesWithMenus += 1
  })
  assert(menus.meta.placeCount === placeIds.length, 'menus meta.placeCount does not match places')
  assert(
    menus.meta.placesWithMenus === placesWithMenus,
    'menus meta.placesWithMenus does not match menu data',
  )
  assert(
    menus.meta.totalMenuCount === totalMenus,
    'menus meta.totalMenuCount does not match menu data',
  )

  console.log(
    `Validated ${placeIds.length} places, ${totalReviews} reviews, and ${totalMenus} menus ` +
      `(${placesWithReviews} places with review text, ${placesWithMenus} with menus).`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
