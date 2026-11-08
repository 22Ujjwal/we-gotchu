import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { ArrowUp } from '#/components/hostwell/icons'
import {
  Button,
  FeatureRow,
  Guests,
  Header,
  MetaLine,
  Photo,
} from '#/components/hostwell/ui'
import { to24h, venues } from '#/lib/hostwell/fixture'
import type { Venue } from '#/lib/hostwell/fixture'
import { useHostwell } from '#/lib/hostwell/store'

export const Route = createFileRoute('/settings/')({ component: SettingsPage })

const suggestions = ['Cheaper candles', 'Closer to U-Bahn', 'More venues']

function SettingsPage() {
  const { brief } = useHostwell()
  const navigate = useNavigate()
  const featured = 1
  const [ask, setAsk] = useState('')

  const n = venues.length
  const at = (i: number) => venues[(i + n) % n]
  const prev = at(featured - 1)
  const current = at(featured)
  const next = at(featured + 1)
  const choose = (venueId: string) =>
    navigate({ to: '/settings/$venueId', params: { venueId } })

  return (
    <div className="flex min-h-screen flex-col">
      <Header step="setting" />
      <main className="flex flex-col items-center gap-10 px-6 pt-10 pb-14 md:px-12">
        <div className="flex flex-col items-center gap-3.5 text-center">
          <h1 className="m-0 font-script text-[36px] leading-[52px] font-normal md:text-[46px] md:leading-16">
            {brief.occasion}
          </h1>
          <MetaLine>
            <span>
              {brief.date}, {to24h(brief.from)}
            </span>
            <span>Berlin</span>
            <Guests n={brief.guests} />
            <span>≤ {brief.budget}</span>
            <Link to="/" className="underline decoration-1 [text-underline-position:from-font]">
              Edit brief
            </Link>
          </MetaLine>
        </div>

        <section
          aria-label="Suggested venues"
          className="flex flex-col items-center gap-8 pt-2 lg:flex-row lg:gap-12"
        >
          <SideCard venue={prev} onSelect={() => choose(prev.id)} />
          <div
            key={current.id}
            className="gold-frame rise flex w-full max-w-[468px] shrink-0 p-0.5 shadow-[0_24px_56px_#966E1E2E]"
          >
            <article className="flex w-full flex-col overflow-hidden bg-white">
              <Photo
                photos={current.photos}
                alt={current.name}
                className="h-[290px] w-full"
              />
              <div className="flex flex-col gap-[22px] p-[34px]">
                <CardTitle venue={current} large />
                <ul className="m-0 flex list-none flex-col gap-[18px] p-0 pt-1.5">
                  {current.cardFeatures.map((f) => (
                    <FeatureRow key={f.label} feature={f} />
                  ))}
                </ul>
                <Button
                  type="button"
                  onClick={() => choose(current.id)}
                  className="mt-2 py-[15px] text-[17px] leading-[22px]"
                >
                  Choose this setting
                </Button>
              </div>
            </article>
          </div>
          <SideCard venue={next} onSelect={() => choose(next.id)} />
        </section>

        <form
          onSubmit={(e) => e.preventDefault()}
          className="flex w-full max-w-[760px] flex-col gap-3"
        >
          <div className="flex items-center gap-3 border border-line-strong bg-white py-3 pr-3 pl-6 shadow-[0_10px_30px_#1F1B1612,0_1px_2px_#1F1B160D] focus-within:border-ink">
            <input
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              placeholder="Ask for changes before you approve…"
              aria-label="Ask for changes"
              className="min-w-0 flex-1 bg-transparent text-[17px] leading-6 text-ink outline-none placeholder:text-[#4A4339]"
            />
            <button
              type="submit"
              aria-label="Send"
              className="flex size-10 shrink-0 cursor-pointer items-center justify-center bg-ink hover:opacity-90"
            >
              <ArrowUp />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setAsk(s)}
                className="cursor-pointer border border-cream-line bg-cream px-3 py-1.5 text-[14px] leading-[18px] font-medium text-brass hover:border-brass"
              >
                {s}
              </button>
            ))}
          </div>
        </form>
      </main>
    </div>
  )
}

function CardTitle({ venue, large }: { venue: Venue; large?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2
        className={`m-0 font-semibold ${large ? 'text-[26px] leading-8' : 'text-[22px] leading-7'}`}
      >
        {venue.name}
      </h2>
      <span
        className={`shrink-0 font-mono font-medium tracking-[-0.01em] text-stone ${large ? 'text-[24px] leading-[30px]' : 'text-[20px] leading-6'}`}
      >
        €{venue.total.toFixed(2)}
      </span>
    </div>
  )
}

function SideCard({ venue, onSelect }: { venue: Venue; onSelect: () => void }) {
  return (
    <article className="flex w-full max-w-[340px] shrink-0 flex-col overflow-hidden border border-line bg-white shadow-[0_12px_32px_#1F1B160F]">
      <Photo
        key={venue.id}
        photos={venue.photos}
        alt={venue.name}
        className="h-[210px] w-full"
        arrows={false}
      />
      <div className="flex flex-col gap-5 px-8 pt-8 pb-10">
        <CardTitle venue={venue} />
        <ul className="m-0 flex list-none flex-col gap-[18px] p-0 pt-1.5">
          {venue.cardFeatures.map((f) => (
            <FeatureRow key={f.label} feature={f} />
          ))}
        </ul>
        <button
          type="button"
          onClick={onSelect}
          aria-label={`Choose ${venue.name}`}
          className="flex cursor-pointer items-center justify-center border border-line-strong bg-white py-[13px] text-[16px] leading-5 font-semibold text-body transition-colors hover:border-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          Choose this setting
        </button>
      </div>
    </article>
  )
}
