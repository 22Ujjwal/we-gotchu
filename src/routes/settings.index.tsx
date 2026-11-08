import { Link, Navigate, createFileRoute, useNavigate } from '@tanstack/react-router'
import { SettingsView } from '#/components/hostwell/settings-view'
import { venues } from '#/lib/hostwell/fixture'
import { useHostwell } from '#/lib/hostwell/store'
import { localPreview } from '#/lib/local-preview'

export const Route = createFileRoute('/settings/')({ component: SettingsPage })

function SettingsPage() {
  return localPreview ? <PreviewSettingsPage /> : <Navigate to="/" />
}

function PreviewSettingsPage() {
  const { brief } = useHostwell()
  const navigate = useNavigate()
  const [prev, featured, next] = venues
  return (
    <SettingsView
      brief={{ ...brief, area: 'Berlin' }}
      featured={featured}
      others={[prev, next]}
      onChoose={(venueId) => navigate({ to: '/settings/$venueId', params: { venueId } })}
      editBrief={
        <Link to="/" className="underline decoration-1 [text-underline-position:from-font]">
          Edit brief
        </Link>
      }
    />
  )
}
