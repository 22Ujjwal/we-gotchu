import { expect, test } from 'vitest'
import { cities, cityForArea, cityOfVenue } from './fixture'

test.each([
  ['Kreuzberg or Neukölln', 'berlin'],
  ['', 'berlin'],
  ['somewhere nice', 'berlin'],
  ['SF', 'san-francisco'],
  ['the Mission', 'san-francisco'],
  ['Hayes Valley, San Francisco', 'san-francisco'],
  ['North Berkeley', 'berkeley'],
  ['downtown San Jose', 'san-jose'],
  ['Santana Row', 'san-jose'],
  ['München', 'munich'],
  ['Schwabing, Munich', 'munich'],
  ['Obergiesing', 'munich'],
])('%j picks %s', (area, city) => {
  expect(cityForArea(area).id).toBe(city)
})

test('every city has three venues with four photos each', () => {
  for (const city of cities) {
    expect(city.venues).toHaveLength(3)
    for (const v of city.venues) {
      expect(v.photos).toHaveLength(4)
      expect(cityOfVenue(v.id)).toBe(city)
    }
  }
})

test('venue ids are unique across cities', () => {
  const ids = cities.flatMap((c) => c.venues.map((v) => v.id))
  expect(new Set(ids).size).toBe(ids.length)
})
