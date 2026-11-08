import { useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowUp } from './icons'
import { Button, FeatureRow, Guests, Header, MetaLine, Photo } from './ui'
import { to24h } from '#/lib/hostwell/fixture'
import type { Brief, Venue } from '#/lib/hostwell/fixture'

const suggestions = ['Cheaper candles', 'Closer to U-Bahn', 'More venues']

/** The picked-for-you venue in the middle, the others either side. */
export function SettingsView({
  brief,
  featured: current,
  others,
  onChoose: choose,
  editBrief,
}: {
  brief: Brief
  featured: Venue
  others: Array<Venue>
  onChoose: (venueId: string) => void
  /** The "Edit brief" link. */
  editBrief: ReactNode
}) {
  const [ask, setAsk] = useState('')
  const [prev, next] = others

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip">
      <Header step="setting" />
      <main className="flex flex-col items-center gap-6 px-5 pt-8 pb-10 lg:gap-10 lg:px-12 lg:pt-10 lg:pb-14">
        <div className="flex flex-col items-center gap-2 text-center lg:gap-3.5">
          <h1 className="m-0 font-script text-[34px] leading-[48px] font-normal lg:text-[46px] lg:leading-16">
            {brief.occasion}
          </h1>
          <MetaLine>
            <span>
              {brief.date}, {to24h(brief.from)}
            </span>
            <span>{brief.area}</span>
            <Guests n={brief.guests} />
            <span>≤ ${brief.budget.replace(/^\$/, '')}</span>
            {editBrief}
          </MetaLine>
        </div>

        <section
          aria-label="Suggested venues"
          className="flex w-full flex-col items-center gap-5 lg:w-max lg:flex-row lg:gap-12 lg:pt-2"
        >
          {prev && <SideCard venue={prev} onSelect={() => choose(prev.id)} />}
          <div
            key={current.id}
            className="gold-frame rise order-first flex w-full max-w-[468px] shrink-0 lg:w-[468px] p-0.5 shadow-[0_24px_56px_#966E1E2E] lg:order-none"
          >
            <article className="flex w-full flex-col overflow-hidden bg-white">
              <Photo
                photos={current.photos}
                alt={current.name}
                className="h-[230px] w-full lg:h-[290px]"
              />
              <div className="flex flex-col gap-[18px] p-6 lg:gap-[22px] lg:p-[34px]">
                <CardTitle venue={current} large />
                <ul className="m-0 flex list-none flex-col gap-3.5 p-0 lg:gap-[18px] lg:pt-1.5">
                  {current.cardFeatures.map((f) => (
                    <FeatureRow key={f.label} feature={f} />
                  ))}
                </ul>
                <Button
                  type="button"
                  onClick={() => choose(current.id)}
                  className="py-[15px] text-[16px] leading-5 lg:mt-2 lg:text-[17px] lg:leading-[22px]"
                >
                  Choose this setting
                </Button>
              </div>
            </article>
          </div>
          {next && <SideCard venue={next} onSelect={() => choose(next.id)} />}
        </section>

        <form
          onSubmit={(e) => e.preventDefault()}
          className="flex w-full max-w-[760px] flex-col gap-2.5 pt-1 lg:gap-3 lg:pt-0"
        >
          <div className="flex items-center gap-3 border border-line-strong bg-white py-2.5 pr-2.5 pl-[18px] shadow lg:py-3 lg:pr-3 lg:pl-6-[0_10px_30px_#1F1B1612,0_1px_2px_#1F1B160D] focus-within:border-ink">
            <input
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              placeholder="Ask for changes before you approve…"
              aria-label="Ask for changes"
              className="min-w-0 flex-1 bg-transparent text-[16px] leading-5 lg:text-[17px] lg:leading-6 text-ink outline-none placeholder:text-[#4A4339]"
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
        className={`m-0 font-semibold ${large ? 'text-[22px] leading-7 lg:text-[26px] lg:leading-8' : 'text-[20px] leading-6 lg:text-[22px] lg:leading-7'}`}
      >
        {venue.name}
      </h2>
      <span
        className={`shrink-0 font-mono font-medium tracking-[-0.01em] text-stone ${large ? 'text-[18px] leading-[22px] lg:text-[24px] lg:leading-[30px]' : 'text-[17px] leading-[22px] lg:text-[20px] lg:leading-6'}`}
      >
        {venue.total === null ? 'Quote' : `$${venue.total.toFixed(2)}`}
      </span>
    </div>
  )
}

function SideCard({ venue, onSelect }: { venue: Venue; onSelect: () => void }) {
  return (
    <article className="flex w-full max-w-[468px] shrink-0 lg:w-[340px] lg:max-w-[340px] flex-col overflow-hidden border border-line bg-white shadow-[0_12px_32px_#1F1B160F]">
      <Photo
        key={venue.id}
        photos={venue.photos}
        alt={venue.name}
        className="h-[190px] w-full lg:h-[210px]"
        arrows={false}
      />
      <div className="flex flex-col gap-4 px-6 pt-[22px] pb-[26px] lg:gap-5 lg:px-8 lg:pt-8 lg:pb-10">
        <CardTitle venue={venue} />
        <ul className="m-0 flex list-none flex-col gap-3 p-0 lg:gap-[18px] lg:pt-1.5">
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
