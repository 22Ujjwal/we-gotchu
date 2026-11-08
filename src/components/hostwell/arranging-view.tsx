import { SealedEnvelope } from './icons'
import { Header } from './ui'

export type ArrangingItem = {
  /** What kind of thing it is, e.g. "Venue". */
  label: string
  title: string
  detail?: string
}

/**
 * Shown after paying while suppliers are still being booked. Nothing here
 * updates live: it sums up the request and says the email will follow.
 */
export function ArrangingView({ items, email, embedded = false, message = "You'll get an email as soon as it's all set." }: { items: Array<ArrangingItem>; email?: string | null; embedded?: boolean; message?: string }) {
  return (
    <div className={`flex flex-col ${embedded ? 'w-full' : 'min-h-screen'}`}>
      {!embedded && <Header step="party" />}
      <main className="flex flex-1 flex-col items-center gap-7 px-5 pt-11 pb-10 lg:gap-10 lg:px-12 lg:pt-[72px] lg:pb-16">
        <SealedEnvelope />
        <div className="flex flex-col items-center gap-1 text-center lg:gap-2.5">
          <h1 className="m-0 font-script text-[34px] leading-[48px] font-normal lg:text-[52px] lg:leading-[72px]">
            We're on it!
          </h1>
          <p className="m-0 font-body text-[16px] leading-[22px] text-receipt-muted lg:text-[18px] lg:leading-[26px]">
            {message}
          </p>
        </div>

        {items.length > 0 && (
          <ul className="m-0 flex w-full max-w-[460px] list-none flex-col border border-line bg-white px-5 py-1 lg:px-7 lg:py-2">
            {items.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-3.5 border-line-strong py-4 not-last:border-b not-last:border-dashed lg:gap-4 lg:py-[18px]"
              >
                <span className="w-16 shrink-0 pt-[3px] font-mono text-[14px] leading-[18px] text-brass lg:w-[72px]">
                  {item.label}
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[17px] leading-[22px] font-semibold">{item.title}</span>
                  {item.detail && (
                    <span className="font-body text-[16px] leading-5 text-receipt-muted">{item.detail}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="m-0 flex items-center gap-2.5 font-body text-[16px] leading-5 text-receipt-muted">
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden className="shrink-0">
            <rect x="2" y="4" width="16" height="12" fill="none" stroke="#1F1B16" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M2.5 4.8L10 11l7.5-6.2" fill="none" stroke="#1F1B16" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
          {email ? (
            <span>
              We'll write to <span className="font-medium text-ink">{email}</span>
            </span>
          ) : (
            <span>We'll write to you by email</span>
          )}
        </p>
      </main>
    </div>
  )
}
