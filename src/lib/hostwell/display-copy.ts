/** Presentation only: preserve saved provider evidence and identifiers. */
export const displayCopy = (text: string) => text.replace(/\s*—\s*/g, ', ')

/** Source provenance is already shown by the adjacent source link. */
export const displayFactLabel = (text: string) => displayCopy(text)
  .replace(/,\s*(?:official\s+)?(?:search excerpt|source excerpt|published source)\s*$/i, '')
  .trim()
