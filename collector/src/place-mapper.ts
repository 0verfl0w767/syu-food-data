import { NaverPlaceDocument, NaverSearchPlace } from './types'

function toNumber(value: number | string | undefined): number | null {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(String(value).replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

export function mapNaverPlace(place: NaverSearchPlace): NaverPlaceDocument {
  const id = String(place.id ?? '')
  const imageUrls = Array.from(
    new Set([place.thumUrl, ...(place.thumUrls ?? []), place.imageUrl].filter(Boolean) as string[]),
  )
  const microReview = Array.isArray(place.microReview)
    ? place.microReview.find(Boolean) ?? null
    : place.microReview || null
  const score =
    toNumber(place.visitorReviewScore) ??
    toNumber(place.visitorReviewScoreText) ??
    toNumber(place.rating)
  const category = place.category?.[Math.max(0, (place.category?.length ?? 1) - 1)] ?? '음식점'

  return {
    id,
    name: place.name ?? '',
    category,
    roadAddress: place.roadAddress ?? '',
    address: place.address ?? '',
    phone: place.telDisplay ?? place.tel ?? '',
    x: place.x ?? '',
    y: place.y ?? '',
    distance: place.distance ?? '',
    visitorReviewCount: toNumber(place.placeReviewCount ?? place.visitorReviewCount),
    blogReviewCount: toNumber(place.reviewCount),
    visitorReviewScore: score !== null && score >= 0 && score <= 5 ? score : null,
    imageUrl: imageUrls[0] ?? null,
    imageUrls,
    microReview,
    naverMapUrl: id ? `https://map.naver.com/p/entry/place/${id}` : 'https://map.naver.com/',
  }
}

export function sortNaverPlacesByDistance(places: NaverPlaceDocument[]): NaverPlaceDocument[] {
  return places
    .map((place, index) => ({
      place,
      index,
      distance: toNumber(place.distance) ?? Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .map(({ place }) => place)
}

export function calculatePlaceDistance(
  place: NaverPlaceDocument,
  originX: number,
  originY: number,
): NaverPlaceDocument {
  const placeX = toNumber(place.x)
  const placeY = toNumber(place.y)
  if (placeX === null || placeY === null) return { ...place, distance: '' }

  const earthRadiusMeters = 6371000
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const latitudeDelta = toRadians(placeY - originY)
  const longitudeDelta = toRadians(placeX - originX)
  const originLatitude = toRadians(originY)
  const placeLatitude = toRadians(placeY)
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) * Math.cos(placeLatitude) * Math.sin(longitudeDelta / 2) ** 2
  const distance = 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine))

  return { ...place, distance: distance.toFixed(2) }
}

export function filterNaverPlacesWithinRadius(
  places: NaverPlaceDocument[],
  radius: number,
): NaverPlaceDocument[] {
  return places.filter((place) => {
    const distance = toNumber(place.distance)
    return distance !== null && distance <= radius
  })
}

export function filterNaverPlacesByVisitorReviews(
  places: NaverPlaceDocument[],
  minimumReviewCount: number,
): NaverPlaceDocument[] {
  return places.filter(
    (place) => place.visitorReviewCount !== null && place.visitorReviewCount >= minimumReviewCount,
  )
}
