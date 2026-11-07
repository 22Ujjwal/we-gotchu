# Invitation and guest-management integration research

Checked official documentation on 2026-11-07.
These are documented capabilities, not verified connections to a team account.
No events were created and no invitations were sent.

## Luma

Luma has an official API for creating and updating events, inviting guests, retrieving guest lists, managing registration status, and sending guest email blasts.
The documentation also lists webhooks for event and guest changes.
API access requires Luma Plus and a calendar-scoped API key for the basic integration path.
This is the recommended first dedicated event-platform integration if the team has suitable access.
It reduces the need to build registration and invitation management ourselves, at the cost of a paid dependency and provider setup.

Sources:

- [API overview and requirements](https://docs.luma.com/reference/getting-started-with-your-api)
- [API capabilities](https://help.luma.com/p/luma-api)
- [Official endpoint index, including invitations, cancellation, and webhooks](https://docs.luma.com/llms.txt)
- [Pricing and API-access tier](https://luma.com/pricing)

## Partiful

No official public developer API was located in the official material searched.
This is a research limitation, not proof that a private partner API cannot exist.
Partiful documents sharing an event link, sending invitations within its product, and exporting a guest list as CSV.
Those provide a manual handoff or import path rather than a verified programmatic integration.
Third-party reverse-engineered integrations appeared in search results, but were not evaluated or selected.
The recommendation is to defer deep Partiful automation rather than make the demo depend on an unverified interface.

Sources:

- [Official invitation methods](https://help.partiful.com/en-us/articles/15525323-how-many-guests-can-i-invite)
- [Official guest-list export](https://help.partiful.com/en-us/articles/15525376-how-can-i-export-my-guest-list)

## Other supported API options

Google Calendar supports event attendees, invitation notifications, and attendee response status.
It is a candidate for basic invitations and RSVP tracking, rather than a complete branded event-registration experience.
Eventbrite has an official API for creating and canceling events and reading attendees, plus webhooks.
Its documented event and attendee operations make it another candidate, but this research did not verify a direct invitation-sending endpoint or a team account connection.

Sources:

- [Google Calendar event and attendee reference](https://developers.google.com/workspace/calendar/api/v3/reference/events)
- [Google Calendar notification controls](https://developers.google.com/workspace/calendar/api/v3/reference/events/update)
- [Eventbrite API capabilities](https://www.eventbrite.co.uk/platform/docs/)

## Demo recommendation

Keep guest management optional to preserve the agreed venue, purchase, payment, and cancellation demo.
If it is added, prefer a small Luma integration using official API access.
An invitation provider manages the guest-facing event, not the physical venue reservation or item order.
Canceling an event page must not be treated as evidence that those supplier transactions were canceled.

## Connector discovery limitation

The local Composio CLI rejected discovery with an invalid or revoked user API key.
Connector availability and connected-account state could not be verified through that CLI.
The platform capability findings above come from official documentation.
