import { bookedEvent, researchResultFixture } from '../src/contracts'
import { previewRecovery } from '../src/server/operations/recovery'
import { prepareInvitation } from '../src/server/operations/invitations'
import { generateOccurrences } from '../src/server/operations/recurrence'

// Offline scenario only: no database, provider calls, credentials or job dispatch.
// The fixed clock makes the DST example reproducible regardless of today's date.
const now = new Date('2026-11-08T12:00:00Z')
const recovery = previewRecovery({
  view: bookedEvent,
  expectedBriefRevision: bookedEvent.event.briefRevision,
  expectedPlanRevision: bookedEvent.event.planRevision,
  disruption: { unavailableActionIds: ['act_sim_venue'] },
  candidates: researchResultFixture.candidates.filter(candidate => candidate.kind === 'venue'),
})
const invitation = prepareInvitation({
  provider: 'luma', title: 'Birthday — replacement venue pending',
  description: 'The host has fixed the date. Replacement venue research is still required.',
  startAt: bookedEvent.event.brief.startsAt,
  endAt: new Date(Date.parse(bookedEvent.event.brief.startsAt) + 2 * 60 * 60 * 1000).toISOString(),
  timezone: bookedEvent.event.brief.timezone,
  publishAt: '2026-12-01T18:00:00Z', location: { confirmed: false },
}, now)
const { startsAt: _startsAt, timezone: _timezone, ...template } = bookedEvent.event.brief
const recurring = generateOccurrences({
  id: 'simulated-team-dinners', timezone: 'America/Los_Angeles', localTime: '18:00',
  startDate: '2027-03-07', endDate: '2027-03-21', schedule: { kind: 'weekly', weekday: 0 },
  preparationLeadHours: 48, horizonDays: 180, maxOccurrences: 3,
  brief: { ...template, eventType: 'team dinner' },
}, now)

console.log(JSON.stringify({
  mode: 'offline-simulated-example', clock: now.toISOString(),
  recovery, invitation, recurring,
  nextIntegration: [
    'Authorize and reload the current event; agree a recovery execution hold before applying changes.',
    'Persist series and invitation jobs with unique claims after the database integration handback.',
    'Verify Luma account access and resolve a real provider link; Partiful remains manual.',
  ],
  externalEffects: 'None. No events published, research started, commitments changed, or messages sent.',
}, null, 2))
