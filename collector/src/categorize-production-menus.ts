import { readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { applyManualMenuOverride } from './manual-menu-overrides'
import { classifyMenus } from './menu-classifier'
import { ProductionMenusFile, ProductionPlacesFile } from './types'

const dataDirectory = resolve(__dirname, '..', '..')
const placesFilePath = resolve(dataDirectory, 'places.production.json')
const menusFilePath = resolve(dataDirectory, 'menus.production.json')
const temporaryMenusFilePath = `${menusFilePath}.tmp`

async function main() {
  const places = JSON.parse(await readFile(placesFilePath, 'utf8')) as ProductionPlacesFile
  const menuData = JSON.parse(await readFile(menusFilePath, 'utf8')) as ProductionMenusFile

  places.documents.forEach((place) => {
    const placeMenus = menuData.places[place.id]
    if (!placeMenus) return

    const manualResult = applyManualMenuOverride(place.id, placeMenus.menus)
    placeMenus.menus = classifyMenus(manualResult.menus, {
      placeName: place.name,
      placeCategory: place.category,
    })
  })

  menuData.meta.totalMenuCount = Object.values(menuData.places).reduce(
    (total, place) => total + place.menus.length,
    0,
  )
  menuData.meta.placesWithMenus = Object.values(menuData.places).filter(
    (place) => place.menus.length > 0,
  ).length
  menuData.meta.notice =
    '네이버 플레이스 등록 정보와 수동 확인을 통해 수집한 메뉴이며 실제 메뉴는 다를 수 있습니다.'

  await writeFile(temporaryMenusFilePath, `${JSON.stringify(menuData, null, 2)}\n`, 'utf8')
  await rename(temporaryMenusFilePath, menusFilePath)
  console.log(`Categorized ${menuData.meta.totalMenuCount} menus.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
