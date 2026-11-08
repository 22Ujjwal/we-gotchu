import { readFileSync, existsSync } from 'node:fs'
import { expect, test } from 'vitest'
import { interiorInspiration } from './interior-inspiration'

test('the ordered fallback pool is stable and every asset has source and license evidence', () => {
  const pool = interiorInspiration('venue-a')
  expect(pool).toEqual(interiorInspiration('venue-a'))
  expect(pool.photos).toHaveLength(20)
  expect(new Set(pool.photos).size).toBe(20)
  const credits = JSON.parse(readFileSync('public/images/interior-inspiration/credits.json', 'utf8'))
  expect(credits).toHaveLength(20)
  for (let index = 0; index < pool.photos.length; index++) {
    const photo = pool.photos[index]
    expect(existsSync(`public${photo}`)).toBe(true)
    const number = Number(photo.match(/(\d+)\.jpg$/)![1])
    const next = Number(pool.photos[(index + 1) % 20].match(/(\d+)\.jpg$/)![1])
    expect(next).toBe(number % 20 + 1)
    const credit = credits.find((entry: { file: string }) => photo.endsWith(`/${entry.file}`))
    expect(credit.author.length).toBeGreaterThan(0)
    expect(credit.license).toMatch(/^CC (?:BY|BY-SA)|^CC0$/)
    expect(credit.source).toMatch(/^https:\/\/commons.wikimedia.org\//)
    const bytes = readFileSync(`public${photo}`)
    expect(bytes.subarray(0, 2).toString('hex')).toBe('ffd8')
  }
})
