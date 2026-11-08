import { z } from 'zod'

const text = z.string().trim().min(1)
const timestamp = z.iso.datetime({ offset: true })
const inputSchema = z.object({
  provider: z.enum(['luma', 'partiful']),
  title: text,
  description: text,
  startAt: timestamp,
  endAt: timestamp,
  timezone: text.refine(value => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true } catch { return false }
  }, 'Invalid IANA timezone'),
  publishAt: timestamp.optional(),
  location: z.discriminatedUnion('confirmed', [
    z.object({ confirmed: z.literal(false) }),
    z.object({ confirmed: z.literal(true), address: text }),
  ]),
})
export type InvitationInput = z.input<typeof inputSchema>
export type InvitationState = 'due' | 'future' | 'expired'
export interface PreparedInvitation {
  provider: InvitationInput['provider']
  state: InvitationState
  content: { title: string; description: string; startAt: string; endAt: string; timezone: string; location: string }
  location: InvitationInput['location']
  publishAt?: string
  handoff: { kind: 'manual'; url: 'https://partiful.com/create' } | null
}

/** Preparation is pure: the host's times are never moved and no provider is contacted. */
export function prepareInvitation(input: InvitationInput, now: Date): PreparedInvitation {
  const valid = inputSchema.parse(input)
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid current time')
  const start = Date.parse(valid.startAt)
  if (Date.parse(valid.endAt) <= start) throw new Error('End must follow start')
  if (valid.publishAt && Date.parse(valid.publishAt) >= start) throw new Error('Publication must precede start')
  return {
    provider: valid.provider,
    state: now.getTime() >= start ? 'expired' : valid.publishAt && Date.parse(valid.publishAt) > now.getTime() ? 'future' : 'due',
    content: {
      title: valid.title, description: valid.description, startAt: valid.startAt,
      endAt: valid.endAt, timezone: valid.timezone,
      location: valid.location.confirmed ? valid.location.address : 'Location pending',
    },
    location: valid.location,
    ...(valid.publishAt ? { publishAt: valid.publishAt } : {}),
    handoff: valid.provider === 'partiful' ? { kind: 'manual', url: 'https://partiful.com/create' } : null,
  }
}

export type InvitationFetcher = (url: string, init: RequestInit) => Promise<Response>
export type LumaCreationResult =
  | { status: 'created'; id: string; url: string | null }
  | { status: 'rejected'; httpStatus: number }
  | { status: 'unknown'; retrySafe: false }

const receiptSchema = z.object({
  id: z.string().regex(/^evt-[A-Za-z0-9_-]+$/),
  url: z.string().url().refine(value => {
    const url = new URL(value)
    return url.protocol === 'https:' && ['luma.com', 'lu.ma'].includes(url.hostname) &&
      !url.username && !url.password && !url.port && url.pathname !== '/'
  }).optional(),
})

/** Explicit account-scoped POST only. Callers must reconcile unknown outcomes before another attempt.
 * Official schema: https://docs.luma.com/reference/post_v1-events-create.md
 * Its success response contains only an id; never invent a public event link from that id.
 */
export async function createLumaInvitation(
  prepared: PreparedInvitation,
  key: string,
  fetcher: InvitationFetcher,
  clock: () => Date = () => new Date(),
): Promise<LumaCreationResult> {
  if (prepared.provider !== 'luma') throw new Error('Luma preparation required')
  if (!key.trim() || /[^\x20-\x7e]/.test(key)) throw new Error('Valid Luma account key required')
  // Revalidate content and scheduling at dispatch, rather than trusting an old state field.
  const current = prepareInvitation({
    provider: prepared.provider, ...prepared.content,
    location: prepared.location, publishAt: prepared.publishAt,
  }, clock())
  if (current.state !== 'due') throw new Error(`Invitation is ${current.state}`)
  const content = current.content
  const payload = {
    name: content.title,
    description_md: current.location.confirmed ? content.description : `${content.description}\n\nLocation pending`,
    start_at: content.startAt, end_at: content.endAt, timezone: content.timezone,
    visibility: 'private', ticket_types: [{ name: 'Standard', type: 'free' }],
    reminders_disabled: true, feedback_email: { enabled: false },
    ...(current.location.confirmed ? { geo_address_json: { type: 'manual', address: current.location.address } } : {}),
  }
  try {
    const response = await fetcher('https://public-api.luma.com/v1/events/create', {
      method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', 'x-luma-api-key': key.trim() },
      body: JSON.stringify(payload),
    })
    if (response.status >= 400 && response.status < 500 && response.status !== 408) return { status: 'rejected', httpStatus: response.status }
    if (!response.ok) return { status: 'unknown', retrySafe: false }
    const receipt = receiptSchema.safeParse(await response.json())
    if (!receipt.success) return { status: 'unknown', retrySafe: false }
    return { status: 'created', id: receipt.data.id, url: receipt.data.url ?? null }
  } catch {
    // Never expose provider bodies, key material, or network exception messages.
    return { status: 'unknown', retrySafe: false }
  }
}
