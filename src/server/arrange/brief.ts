import { z } from 'zod'

export const eventBriefSchema = z.object({
  occasion: z.string().trim().min(2).max(200),
  guests: z.number().int().min(1).max(2000),
  city: z.string().trim().min(2).max(120),
  date: z.iso.date(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  budget: z.object({
    amountMinor: z.number().int().positive(),
    currency: z.string().regex(/^[A-Z]{3}$/),
  }),
  notes: z.string().trim().max(2000).optional(),
})

export type EventBrief = z.infer<typeof eventBriefSchema>
