import { createFileRoute } from '@tanstack/react-router'
import { ConnectedPlanningTeamPage } from '../components/hostwell/planning-team'
import { Header } from '../components/hostwell/ui'

export const Route = createFileRoute('/planning/$id_/team')({ component: PlanningTeamRoute })

function PlanningTeamRoute() {
  const { id } = Route.useParams()
  return <div className="flex min-h-screen flex-col">
    <Header step="setting" />
    <ConnectedPlanningTeamPage id={id} />
  </div>
}
