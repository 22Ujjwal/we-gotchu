import type { ReactNode } from 'react'
import { to24h, type Brief } from '../../lib/hostwell/fixture'
import { Guests, MetaLine } from './ui'

export function EventHeading({ brief, editBrief }: { brief?: Brief; editBrief?: ReactNode }) {
  return <div className="flex flex-col items-center gap-2 text-center lg:gap-3.5">
    <h1 className="m-0 font-script text-[34px] leading-[48px] font-normal lg:text-[46px] lg:leading-16">
      {brief?.occasion || 'Your event options'}
    </h1>
    {brief && <MetaLine>
      <span>{brief.date}, {to24h(brief.from)}</span>
      <span>{brief.area}</span>
      <Guests n={brief.guests} />
      <span>Up to ${brief.budget.replace(/^\$/, '')}</span>
      {editBrief}
    </MetaLine>}
  </div>
}
