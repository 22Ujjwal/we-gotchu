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

const berlinVenues: Array<Venue> = [
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
    id: 'brownhouse-studio',
    name: 'Brownhouse Studio',
    neighbourhood: 'Kreuzberg',
    photo: '/venues/brownhouse-studio.jpg',
    photos: [1, 2, 3, 4].map((i) =>
      i === 1 ? '/venues/brownhouse-studio.jpg' : `/venues/brownhouse-studio-${i}.jpg`,
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
      item: 'Brownhouse Studio',
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

export const VAT_RATE = 0.19

const round2 = (n: number) => Math.round(n * 100) / 100
const candlesGross = baseLines.reduce(
  (s, l) => s + (typeof l.amount === 'number' ? l.amount : 0),
  0,
)

/** Tax on the venue and candles, for cities that add sales tax on top. */
const salesTax = (amount: number, rate: number) => round2((amount + candlesGross) * rate)

/** A demo venue with four photos at /venues/<id>.jpg, <id>-2.jpg … <id>-4.jpg. */
function venue(
  v: Omit<Venue, 'photo' | 'photos' | 'total' | 'venueLine'> & { amount: number; room: string },
): Venue {
  const { amount, room, ...rest } = v
  const photos = [1, 2, 3, 4].map((i) =>
    i === 1 ? `/venues/${v.id}.jpg` : `/venues/${v.id}-${i}.jpg`,
  )
  return {
    ...rest,
    photo: photos[0],
    photos,
    total: round2(amount + candlesGross + v.vat),
    venueLine: {
      qty: 1,
      item: v.name,
      amount,
      notes: ['Sat 12 Dec, 19:00–23:00', room],
      noteAmount: 'incl.',
    },
  }
}

const SF_TAX = 0.08625
const BERKELEY_TAX = 0.1025
const SAN_JOSE_TAX = 0.09375

const sanFranciscoVenues: Array<Venue> = [
  venue({
    id: 'the-interval',
    name: 'The Interval',
    neighbourhood: 'Fort Mason',
    amount: 780,
    vat: salesTax(780, SF_TAX),
    room: 'Private room and booths',
    cardFeatures: [
      { icon: 'guests', label: 'Seats 30, private room' },
      { icon: 'calendar', label: 'Free cancellation until 3 Dec' },
    ],
    description:
      'The Long Now Foundation’s bar and café at Fort Mason. Books climb two floors to the ceiling, a prototype of the 10,000-year clock’s chime generator hangs over the bar, and groups get the private room with the booths next to it.',
    detailFeatures: [
      { icon: 'guests', label: 'Seats 30' },
      { icon: 'calendar', label: 'Free cancellation until 3 Dec' },
      { icon: 'train', label: '5 min from the Muni 28 at Fort Mason' },
    ],
    freeCancellationUntil: '03 Dec 23:59',
  }),
  venue({
    id: 'foreign-cinema',
    name: 'Foreign Cinema',
    neighbourhood: 'Mission',
    amount: 840,
    vat: salesTax(840, SF_TAX),
    room: 'Mezzanine, 4 tables',
    cardFeatures: [
      { icon: 'guests', label: 'Seats 30 on the mezzanine' },
      { icon: 'flame', label: 'Heated courtyard' },
      { icon: 'calendar', label: 'Free cancellation until 5 Dec' },
    ],
    description:
      'A Mission Street restaurant that projects a film onto its courtyard wall every night. Californian cooking from what is in season, an oyster bar, and a mezzanine over the dining room that works as a semi-private space for a group.',
    detailFeatures: [
      { icon: 'guests', label: 'Seats 30' },
      { icon: 'flame', label: 'Heated courtyard' },
      { icon: 'train', label: '5 min from 24th St Mission BART' },
    ],
    freeCancellationUntil: '05 Dec 23:59',
  }),
  venue({
    id: 'flour-and-water',
    name: 'Flour + Water',
    neighbourhood: 'Mission',
    amount: 860,
    vat: salesTax(860, SF_TAX),
    room: 'Upstairs private room',
    cardFeatures: [
      { icon: 'guests', label: 'Seats 24 upstairs' },
      { icon: 'fee', label: '$10 fee after 1 Dec' },
    ],
    description:
      'Handmade pasta and wood-fired pizza at Harrison and 20th, with the pasta rolled in the kitchen every afternoon. Groups take the light-filled private room on the second floor.',
    detailFeatures: [
      { icon: 'guests', label: 'Seats 24' },
      { icon: 'leaf', label: 'Pasta made in house' },
      { icon: 'train', label: '8 min from 24th St Mission BART' },
    ],
    freeCancellationUntil: '01 Dec 23:59',
  }),
]

const berkeleyVenues: Array<Venue> = [
  venue({
    id: 'chez-panisse',
    name: 'Chez Panisse',
    neighbourhood: 'North Berkeley',
    amount: 880,
    vat: salesTax(880, BERKELEY_TAX),
    room: 'Downstairs dining room',
    cardFeatures: [
      { icon: 'guests', label: 'Seats 50 downstairs' },
      { icon: 'calendar', label: 'Free cancellation until 28 Nov' },
    ],
    description:
      'Alice Waters’ restaurant on Shattuck Avenue, cooking from Northern California farms since 1971. The downstairs dining room takes private dinners with a set menu built around what came in that morning.',
    detailFeatures: [
      { icon: 'guests', label: 'Seats 50' },
      { icon: 'leaf', label: 'Set menu from local farms' },
      { icon: 'train', label: '15 min from Downtown Berkeley BART' },
    ],
    freeCancellationUntil: '28 Nov 23:59',
  }),
  venue({
    id: 'comal',
    name: 'Comal',
    neighbourhood: 'Downtown Berkeley',
    amount: 720,
    vat: salesTax(720, BERKELEY_TAX),
    room: 'Abajo, private dining room',
    cardFeatures: [
      { icon: 'guests', label: 'Seats 24, private room' },
      { icon: 'leaf', label: 'Family-style menu' },
      { icon: 'calendar', label: 'Free cancellation until 5 Dec' },
    ],
    description:
      'Oaxacan-inspired cooking and a long mezcal list on Shattuck Avenue, with a garden patio out back. Abajo, the private room downstairs, seats 24 at one long table with a family-style menu.',
    detailFeatures: [
      { icon: 'guests', label: 'Seats 24' },
      { icon: 'leaf', label: 'Family-style menu' },
      { icon: 'train', label: '2 min from Downtown Berkeley BART' },
    ],
    freeCancellationUntil: '05 Dec 23:59',
  }),
  venue({
    id: 'fieldwork-brewing',
    name: 'Fieldwork Brewing',
    neighbourhood: 'West Berkeley',
    amount: 640,
    vat: salesTax(640, BERKELEY_TAX),
    room: 'Taproom, 4 long tables',
    cardFeatures: [
      { icon: 'guests', label: 'Seats 40' },
      { icon: 'calendar', label: 'Free cancellation until 1 Dec' },
    ],
    description:
      'Fieldwork’s original taproom in a West Berkeley warehouse on Sixth Street. Long wooden tables in front of the fermentation tanks, beer brewed a few metres away and a patio outside.',
    detailFeatures: [
      { icon: 'guests', label: 'Seats 40' },
      { icon: 'leaf', label: 'Beer brewed on site' },
      { icon: 'calendar', label: 'Free cancellation until 1 Dec' },
    ],
    freeCancellationUntil: '01 Dec 23:59',
  }),
]

const sanJoseVenues: Array<Venue> = [
  venue({
    id: 'original-joes',
    name: 'Original Joe’s',
    neighbourhood: 'Downtown',
    amount: 760,
    vat: salesTax(760, SAN_JOSE_TAX),
    room: 'The Hideout, private room',
    cardFeatures: [
      { icon: 'guests', label: 'Seats 40, private room' },
      { icon: 'calendar', label: 'Free cancellation until 28 Nov' },
    ],
    description:
      'Downtown San Jose’s Italian-American dining room since 1956: red leather booths, steaks off an open grill and waiters in white jackets. Big tables go to the Hideout, its private banquet room.',
    detailFeatures: [
      { icon: 'guests', label: 'Seats 40' },
      { icon: 'flame', label: 'Open grill' },
      { icon: 'train', label: '2 min from San Antonio light rail' },
    ],
    freeCancellationUntil: '28 Nov 23:59',
  }),
  venue({
    id: 'il-fornaio',
    name: 'Il Fornaio',
    neighbourhood: 'Downtown',
    amount: 690,
    vat: salesTax(690, SAN_JOSE_TAX),
    room: 'The Baker’s Room',
    cardFeatures: [
      { icon: 'guests', label: 'Seats 26, private room' },
      { icon: 'leaf', label: 'Bread baked in house' },
      { icon: 'calendar', label: 'Free cancellation until 5 Dec' },
    ],
    description:
      'An Italian restaurant and bakery on the ground floor of a 1926 hotel, across from Plaza de César Chávez. Tall windows, white tablecloths, bread from its own ovens, and the Baker’s Room for a private dinner.',
    detailFeatures: [
      { icon: 'guests', label: 'Seats 26' },
      { icon: 'leaf', label: 'Bread baked in house' },
      { icon: 'train', label: '3 min from Convention Center light rail' },
    ],
    freeCancellationUntil: '05 Dec 23:59',
  }),
  venue({
    id: 'meso',
    name: 'Meso',
    neighbourhood: 'Santana Row',
    amount: 740,
    vat: salesTax(740, SAN_JOSE_TAX),
    room: 'The Cypress Room',
    cardFeatures: [
      { icon: 'guests', label: 'Seats 25, private room' },
      { icon: 'fee', label: '$10 fee after 1 Dec' },
    ],
    description:
      'Modern Mediterranean at Santana Row, with blue tiles, brass lanterns and olive trees indoors. Mezze to share, fish from the grill, and the Cypress Room for a private dinner.',
    detailFeatures: [
      { icon: 'guests', label: 'Seats 25' },
      { icon: 'leaf', label: 'Mezze to share' },
      { icon: 'calendar', label: 'Free cancellation until 1 Dec' },
    ],
    freeCancellationUntil: '01 Dec 23:59',
  }),
]

const munichVenues: Array<Venue> = [
  venue({
    id: 'prinz-myshkin',
    name: 'Prinz Myshkin',
    neighbourhood: 'Altstadt',
    amount: 610,
    vat: 56.4,
    room: 'Back room, 3 tables',
    cardFeatures: [
      { icon: 'guests', label: 'Seats 28' },
      { icon: 'leaf', label: 'All vegetarian' },
    ],
    description:
      'Munich’s vegetarian restaurant since 1984, under the white vaulted ceilings of an old Altstadt house off Sendlinger Straße. Vegetarian and vegan plates, a long cake counter, and a back room for groups.',
    detailFeatures: [
      { icon: 'guests', label: 'Seats 28' },
      { icon: 'leaf', label: 'All vegetarian' },
      { icon: 'train', label: '5 min from Sendlinger Tor' },
    ],
    freeCancellationUntil: '01 Dec 23:59',
  }),
  venue({
    id: 'giesinger-braeu',
    name: 'Giesinger Bräu',
    neighbourhood: 'Obergiesing',
    amount: 690,
    vat: 62.1,
    room: 'Bräustüberl, 4 tables',
    cardFeatures: [
      { icon: 'guests', label: 'Seats 50, private area' },
      { icon: 'flame', label: 'Heated' },
      { icon: 'calendar', label: 'Free cancellation until 5 Dec' },
    ],
    description:
      'Giesing’s own brewery, a few minutes from the Grünwalder Stadion. The Bräustüberl sits right next to the brew kettles, with long tables, beer straight from the tanks and Bavarian cooking for groups.',
    detailFeatures: [
      { icon: 'guests', label: 'Seats 50' },
      { icon: 'flame', label: 'Heated' },
      { icon: 'train', label: '4 min from Silberhornstraße' },
    ],
    freeCancellationUntil: '05 Dec 23:59',
  }),
  venue({
    id: 'weisses-braeuhaus',
    name: 'Weisses Bräuhaus',
    neighbourhood: 'Altstadt',
    amount: 740,
    vat: 68.5,
    room: 'Upstairs room, 5 tables',
    cardFeatures: [
      { icon: 'guests', label: 'Seats 40 upstairs' },
      { icon: 'calendar', label: 'Free cancellation until 28 Nov' },
    ],
    description:
      'Schneider Weisse’s tavern in the Tal, a short walk from Marienplatz. Wood panelling, wheat beer from the barrel and its own butcher’s kitchen, with rooms upstairs for groups who want to stay late.',
    detailFeatures: [
      { icon: 'guests', label: 'Seats 40' },
      { icon: 'flame', label: 'Heated' },
      { icon: 'train', label: '3 min from Marienplatz' },
    ],
    freeCancellationUntil: '28 Nov 23:59',
  }),
]

export type City = {
  id: string
  name: string
  timezone: string
  /** What the brief's area can say to land here: the city, nicknames and neighbourhoods. */
  aliases: Array<string>
  /** Nearest public transport, for the "Closer to …" suggestion. */
  transit: string
  taxLabel: string
  /** Applied to add-on prices, which are shown tax included. */
  taxRate: number
  /** Side, picked for you, side. */
  venues: Array<Venue>
}

export const cities: Array<City> = [
  {
    id: 'berlin',
    name: 'Berlin',
    timezone: 'Europe/Berlin',
    aliases: ['berlin', 'kreuzberg', 'neukolln', 'neukoelln', 'friedrichshain', 'mitte', 'prenzlauer berg', 'schoneberg', 'wedding', 'charlottenburg', 'tempelhof', 'gleisdreieck'],
    transit: 'U-Bahn',
    taxLabel: 'VAT',
    taxRate: VAT_RATE,
    venues: berlinVenues,
  },
  {
    id: 'san-francisco',
    name: 'San Francisco',
    timezone: 'America/Los_Angeles',
    aliases: ['san francisco', 'sf', 'frisco', 'mission', 'mission district', 'soma', 'hayes valley', 'marina', 'fort mason', 'castro', 'noe valley', 'north beach', 'dogpatch', 'nopa', 'haight', 'bernal heights', 'potrero hill'],
    transit: 'BART',
    taxLabel: 'Sales tax',
    taxRate: SF_TAX,
    venues: sanFranciscoVenues,
  },
  {
    id: 'berkeley',
    name: 'Berkeley',
    timezone: 'America/Los_Angeles',
    aliases: ['berkeley', 'north berkeley', 'west berkeley', 'downtown berkeley', 'gourmet ghetto', 'elmwood', 'uc berkeley'],
    transit: 'BART',
    taxLabel: 'Sales tax',
    taxRate: BERKELEY_TAX,
    venues: berkeleyVenues,
  },
  {
    id: 'san-jose',
    name: 'San Jose',
    timezone: 'America/Los_Angeles',
    aliases: ['san jose', 'sj', 'downtown san jose', 'santana row', 'willow glen', 'sofa district', 'silicon valley'],
    transit: 'light rail',
    taxLabel: 'Sales tax',
    taxRate: SAN_JOSE_TAX,
    venues: sanJoseVenues,
  },
  {
    id: 'munich',
    name: 'Munich',
    timezone: 'Europe/Berlin',
    aliases: ['munich', 'munchen', 'muenchen', 'schwabing', 'maxvorstadt', 'giesing', 'obergiesing', 'haidhausen', 'glockenbachviertel', 'isarvorstadt', 'sendling', 'marienplatz', 'bavaria', 'bayern'],
    transit: 'U-Bahn',
    taxLabel: 'VAT',
    taxRate: VAT_RATE,
    venues: munichVenues,
  },
]

export const venues: Array<Venue> = cities.flatMap((c) => c.venues)

const plain = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').toLowerCase()

/**
 * The demo city for whatever the brief's area says ("Mission", "SF",
 * "Schwabing, München"). The longest matching name wins; Berlin otherwise.
 */
export function cityForArea(area: string): City {
  const text = ` ${plain(area).replace(/[^a-z]+/g, ' ')} `
  let best: { city: City; length: number } | null = null
  for (const city of cities) {
    for (const alias of city.aliases) {
      if (text.includes(` ${alias} `) && alias.length > (best?.length ?? 0)) {
        best = { city, length: alias.length }
      }
    }
  }
  return best?.city ?? cities[0]
}

export function cityOfVenue(venueId: string): City | undefined {
  return cities.find((c) => c.venues.some((v) => v.id === venueId))
}

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
