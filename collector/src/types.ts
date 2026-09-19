export interface NaverSearchPlace {
  id?: string
  name?: string
  tel?: string
  telDisplay?: string
  category?: string[]
  address?: string
  roadAddress?: string
  x?: string
  y?: string
  distance?: string
  reviewCount?: number | string
  placeReviewCount?: number | string
  visitorReviewCount?: number | string
  visitorReviewScore?: number | string
  visitorReviewScoreText?: number | string
  rating?: number | string
  thumUrl?: string
  thumUrls?: string[]
  imageUrl?: string
  microReview?: string[] | string
}

export interface NaverPlaceDocument {
  id: string
  name: string
  category: string
  roadAddress: string
  address: string
  phone: string
  x: string
  y: string
  distance: string
  visitorReviewCount: number | null
  blogReviewCount: number | null
  visitorReviewScore: number | null
  imageUrl: string | null
  imageUrls: string[]
  microReview: string | null
  naverMapUrl: string
}

export interface ProductionPlacesFile {
  generatedAt: string
  meta: {
    totalCount: number
    cached: boolean
    ratingNotice: string
  }
  documents: NaverPlaceDocument[]
}

export interface ProductionReviewsFile {
  generatedAt: string
  places: Record<string, { placeName: string; reviews: string[] }>
}

export const MENU_CATEGORIES = [
  '밥류',
  '면류',
  '국·탕류',
  '찌개·전골류',
  '고기·구이류',
  '볶음·찜류',
  '튀김류',
  '분식류',
  '만두류',
  '전·부침류',
  '피자류',
  '빵·샌드위치류',
  '샐러드류',
  '해산물류',
  '디저트류',
  '음료류',
  '주류',
  '세트·기타',
] as const

export type MenuCategory = (typeof MENU_CATEGORIES)[number]

export const MENU_CUISINES = [
  '한식',
  '중식',
  '일식',
  '양식',
  '동남아식',
  '카페·디저트',
  '기타',
] as const

export type MenuCuisine = (typeof MENU_CUISINES)[number]

export interface NaverMenuItem {
  name: string
  price: number | null
  priceType: string | null
  description: string | null
  imageUrl: string | null
  recommended: boolean
  category: MenuCategory
  cuisine: MenuCuisine
}

export type UnclassifiedNaverMenuItem = Omit<NaverMenuItem, 'category' | 'cuisine'>

export interface NaverPlaceMenus {
  placeName: string
  menus: NaverMenuItem[]
  menuImageAvailable: boolean
}

export interface ProductionMenusFile {
  generatedAt: string
  meta: {
    placeCount: number
    placesWithMenus: number
    totalMenuCount: number
    notice: string
  }
  places: Record<string, NaverPlaceMenus>
}
