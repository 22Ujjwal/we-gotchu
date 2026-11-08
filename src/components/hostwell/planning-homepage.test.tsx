import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { Route as HomeRoute } from '../../routes/index'
import { Route as PlanningRoute } from '../../routes/planning.$id'
import { HostwellProvider } from '../../lib/hostwell/store'
import type { PlanningView } from '../../agent/planning/contract'

vi.mock('@clerk/tanstack-react-start', () => ({ useUser: () => ({ isLoaded: true, user: { id: 'customer-a' } }) }))
vi.mock('../../lib/local-preview', () => ({ localPreview: false }))
afterEach(() => sessionStorage.clear())

function mount() {
  sessionStorage.setItem('arrange:brief', JSON.stringify({ occasion: 'Birthday', guests: '48', date: 'Sat 14 Nov 2026',
    from: '6pm', till: '10pm', area: 'Berlin', budget: '900', canLose: '20', needs: 'candles', vibe: 'relaxed' }))
  const root = createRootRoute({ component: () => <HostwellProvider><Outlet /></HostwellProvider> })
  const router = createRouter({ history: createMemoryHistory({ initialEntries: ['/'] }), routeTree: root.addChildren([
    createRoute({ getParentRoute: () => root, path: '/', component: HomeRoute.options.component }),
    createRoute({ getParentRoute: () => root, path: '/planning/$id', component: PlanningRoute.options.component }),
  ]), defaultPendingMinMs: 0 })
  render(<RouterProvider router={router} />)
  return router
}

test('the polished brief submits the Berlin requirements to planning and opens its saved conversation', async () => {
  const writes: { path: string; body: { requestId: string; message: string } }[] = []
  const view: PlanningView = { id: 'berlin', version: 1, status: 'ready', selections: [], progress: null, error: null,
    messages: [], proposal: { summary: 'Berlin research started.', nextQuestion: null, options: [] } }
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (init?.method === 'POST') writes.push({ path: String(url), body: JSON.parse(String(init.body)) })
    return Response.json(view)
  })
  const router = mount()
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Find venues' }))
  await waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0].path).toBe('/api/planning')
  expect(writes[0].body.requestId).toBeTruthy()
  for (const value of ['48', 'Berlin', 'Sat 14 Nov 2026', '6pm', '10pm', 'USD 900', 'USD 20', 'candles', 'relaxed']) {
    expect(writes[0].body.message).toContain(value)
  }
  expect(writes[0].body.message).toContain('local to the event location')
  await waitFor(() => expect(router.state.location.pathname).toBe('/planning/berlin'))
  expect(await screen.findByText('Berlin research started.')).toBeVisible()
})

test('a lost create response retains the brief and blocks a second submission', async () => {
  vi.mocked(fetch).mockRejectedValue(new Error('Connection lost'))
  mount()
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Find venues' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('do not submit again')
  expect(screen.getByRole('button', { name: 'Find venues' })).toBeDisabled()
  expect(JSON.parse(sessionStorage.getItem('arrange:brief')!).area).toBe('Berlin')
  expect(fetch).toHaveBeenCalledTimes(1)
})
