import type { PlanningView } from '../../agent/planning/contract'
import { displayCopy, displayFactValue } from '../../lib/hostwell/display-copy'
import { ReceiptBarcode, ReceiptFrame, ReceiptRow, ReceiptRule } from './receipt'

/** Research facts are displayed as evidence, never parsed into a payable total. */
export function PlanningEstimate({ view }: { view: PlanningView }) {
  return <ReceiptFrame label="Event estimate">
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[18px] font-bold tracking-[0.22em]">ARRANGE</span>
      <span className="text-center text-receipt-muted">Event estimate{view.brief?.area ? ` · ${view.brief.area}` : ''}</span>
    </div>
    <ReceiptRule />
    <ReceiptRow left="ITEM" right="PRICE" muted />
    {view.selections.map(option => {
      const price = option.facts.find(fact => /price|cost|subtotal/i.test(fact.label))
      const quantity = option.facts.find(fact => /pack|quantity|size/i.test(fact.label))
      const name = displayCopy(option.name.replace(/\s*\(budget mismatch[^)]*\)/gi, ''))
      return <div key={option.id} className="flex flex-col gap-1">
        <span>{name}</span>
        <span className="text-right text-receipt-muted">{price ? displayFactValue(price.value) : 'Quote needed'}</span>
        {quantity && quantity !== price && <span className="text-receipt-muted">{displayFactValue(quantity.value)}</span>}
      </div>
    })}
    <ReceiptRule />
    <ReceiptRow left="Tax & delivery" right="To confirm" muted />
    <ReceiptRow left="Fees" right="To confirm" muted />
    <ReceiptRule solid />
    <div className="flex flex-wrap items-baseline justify-between gap-2 font-bold">
      <span className="text-[16px]">ESTIMATED TOTAL</span>
      <span className="text-[18px]">Quote needed</span>
    </div>
    <ReceiptRule solid />
    <ReceiptRow left="Cancellation" right="To confirm" muted />
    <ReceiptRule />
    <ReceiptBarcode reference={`PLAN ${view.id.slice(-8).toUpperCase()}`} />
  </ReceiptFrame>
}
