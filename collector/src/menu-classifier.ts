import {
  MenuCategory,
  MenuCuisine,
  NaverMenuItem,
  UnclassifiedNaverMenuItem,
} from './types'

export type MenuClassificationContext = {
  placeName: string
  placeCategory: string
}

function normalized(value: string | null | undefined): string {
  return (value ?? '').normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ')
}

function defaultCuisine(context: MenuClassificationContext): MenuCuisine {
  const place = normalized(`${context.placeName} ${context.placeCategory}`)
  if (/중식|중국|중화|우육면|차이나/.test(place)) return '중식'
  if (/일식|일본|라멘|라면|호또|토리코코로|출구없는덮밥집/.test(place)) return '일식'
  if (/양식|이탈리아|피자|파스타|샌드위치|버거|맘스터치|스테이564/.test(place)) {
    return '양식'
  }
  if (/베트남|태국|동남아/.test(place)) return '동남아식'
  if (/카페|디저트|베이커리|커피/.test(place)) return '카페·디저트'
  return '한식'
}

function classifyCuisine(
  text: string,
  category: MenuCategory,
  context: MenuClassificationContext,
): MenuCuisine {
  const fallback = defaultCuisine(context)
  if (fallback === '한식' && /정식/.test(text)) return '한식'
  if (/쌀국수|팟타이|분짜|반미|똠얌|나시고랭|월남쌈|땡모반/.test(text)) return '동남아식'
  if (/파스타|스파게티|피자|스테이크|리조또|샐러드|버거|샌드위치|라자냐|알리오|까르보|아라비아따|고르곤졸라|마르게리따|에그베네딕트|오믈렛|오므라이스|도리아|블랙퍼스트|플래터|브런치/.test(text)) {
    return '양식'
  }
  if (/짜장|짬뽕|탕수육|깐풍|깐쇼|라조|양장피|팔보채|유산슬|마파|고추잡채|우육면|마라(?:탕|면|샹궈|우육)|샤오롱|사오롱|딤섬|유린기|춘권|훠궈|꿔바로우/.test(text)) {
    return '중식'
  }
  if (/라멘|소바|모밀|카츠|까스|가스|가라아게|사케동|돈부리|초밥|스시|오코노미|타코야키/.test(text)) {
    return '일식'
  }
  if (
    fallback === '카페·디저트' &&
    ['빵·샌드위치류', '디저트류', '음료류'].includes(category)
  ) {
    return '카페·디저트'
  }
  return fallback
}

function defaultCategory(context: MenuClassificationContext): MenuCategory {
  const place = normalized(`${context.placeName} ${context.placeCategory}`)
  if (/카페|커피/.test(place)) return '음료류'
  if (/베이커리/.test(place)) return '빵·샌드위치류'
  if (/피자/.test(place)) return '피자류'
  if (/샌드위치|버거|맘스터치/.test(place)) return '빵·샌드위치류'
  if (/떡볶이/.test(place)) return '분식류'
  if (/라멘|라면|냉면/.test(place)) return '면류'
  if (/감자탕|추어탕/.test(place)) return '국·탕류'
  if (/아귀찜|해물찜|주꾸미|닭갈비/.test(place)) return '볶음·찜류'
  if (/치킨|닭강정/.test(place)) return '튀김류'
  if (/갈비|불고기|정육|족발|보쌈|장어|고기/.test(place)) return '고기·구이류'
  return '세트·기타'
}

