/** Presentation only: preserve saved provider evidence and identifiers. */
export const displayCopy = (text: string) => text.replace(/\s*—\s*/g, ', ')

/** Source provenance is already shown by the adjacent source link. */
export const displayFactLabel = (text: string) => displayCopy(text)
  .replace(/,\s*(?:official\s+)?(?:search excerpt|source excerpt|published source)\s*$/i, '')
  .replace(/^included duration and exclusions$/i, 'Time and extras')
  .replace(/ exception$/i, ' pricing')
  .trim()

/** Remove verbose phrasing, never numbers, exclusions or price qualifications. */
export const displayFactValue = (text: string) => displayCopy(text)
  .replace(/^Published general range:\s*/i, '')
  .replace(/above the (\$[\d,.]+) total budget/gi, 'over the $1 budget')
  .replace(/not applicable to ([^.;]+)/gi, '$1 excluded')
  .replace(/requires separate pricing/gi, 'quote needed')
  .replace(/no applicable event-date rental subtotal is known/gi, 'event price unknown')
  .replace(/including setup\/breakdown/gi, 'with setup/breakdown')
  .replace(/personnel/gi, 'staff')
  .replace(/are excluded, and extra time costs more/gi, 'and overtime cost extra')
  .replace(/quote needed; event price unknown/gi, 'quote needed')
  .replace(/ and taxes and overtime cost extra/gi, ', tax and overtime cost extra')
