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
  occasion: "Franz's 30th birthday",
  guests: '24',
  date: 'Sat 12 Dec',
  from: '7pm',
  till: '11pm',
  area: 'Kreuzberg or Neukölln',
  budget: '€900',
  canLose: '€10',
  needs: 'table candles',
  vibe: '',
}

export type Feature = {
  icon: 'guests' | 'leaf' | 'calendar' | 'fee' | 'flame' | 'train'
  label: string
}

export type ReceiptLine = {
  qty: number
  item: string
  amount: number | 'incl.'
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
  total: number
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
    id: 'kiezgarten-loft',
    name: 'Kiezgarten Loft',
    neighbourhood: 'Neukölln',
    photo: '/venues/kiezgarten-loft.jpg',
    photos: [1, 2, 3, 4].map((i) =>
      i === 1 ? '/venues/kiezgarten-loft.jpg' : `/venues/kiezgarten-loft-${i}.jpg`,
    ),
    total: 768.2,
    cardFeatures: [
      { icon: 'guests', label: 'Seats 28' },
      { icon: 'fee', label: '€8 fee after 1 Dec' },
    ],
    description:
      'A converted factory floor wrapped around a courtyard garden, with tall steel windows, long oak tables and plenty of plants. Warm and loud in the best way.',
    detailFeatures: [
      { icon: 'guests', label: 'Seats 28' },
      { icon: 'leaf', label: 'Courtyard garden' },
      { icon: 'train', label: '6 min from Hermannplatz' },
    ],
    venueLine: {
      qty: 1,
      item: 'Kiezgarten Loft',
      amount: 650,
      notes: ['Sat 12 Dec, 19:00–23:00', 'Garden room, 3 tables'],
      noteAmount: 'incl.',
    },
    vat: 59.3,
    freeCancellationUntil: '01 Dec 23:59',
  },
  {
    id: 'spreeblick-terrace',
    name: 'Spreeblick Terrace',
    neighbourhood: 'Kreuzberg',
    photo: '/venues/spreeblick-terrace.jpg',
    photos: [1, 2, 3, 4].map((i) =>
      i === 1 ? '/venues/spreeblick-terrace.jpg' : `/venues/spreeblick-terrace-${i}.jpg`,
    ),
    total: 842.6,
    cardFeatures: [
      { icon: 'guests', label: 'Seats 30, rooftop' },
      { icon: 'leaf', label: 'Vegetarian menu' },
      { icon: 'calendar', label: 'Free cancellation until 5 Dec' },
    ],
    description:
      'A glass-roofed rooftop above the Spree with long communal tables, string lights and the TV tower in view. Heated through winter, with a small in-house kitchen that cooks for groups.',
    detailFeatures: [
      { icon: 'guests', label: 'Seats 30' },
      { icon: 'flame', label: 'Heated' },
      { icon: 'leaf', label: 'Vegetarian menu' },
      { icon: 'train', label: '4 min from Schlesisches Tor' },
    ],
    venueLine: {
      qty: 1,
      item: 'Spreeblick Terrace',
      amount: 720,
      notes: ['Sat 12 Dec, 19:00–23:00', 'Heaters, 4 tables'],
      noteAmount: 'incl.',
    },
    vat: 63.7,
    freeCancellationUntil: '05 Dec 23:59',
  },
  {
    id: 'hafenhalle-studio',
    name: 'Hafenhalle Studio',
    neighbourhood: 'Kreuzberg',
    photo: '/venues/hafenhalle-studio.jpg',
    photos: [1, 2, 3, 4].map((i) =>
      i === 1 ? '/venues/hafenhalle-studio.jpg' : `/venues/hafenhalle-studio-${i}.jpg`,
    ),
    total: 891,
    cardFeatures: [
      { icon: 'guests', label: 'Seats 40' },
      { icon: 'calendar', label: 'Free cancellation until 28 Nov' },
    ],
    description:
      'A bright former harbour workshop on the canal, with big industrial windows, concrete floors and a long open kitchen. Room to spread out and dance later.',
    detailFeatures: [
      { icon: 'guests', label: 'Seats 40' },
      { icon: 'flame', label: 'Heated' },
      { icon: 'train', label: '5 min from Görlitzer Bahnhof' },
    ],
    venueLine: {
      qty: 1,
      item: 'Hafenhalle Studio',
      amount: 760,
      notes: ['Sat 12 Dec, 19:00–23:00', 'Studio hall, 5 tables'],
      noteAmount: 'incl.',
    },
    vat: 72.1,
    freeCancellationUntil: '28 Nov 23:59',
  },
]

export type AddOn = {
  id: string
  label: string
  /** Gross price in EUR (VAT included). Null for free-text requests. */
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

export function eur(n: number) {
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
