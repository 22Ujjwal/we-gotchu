import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { PlanningIntake } from '#/components/hostwell/planning-chat'
import { Header } from '#/components/hostwell/ui'

export const Route = createFileRoute('/planning/')({ component: PlanningStartPage })

function PlanningStartPage() {
  const navigate = useNavigate()
  return <div className="flex min-h-screen flex-col">
    <Header step="brief" />
    <main className="flex flex-1 flex-col items-center justify-center px-5 pt-10 pb-8 lg:px-12">
      <PlanningIntake onCreated={id => void navigate({ to: '/planning/$id', params: { id } })} />
    </main>
  </div>
}
