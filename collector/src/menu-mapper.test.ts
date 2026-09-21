import assert from 'node:assert/strict'

import { parseMenuPrice, parseNaverMenus } from './menu-mapper'

assert.equal(parseMenuPrice('10,000원'), 10_000)
assert.equal(parseMenuPrice(12_000), 12_000)
assert.equal(parseMenuPrice('10,000~14,000'), null)
assert.equal(parseMenuPrice('10,000-14,000'), null)
assert.equal(parseMenuPrice('10,000원 / 포장 9,000원'), null)
assert.equal(parseMenuPrice('1.5만원'), null)
assert.equal(parseMenuPrice('10,000원', 'dynamic'), null)
assert.equal(parseMenuPrice('무료', 'free'), null)
assert.equal(parseMenuPrice('1,000,001원'), null)

assert.deepEqual(
  parseNaverMenus([{ name: '범위 메뉴', price: '10,000~14,000', priceType: 'amountRange' }]),
  [
    {
      name: '범위 메뉴',
      price: null,
      priceType: 'amountRange',
      description: null,
      imageUrl: null,
      recommended: false,
    },
  ],
)

console.log('Menu price parser tests passed.')
