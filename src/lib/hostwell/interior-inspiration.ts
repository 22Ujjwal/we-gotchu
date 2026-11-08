// Local files avoid a second provider dependency. Credits and licenses ship beside them.
const photos = Array.from({ length: 20 }, (_, index) => `/images/interior-inspiration/${String(index + 1).padStart(2, '0')}.jpg`)

export function interiorInspiration(venueId: string) {
  // Stable across rerenders and reloads. Each venue starts at its own place in the pool.
  let offset = 0
  for (const character of venueId) offset = (offset * 31 + character.charCodeAt(0)) % photos.length
  return {
    photos: [...photos.slice(offset), ...photos.slice(0, offset)],
    alt: 'Illustrative indoor space',
    label: 'Illustrative photo',
    href: '/images/interior-inspiration/credits.html',
  }
}
