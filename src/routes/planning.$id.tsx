import { createFileRoute } from '@tanstack/react-router'
import { ConnectedPlanningPage } from '../components/hostwell/planning-chat'
import { Header } from '../components/hostwell/ui'
import { localPreview } from '../lib/local-preview'

export const Route = createFileRoute('/planning/$id')({ component: PlanningRoute })

function PlanningRoute() {
  const { id } = Route.useParams()
  return <div className="flex min-h-screen flex-col">
    <Header step="setting" />
    {localPreview ? <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <p role="status">Local preview uses sample screens only. Sign in outside preview to return to your plan.</p>
      <a href="/" className="text-[17px] font-semibold underline">Return to local preview</a>
    </main> : <ConnectedPlanningPage id={id} />}
  </div>
}
