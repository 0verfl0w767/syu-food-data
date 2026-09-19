import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import * as readline from 'node:readline'

import { NaverPlaceCollector } from './naver-place-collector'
import { sortNaverPlacesByDistance } from './place-mapper'
import {
  COLLECTION_RADIUS_METERS,
  isExcludedPlace,
  isPlaceWithinCollectionPolicy,
  REQUIRED_PLACE_IDS,
} from './place-policy'
import { NaverPlaceDocument, ProductionPlacesFile } from './types'

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

const collectorRoot = resolve(__dirname, '..')
const dataDirectory = resolve(collectorRoot, '..')
const placesFilePath = resolve(dataDirectory, 'places.production.json')
const temporaryPlacesFilePath = `${placesFilePath}.tmp`
const backGate = { x: 127.10926224864942, y: 37.64384622248226 }

async function readExistingPlaces(): Promise<NaverPlaceDocument[]> {
  try {
    const existing = JSON.parse(await readFile(placesFilePath, 'utf8')) as ProductionPlacesFile
    return Array.isArray(existing.documents) ? existing.documents : []
  } catch {
    return []
  }
}

async function main() {
  await mkdir(dataDirectory, { recursive: true })
  const existingPlaces = await readExistingPlaces()
  const collector = new NaverPlaceCollector()

  try {
    const search = { x: backGate.x, y: backGate.y, radius: COLLECTION_RADIUS_METERS }
    const foodPlaces = await collector.collect({ ...search, query: '음식점' })
    const cafePlaces = await collector.collect({ ...search, query: '카페' })
    const newlyCollectedPlaces = Array.from(
      [...foodPlaces, ...cafePlaces]
        .reduce((places, place) => {
          if (!places.has(place.id) && !isExcludedPlace(place)) {
            places.set(place.id, place)
          }
          return places
        }, new Map<string, (typeof foodPlaces)[number]>())
        .values(),
    )

    const newlyCollectedIds = new Set(newlyCollectedPlaces.map((p) => p.id))
    const missingPlaces = existingPlaces.filter(
      (place) =>
        !newlyCollectedIds.has(place.id) && isPlaceWithinCollectionPolicy(place),
    )

    const placesToRetain: NaverPlaceDocument[] = []
    if (missingPlaces.length > 0) {
      console.log(
        `\n[경고] 기존 매장 누락 감지: 기존 매장 중 ${missingPlaces.length}곳이 이번 네이버 검색 결과에 나타나지 않았습니다.`,
      )
      console.log(
        '  (네이버 검색 랭킹 변동, 일시적 API 누락, 좌표 미세 오차, 또는 실제 폐점일 수 있습니다.)\n',
      )

      const isInteractive = Boolean(process.stdin.isTTY)

      for (const missing of missingPlaces) {
        console.log(`  - [${missing.name}] (ID: ${missing.id}, 분류: ${missing.category})`)
        console.log(`    주소: ${missing.roadAddress || missing.address || '정보 없음'}`)

        let shouldDelete = false
        if (isInteractive) {
          const answer = await askQuestion('    정말로 삭제(폐점 반영)하시겠습니까? (y/N): ')
          shouldDelete = answer.trim().toLowerCase() === 'y'
        } else {
          console.log(
            '    [안내] 비대화형 환경(CI/자동 스크립트)이므로 안전을 위해 매장을 유지(보존)합니다.',
          )
        }

        if (shouldDelete) {
          console.log(`    [삭제] '${missing.name}' 매장을 삭제합니다.\n`)
        } else {
          console.log(`    [유지] '${missing.name}' 매장을 보존(유지)합니다.\n`)
          placesToRetain.push(missing)
        }
      }
    }

    const documents = sortNaverPlacesByDistance([...newlyCollectedPlaces, ...placesToRetain])
    const documentIds = new Set(documents.map((place) => place.id))
    const missingRequiredPlaceIds = [...REQUIRED_PLACE_IDS].filter((id) => !documentIds.has(id))
    if (missingRequiredPlaceIds.length > 0) {
      throw new Error(
        `Required places are missing: ${missingRequiredPlaceIds.join(', ')}. ` +
          'The existing collector file was not replaced.',
      )
    }

    const existingEligiblePlaceCount = existingPlaces.filter(isPlaceWithinCollectionPolicy).length
    const minimumPlaceCount = Math.max(10, Math.floor(existingEligiblePlaceCount * 0.7))
    if (documents.length < minimumPlaceCount) {
      throw new Error(
        `Collected only ${documents.length} places; expected at least ${minimumPlaceCount}. ` +
          'The existing collector file was not replaced.',
      )
    }

    const result: ProductionPlacesFile = {
      generatedAt: new Date().toISOString(),
      meta: {
        totalCount: documents.length,
        cached: true,
        ratingNotice: '네이버가 공개한 방문 만족도(별점)가 있는 매장만 점수를 제공합니다.',
      },
      documents,
    }
    await writeFile(temporaryPlacesFilePath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    await rename(temporaryPlacesFilePath, placesFilePath)
    console.log(
      `Saved ${documents.length} places (${foodPlaces.length} food search, ${cafePlaces.length} cafe search).`,
    )
  } finally {
    await collector.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
