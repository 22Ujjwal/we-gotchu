import { createFileRoute } from '@tanstack/react-router'
import { ConnectedEventPage } from '#/components/hostwell/event-page'
import { Header } from '#/components/hostwell/ui'
import { localPreview } from '#/lib/local-preview'

export const Route = createFileRoute('/events/$eventId')({ component: EventRoute })

function EventRoute() {
  const { eventId } = Route.useParams()
  return <div className="flex min-h-screen flex-col">
    <Header step="setting" />
    {localPreview ? <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <p role="status">Local preview uses sample screens only. Authenticated event data is disabled.</p>
      <a href="/" className="text-[17px] font-semibold underline">Return to local preview</a>
    </main> : <ConnectedEventPage eventId={eventId} />}
  </div>
}
