import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import type { Feature } from '#/lib/hostwell/fixture'
import { useHostwell } from '#/lib/hostwell/store'
import { ArrowRight, Check, Chevron, FeatureIcon, Logo, Plus } from './icons'

export type Step = 'brief' | 'setting' | 'party'

const steps: Array<{ id: Step; label: string; to: string }> = [
  { id: 'brief', label: 'Brief', to: '/' },
  { id: 'setting', label: 'Pick a setting', to: '/settings' },
  { id: 'party', label: 'Party', to: '/party' },
]

export function Header({ step }: { step: Step }) {
  const current = steps.findIndex((s) => s.id === step)
  return (
    <header className="flex items-center justify-between gap-x-8 px-5 pt-6 lg:px-12 lg:pt-9">
      <Link to="/" className="flex items-center gap-2.5">
        <Logo />
        <span className="text-[18px] leading-[22px] font-extrabold tracking-[-0.02em]">
          arrange
        </span>
      </Link>
      <nav aria-label="Progress">
        <ol className="m-0 flex list-none items-center gap-5 p-0 text-[18px] leading-[22px] whitespace-nowrap lg:gap-8">
          {steps.map((s, i) => {
            if (i === current)
              return (
                <li
                  key={s.id}
                  aria-current="step"
                  className="font-script underline decoration-1 [text-underline-position:from-font]"
                >
                  {s.label}
                </li>
              )
            if (i < current && step !== 'party')
              return (
                <li key={s.id} className="hidden lg:list-item">
                  <Link
                    to={s.to}
                    className="text-muted line-through decoration-ink decoration-1 hover:text-ink"
                  >
                    {s.label}
                  </Link>
                </li>
              )
            return (
              <li
                key={s.id}
                className={`hidden text-muted lg:list-item ${
                  i < current ? 'line-through decoration-ink decoration-1' : ''
                }`}
              >
                {s.label}
              </li>
            )
          })}
        </ol>
      </nav>
    </header>
  )
}

export function Button({
  className = '',
  ...props
}: ComponentProps<'button'>) {
  return (
    <button
      {...props}
      className={`flex cursor-pointer items-center justify-center bg-ink font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    />
  )
}

export function MetaLine({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[14px] leading-[18px] font-semibold lg:gap-x-6">
      {children}
    </div>
  )
}

export function Guests({ n }: { n: string }) {
  return (
    <span className="font-normal text-sage">
      <span className="font-semibold text-ink">{n}</span> guests
    </span>
  )
}

export function FeatureRow({ feature }: { feature: Feature }) {
  return (
    <li className="flex items-center gap-2.5">
      <FeatureIcon icon={feature.icon} />
      <span className="font-body text-[16px] leading-5 tracking-[-0.005em] text-body">
        {feature.label}
      </span>
    </li>
  )
}

/**
 * Venue photo with an optional gallery: when given more than one photo it
 * shows prev/next arrows (cycling, wraps around) and position dots.
 */
export function Photo(props: {
  photos: Array<string>
  alt: string
  className?: string
  arrows?: boolean
}) {
  // Reset only when the actual source list changes, not on ordinary parent renders.
  return <PhotoCarousel key={JSON.stringify([props.alt, props.photos])} {...props} />
}

function PhotoCarousel({
  photos,
  alt,
  className = '',
  arrows = true,
}: {
  photos: Array<string>
  alt: string
  className?: string
  arrows?: boolean
}) {
  const [position, setPosition] = useState(0)
  const [failed, setFailed] = useState<Set<string>>(() => new Set())
  const usable = photos.filter(photo => !failed.has(photo))
  const n = usable.length
  const index = Math.min(position, n - 1)
  if (n === 0) return <div role="img" aria-label={`${alt}: Photo unavailable`}
    className={`shrink-0 bg-cream text-[14px] text-stone ${className}`}
    style={{ height: 'auto', minHeight: 0, aspectRatio: 'auto', padding: '20px 24px' }}>Photo unavailable</div>
  const go = (d: number) => setPosition((index + d + n) % n)
  const arrow =
    'absolute top-1/2 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center bg-white/85 hover:bg-white focus-visible:outline-2 focus-visible:outline-gold'
  return (
    <div
      role={n > 1 ? 'group' : undefined}
      aria-roledescription={n > 1 ? 'carousel' : undefined}
      aria-label={n > 1 ? `${alt} photos` : undefined}
      className={`relative shrink-0 overflow-hidden ${className}`}
    >
      <img
        key={usable[index]}
        src={usable[index]}
        onError={() => {
          const source = usable[index]
          setFailed(previous => new Set([...previous, source]))
          setPosition(index)
        }}
        alt={n > 1 ? `${alt}, photo ${index + 1} of ${n}` : alt}
        className="size-full object-cover"
      />
      {n > 1 && (
        <>
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-3.5 flex justify-center gap-1.5"
          >
            {usable.map((p, i) => (
              <span
                key={p}
                className={`size-2 rounded-full ${i === index ? 'bg-white' : 'bg-white/50'}`}
              />
            ))}
          </div>
          {arrows && (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Previous photo"
                className={`${arrow} left-3.5`}
              >
                <Chevron dir="left" />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Next photo"
                className={`${arrow} right-3.5`}
              >
                <Chevron dir="right" />
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}

const money = (n: number) => `$${n.toFixed(2)}`

/** Checklist of add-ons plus a free-text "something else" row. */
export function AddOnList({ boxed = false }: { boxed?: boolean }) {
  const { addOns, selected, toggleAddOn, addRequest } = useHostwell()
  const [draft, setDraft] = useState('')

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col">
        {addOns.map((a, i) => {
          const on = selected.has(a.id)
          const last = i === addOns.length - 1
          return (
            <li key={a.id}>
              <label
                className={`flex cursor-pointer items-center gap-4 pt-[13px] ${boxed && last ? 'pb-[22px]' : 'pb-[13px]'}`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleAddOn(a.id)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className={`flex size-[22px] shrink-0 items-center justify-center peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold ${on ? 'bg-ink' : 'border-[1.5px] border-sand'}`}
                >
                  {on && <Check />}
                </span>
                <span className="flex-1 font-body text-[17px] leading-[22px]">
                  {a.label}
                </span>
                <span className="font-mono text-[16px] leading-5 font-medium text-stone">
                  {a.price === null
                    ? 'Quote'
                    : a.included
                      ? money(a.price)
                      : `+${money(a.price)}`}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const v = draft.trim()
          if (!v) return
          addRequest(v)
          setDraft('')
        }}
        className={`flex items-center gap-4 ${
          boxed
            ? 'border-[1.5px] border-ink p-3.5 focus-within:shadow-[0_0_0_4px_#C99A3B40]'
            : 'py-[13px]'
        }`}
      >
        <span
          aria-hidden
          className="flex size-[22px] shrink-0 items-center justify-center border-[1.5px] border-dashed border-sand"
        >
          <Plus />
        </span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Something else? Type it here"
          aria-label="Add something else"
          className="min-w-0 flex-1 bg-transparent font-body text-[17px] leading-[22px] caret-ink outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          aria-label="Add request"
          className="shrink-0 cursor-pointer text-ink disabled:opacity-30"
          disabled={!draft.trim()}
        >
          <ArrowRight />
        </button>
      </form>
    </div>
  )
}