function classifyCategory(text: string, context: MenuClassificationContext): MenuCategory {
  if (/\+\s*(?:음료|스프)|음료\s*\/\s*스프/.test(text)) return '세트·기타'
  if (/소주|맥주|막걸리|청하|하이볼|와인|사케|복분자|생막걸리|화요|토닉 세트/.test(text)) return '주류'
  if (/아메리카노|에스프레소|카페라떼|카페 라떼|라떼|카푸치노|콜드브루|커피|아이스티|밀크티|블랙티|허브티|레몬티|에이드|주스|스무디|프라페|쉐이크|음료|미숫가루|붓기 쏙 차|콜라(?:\s|$|\()|사이다|땡모반|크러쉬|차파이/.test(text)) {
    return '음료류'
  }
  if (/케이크|타르트|빙수|아이스크림|마카롱|쿠키|브라우니|티라미수|아이스박스|요거트|포셋|푸딩|와플|크로플|카이막|떠먹는|레드벨벳|뉴욕치즈/.test(text)) {
    return '디저트류'
  }
  if (/샌드위치|싱글랩|웜랩|베이글|산도|소금빵|식빵|크루아상|토스트|바게트|브레드|핫도그|꽈배기|빵/.test(text)) {
    return '빵·샌드위치류'
  }
  if (/샐러드|포케/.test(text)) return '샐러드류'
  if (/피자|고르곤졸라|마르게리따|카프리쵸사|디아블라|깔쬬네/.test(text)) return '피자류'
  if (/밥|덮밥|볶음밥|비빔밥|알밥|오므라이스|도리아|리조또|필라프|돈부리|규동|가츠동|주먹밥|솥밥|보리밥|게알밥|도시락/.test(text)) {
    return '밥류'
  }
  if (/면|라멘|라면|파스타|스파게티|우동|국수|짬뽕|짜장|냉면|소바|모밀|칼국수|팟타이|쫄면|수제비|알리오올리오|까르보나라|아마트리치아나|아라비아따|라자냐|빠네|봉골레/.test(text)) {
    return '면류'
  }
  if (/카레/.test(text)) return '밥류'
  if (/찌개|전골|나베|청국장/.test(text)) return '찌개·전골류'
  if (/해장국|순대국|만두국|떡국|국밥|육개장|육계장|곰탕|설렁탕|갈비탕|추어탕|임자탕|장어탕|내장탕|해물탕|꽃게탕|동태탕|스프(?:\s|$|\()|탕(?:\s|$|\()|옹심이/.test(text)) {
    return '국·탕류'
  }
  if (/만두|사오롱바오|샤오롱바오|딤섬/.test(text)) return '만두류'
  if (/떡볶이|오뎅|어묵|떡사리|순대|라면사리|당면사리/.test(text)) return '분식류'
  if (/파전|감자전|감자채 전|해물전|도토리전|메밀전병|부침|계란말이|전(?:\s|$|\()/.test(text)) return '전·부침류'
  if (/치킨|닭강정|튀김|순살|윙|버팔로봉|까스|가스|카츠|가라아게|탕수|깐풍|깐쇼|라조기|춘권|지마구|사모사/.test(text)) {
    return '튀김류'
  }
  if (/볶음|찜|철판|닭갈비|쭈꾸미|주꾸미|두루치기|양장피|팔보채|유산슬|고추잡채|두부김치|골뱅이무침|닭발/.test(text)) return '볶음·찜류'
  if (/갈비|삼겹|목살|항정살|불고기|스테이크|장어|족발|보쌈|육회|고기|차돌|닭꼬치|염통꼬치|구이|카츠|편육|껍데기|살치살|등심|안심|채끝/.test(text)) {
    return '고기·구이류'
  }
  if (/게장|코다리|회|해산물|해물|아구|아귀|생선|고등어|갈치|임연수|굴비|문어|낙지|오징어/.test(text)) {
    return '해산물류'
  }
  if (/세트|플래터|블랙퍼스트|에그베네딕트|오믈렛|리뷰|이벤트|무료|주문|행사|상차림|초벌|추가메뉴|포장/.test(text)) {
    return '세트·기타'
  }
  if (/세상만사 감자탕/.test(normalized(context.placeName)) && /^(뼈추가|우거지|감자)$/.test(text)) {
    return '세트·기타'
  }
  return defaultCategory(context)
}

export function classifyMenu(
  menu: UnclassifiedNaverMenuItem,
  context: MenuClassificationContext,
): NaverMenuItem {
  const text = normalized(menu.name)
  const category = classifyCategory(text, context)
  return {
    ...menu,
    category,
    cuisine: classifyCuisine(text, category, context),
  }
}

export function classifyMenus(
  menus: UnclassifiedNaverMenuItem[],
  context: MenuClassificationContext,
): NaverMenuItem[] {
  return menus.map((menu) => classifyMenu(menu, context))
}
