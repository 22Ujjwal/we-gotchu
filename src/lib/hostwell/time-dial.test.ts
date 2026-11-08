import { expect, test } from 'vitest'
import { dialValueAtPoint, nearestDialRotation } from './time-dial'

test('hours follow clock positions and snap across twelve', () => {
  expect(dialValueAtPoint(0, -100, 12, 1)).toBe(0)
  expect(dialValueAtPoint(100, 0, 12, 1)).toBe(3)
  expect(dialValueAtPoint(0, 100, 12, 1)).toBe(6)
  expect(dialValueAtPoint(-100, 0, 12, 1)).toBe(9)
  expect(dialValueAtPoint(-1, -100, 12, 1)).toBe(0)
})

test('dragged minutes snap to five-minute increments, including midnight', () => {
  expect(dialValueAtPoint(100, 0, 60, 5)).toBe(15)
  expect(dialValueAtPoint(30, -100, 60, 5)).toBe(5)
  expect(dialValueAtPoint(-30, -100, 60, 5)).toBe(55)
  expect(dialValueAtPoint(-1, -100, 60, 5)).toBe(0)
})

test('rotation takes the short path across zero, in either direction and after repeated turns', () => {
  expect(nearestDialRotation(350, 10)).toBe(370)
  expect(nearestDialRotation(10, 350)).toBe(-10)
  expect(nearestDialRotation(710, 10)).toBe(730)
  expect(nearestDialRotation(-710, 350)).toBe(-730)
})
