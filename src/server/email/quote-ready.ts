import type { Brief, Plan } from '../../contracts'

// "Your quotes are in" email, sent once when a plan is approved, before Checkout.
// Server-only. Delivery goes through AgentMail; the recipient is the Clerk user.

export type QuoteReady = { customerId: string; eventId: string; approvalId: string; brief: Brief; plan: Plan }

export interface Notifications {
  /** Best effort: callers log failures and never block Checkout on them. */
  quoteReady(input: QuoteReady): Promise<void>
}

export type QuoteReadyEmail = { subject: string; text: string; html: string }

/** Amounts are minor units, so read the currency's decimal places from Intl. */
function formatMoney(amount: number, currency: string): string {
  try {
    const format = new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'code' })
    return format.format(amount / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2))
  } catch {
    return `${amount} minor units ${currency}`
  }
}

// Supplier names and the brief come from users and the web, so everything interpolated is escaped.
const esc = (v: string | number) =>
  String(v).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)

// Colors from the app theme (src/styles.css). Email clients ignore CSS variables, so they are inlined.
const c = { ink: '#1f1b16', body: '#3e3830', stone: '#8a8174', cream: '#faf4e6', creamLine: '#eaddbf', receipt: '#fffefa',
  receiptInk: '#2b2620', receiptMuted: '#6f6658', rule: '#cfc5b4', gold: '#c99a3b' }
const sans = "Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif"
const mono = "'Geist Mono', ui-monospace, Menlo, Consolas, monospace"
const script = "'Momo Signature', Georgia, 'Times New Roman', serif"

// Detail rows let the value wrap on phones; price rows keep the amount on one line.
function receiptRow(left: string, right: string, opts: { strong?: boolean; detail?: boolean } = {}) {
  const color = opts.detail ? c.receiptMuted : c.receiptInk
  const weight = opts.strong ? 700 : 400
  const size = opts.strong ? 17 : 14
  const cell = `font-family:${mono};font-size:${size}px;line-height:20px;color:${color};font-weight:${weight};vertical-align:top;`
  return `<tr>
<td style="padding:4px 0;${cell}${opts.detail ? 'width:64px;' : ''}">${left}</td>
<td align="right" style="padding:4px 0 4px 16px;${cell}${opts.detail ? '' : 'white-space:nowrap;'}">${right}</td>
</tr>`
}

const rule = `<tr><td colspan="2" style="padding:10px 0;"><div style="border-top:1px dashed ${c.rule};height:1px;line-height:1px;font-size:1px;">&nbsp;</div></td></tr>`

export function buildQuoteReadyEmail(input: QuoteReady, appUrl: string): QuoteReadyEmail {
  const { brief, plan, eventId } = input
  const when = new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: brief.timezone,
  }).format(new Date(brief.startsAt))
  const link = `${appUrl.replace(/\/$/, '')}/events/${encodeURIComponent(eventId)}`
  const items = plan.actions.map((a) => ({
    what: a.target === a.supplierName ? a.supplierName : `${a.supplierName}: ${a.target}`,
    price: formatMoney(a.maximumAmount, plan.currency),
  }))
  const total = formatMoney(plan.total, plan.currency)
  const count = plan.actions.length
  const subject = `We're done: your ${count} ${count === 1 ? 'quote is' : 'quotes are'} in`
  const intro = `We're done getting quotes for your ${brief.eventType}.`

  const text = [
    intro,
    '',
    `When: ${when}`,
    `Guests: ${brief.headcount}`,
    `Where: ${brief.location}`,
    '',
    ...items.map((i) => `- ${i.what}, ${i.price}`),
    '',
    `Total: ${total}`,
    '',
    `Review and pay: ${link}`,
    '',
    'Nothing is booked or charged until you pay.',
  ].join('\n')

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;800&family=Geist+Mono:wght@400;700&family=Momo+Signature&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${c.cream};">
<div style="display:none;max-height:0;overflow:hidden;">${esc(`${intro} Total ${total}.`)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c.cream};">
<tr><td align="center" style="padding:32px 16px 48px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">

