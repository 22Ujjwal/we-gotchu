// Demo fixture for the hostwell flow. Replace with the integration owner's
// versioned fixtures / EventSummary once the shared contract lands.

export type Brief = {
  occasion: string
  guests: string
  date: string
  from: string
  till: string
  area: string
  budget: string
  canLose: string
  needs: string
  vibe: string
}

export const defaultBrief: Brief = {
  occasion: '',
  guests: '',
  date: '',
  from: '',
  till: '',
  area: '',
  budget: '',
  canLose: '',
  needs: '',
  vibe: '',
}

export type Feature = {
  icon: 'guests' | 'leaf' | 'calendar' | 'fee' | 'flame' | 'train'
  label: string
}

export type ReceiptLine = {
  qty: number
  item: string
  amount: number | string
  notes?: Array<string>
  noteAmount?: string
}

export type Venue = {
  id: string
  name: string
  neighbourhood: string
  /** Cover photo; also photos[0]. */
  photo: string
  photos: Array<string>
  /** Null when the price is not known yet. */
  total: number | null
  cardFeatures: Array<Feature>
  description: string
  detailFeatures: Array<Feature>
  venueLine: ReceiptLine
  vat: number
  freeCancellationUntil: string
}

const candleLine: ReceiptLine = {
  qty: 24,
  item: 'Beeswax candle',
  amount: 52,
  notes: ['@ 2.17 · Kerzenhaus'],
}
const deliveryLine: ReceiptLine = { qty: 1, item: 'Delivery to venue', amount: 6.9 }

export const baseLines = [candleLine, deliveryLine]

export const venues: Array<Venue> = [
  {
    id: 'cafe-botanico',
    name: 'Café Botanico',
    neighbourhood: 'Neukölln',
    photo: '/venues/cafe-botanico.jpg',
    photos: [1, 2, 3, 4].map((i) =>
      i === 1 ? '/venues/cafe-botanico.jpg' : `/venues/cafe-botanico-${i}.jpg`,
    ),
    total: 768.2,
    cardFeatures: [
      { icon: 'guests', label: 'Seats 28' },
      { icon: 'fee', label: '$8 fee after 1 Dec' },
    ],
    description:
      'A small restaurant on Richardstraße with its own permaculture garden out back. The kitchen cooks seasonal plates from what grows there. Cosy, candlelit and a little hidden.',
    detailFeatures: [
      { icon: 'guests', label: 'Seats 28' },
      { icon: 'leaf', label: 'Own kitchen garden' },
      { icon: 'train', label: '5 min from Karl-Marx-Straße' },
    ],
    venueLine: {
      qty: 1,
      item: 'Café Botanico',
      amount: 650,
      notes: ['Sat 12 Dec, 19:00–23:00', 'Back room, 3 tables'],
      noteAmount: 'incl.',
    },
    vat: 59.3,
    freeCancellationUntil: '01 Dec 23:59',
  },
  {
    id: 'brlo-brwhouse',
    name: 'BRLO Brwhouse',
    neighbourhood: 'Kreuzberg',
    photo: '/venues/brlo-brwhouse.jpg',
    photos: [1, 2, 3, 4].map((i) =>
      i === 1 ? '/venues/brlo-brwhouse.jpg' : `/venues/brlo-brwhouse-${i}.jpg`,
    ),
    total: 842.6,
    cardFeatures: [
      { icon: 'guests', label: 'Seats 30, private area' },
      { icon: 'leaf', label: 'Vegetarian menu' },
      { icon: 'calendar', label: 'Free cancellation until 5 Dec' },
    ],
    description:
      'A brewery built from shipping containers at the edge of Park am Gleisdreieck. Long wooden tables next to the brew kettles, beer brewed on site and a vegetable-forward kitchen that cooks for groups.',
    detailFeatures: [
      { icon: 'guests', label: 'Seats 30' },
      { icon: 'flame', label: 'Heated' },
      { icon: 'leaf', label: 'Vegetarian menu' },
      { icon: 'train', label: '3 min from Gleisdreieck' },
    ],
    venueLine: {
      qty: 1,
      item: 'BRLO Brwhouse',
      amount: 720,
      notes: ['Sat 12 Dec, 19:00–23:00', 'Private area, 4 tables'],
      noteAmount: 'incl.',
    },
    vat: 63.7,
    freeCancellationUntil: '05 Dec 23:59',
  },
  {
    id: 'max-und-moritz',
    name: 'Max und Moritz',
    neighbourhood: 'Kreuzberg',
    photo: '/venues/max-und-moritz.jpg',
    photos: [1, 2, 3, 4].map((i) =>
      i === 1 ? '/venues/max-und-moritz.jpg' : `/venues/max-und-moritz-${i}.jpg`,
    ),
    total: 891,
    cardFeatures: [
      { icon: 'guests', label: 'Seats 40' },
      { icon: 'calendar', label: 'Free cancellation until 28 Nov' },
    ],
    description:
      'A Berlin tavern since 1902, with green-tiled walls, dark wood and candles on every table. Hearty Berlin cooking, and a big hall upstairs with room to spread out and dance later.',
    detailFeatures: [
      { icon: 'guests', label: 'Seats 40' },
      { icon: 'flame', label: 'Heated' },
      { icon: 'train', label: '2 min from Moritzplatz' },
    ],
    venueLine: {
      qty: 1,
      item: 'Max und Moritz',
      amount: 760,
      notes: ['Sat 12 Dec, 19:00–23:00', 'Upstairs hall, 5 tables'],
      noteAmount: 'incl.',
    },
    vat: 72.1,
    freeCancellationUntil: '28 Nov 23:59',
  },
]

export type AddOn = {
  id: string
  label: string
  /** Gross price in USD (VAT included). Null for free-text requests. */
  price: number | null
  included?: boolean
}

export const addOns: Array<AddOn> = [
  { id: 'candles', label: '24 beeswax table candles', price: 58.9, included: true },
  { id: 'flowers', label: 'Fresh flowers for the table', price: 45 },
  { id: 'speaker', label: 'Bluetooth speaker', price: 25 },
  { id: 'photographer', label: 'Photographer, 2 hours', price: 180 },
]

export const VAT_RATE = 0.19

export function usd(n: number) {
  return n.toFixed(2)
}

/** "7pm" → "19:00"; anything unrecognised is returned as typed. */
export function to24h(t: string) {
  const m = t.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i)
  if (!m) return t
  let h = Number(m[1])
  if (m[3]?.toLowerCase() === 'pm' && h < 12) h += 12
  if (m[3]?.toLowerCase() === 'am' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`
}
