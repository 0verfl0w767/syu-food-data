import { NaverPlaceDocument } from './types'

export const COLLECTION_RADIUS_METERS = 400
export const MIN_VISITOR_REVIEW_COUNT = 5

export const REQUIRED_PLACE_IDS = new Set([
  '1743715551', // 세상만사 감자탕
])

export const EXCLUDED_PLACE_IDS = new Set([
  '1226056720', // 창부리또
  '1503748345', // 오렌지몽키파스타&필라프 별내점
  '1396200286', // 수내닭꼬치 삼육대점
  '1532984460', // 파인하우스
  '1219721809', // 서진푸드
  '1710041566', // 과수원
  '36877832', // AM1122CAKE
])

export const EXCLUDED_PLACE_NAMES = new Set([
  '창부리또',
  '오렌지몽키파스타&필라프 별내점',
  '수내닭꼬치 삼육대점',
  '파인하우스',
  '서진푸드',
  '과수원',
  'AM1122CAKE',
])

export function isExcludedPlace(place: Pick<NaverPlaceDocument, 'id' | 'name'>): boolean {
  return EXCLUDED_PLACE_IDS.has(place.id) || EXCLUDED_PLACE_NAMES.has(place.name.trim())
}

export function isPlaceWithinCollectionPolicy(place: NaverPlaceDocument): boolean {
  const distance = Number(place.distance)
  return (
    Number.isFinite(distance) &&
    distance <= COLLECTION_RADIUS_METERS &&
    place.visitorReviewCount !== null &&
    place.visitorReviewCount >= MIN_VISITOR_REVIEW_COUNT &&
    !isExcludedPlace(place)
  )
}