<tr><td style="padding:0 4px 28px;font-family:${sans};font-size:18px;line-height:22px;font-weight:800;letter-spacing:-0.02em;color:${c.ink};">
<span style="color:${c.ink};">&#9650;</span>&nbsp;arrange
</td></tr>

<tr><td align="center" style="padding:0 4px 8px;font-family:${script};font-size:34px;line-height:46px;color:${c.ink};">Your quotes are&nbsp;in</td></tr>
<tr><td align="center" style="padding:0 4px 32px;font-family:${sans};font-size:17px;line-height:26px;color:${c.body};">${esc(intro)}</td></tr>

<tr><td style="background:${c.receipt};border:1px solid ${c.creamLine};border-radius:4px;padding:24px 20px 20px;box-shadow:0 8px 24px rgba(31,27,22,0.08);">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td colspan="2" align="center" style="padding:0 0 4px;font-family:${mono};font-size:13px;line-height:18px;letter-spacing:0.12em;color:${c.receiptMuted};">YOUR ${esc(brief.eventType.toUpperCase())}</td></tr>
${rule}
${receiptRow('When', esc(when), { detail: true })}
${receiptRow('Guests', esc(brief.headcount), { detail: true })}
${receiptRow('Where', esc(brief.location), { detail: true })}
${rule}
${items.map((i) => receiptRow(esc(i.what), esc(i.price))).join('\n')}
${rule}
${receiptRow('TOTAL', esc(total), { strong: true })}
<tr><td colspan="2" align="right" style="padding:18px 0 0;">
<span style="display:inline-block;border:2px solid ${c.gold};border-radius:4px;padding:3px 10px;font-family:${mono};font-size:13px;line-height:18px;font-weight:700;letter-spacing:0.14em;color:${c.gold};">QUOTED</span>
</td></tr>
</table>
</td></tr>

<tr><td align="center" style="padding:32px 4px 12px;">
<a href="${esc(link)}" style="display:inline-block;background:${c.ink};color:#ffffff;font-family:${sans};font-size:17px;line-height:22px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:999px;">Review and pay &rarr;</a>
</td></tr>
<tr><td align="center" style="padding:0 4px;font-family:${sans};font-size:14px;line-height:20px;color:${c.stone};">Nothing is booked or charged until you pay.</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`

  return { subject, text, html }
}

type Sender = { send(to: string, email: QuoteReadyEmail, idempotencyKey: string): Promise<void> }

export function createQuoteReadyNotifications(opts: {
  appUrl: string
  lookupEmail: (customerId: string) => Promise<string | null>
  sender: Sender
}): Notifications {
  return {
    async quoteReady(input) {
      const to = await opts.lookupEmail(input.customerId)
      if (!to) {
        console.info('[email] no address for customer; skipping quote-ready email', input.customerId)
        return
      }
      await opts.sender.send(to, buildQuoteReadyEmail(input, opts.appUrl), `${input.approvalId}:quote-ready`)
    },
  }
}

/** Real wiring, or null when AgentMail is not configured. */
export function createConfiguredNotifications(appUrl: string): Notifications | null {
  const apiKey = process.env.AGENTMAIL_API_KEY
  const inboxId = process.env.AGENTMAIL_INBOX_ID
  if (!apiKey || !inboxId) return null
  return createQuoteReadyNotifications({
    appUrl,
    async lookupEmail(customerId) {
      const { clerkClient } = await import('@clerk/tanstack-react-start/server')
      const user = await clerkClient().users.getUser(customerId)
      const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) ?? user.emailAddresses[0]
      return primary?.emailAddress ?? null
    },
    sender: {
      async send(to, email, idempotencyKey) {
        const { AgentMailClient } = await import('agentmail')
        const client = new AgentMailClient({ apiKey })
        await client.inboxes.messages.send(inboxId, { to, subject: email.subject, text: email.text, html: email.html }, { idempotencyKey })
      },
    },
  })
}
