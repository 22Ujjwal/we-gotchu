import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { expect, test, vi } from 'vitest'
import { Route as HomeRoute } from '../../routes/planning.index'
import { Route as PlanningRoute } from '../../routes/planning.$id'
import type { PlanningView } from '../../agent/planning/contract'

vi.mock('@clerk/tanstack-react-start', () => ({ useUser: () => ({ isLoaded: true, user: { id: 'customer-a' } }) }))
vi.mock('../../lib/local-preview', () => ({ localPreview: false }))
function routerAt(path: string) {
  const root = createRootRoute({ component: Outlet })
  return createRouter({ history: createMemoryHistory({ initialEntries: [path] }),
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/planning', component: HomeRoute.options.component }),
      createRoute({ getParentRoute: () => root, path: '/planning/$id', component: PlanningRoute.options.component }),
    ]), defaultPendingMinMs: 0 })
}

test('planning entry opens the saved planning URL and the same URL reload only reads it', async () => {
  vi.stubGlobal('scrollTo', vi.fn())
  const saved: PlanningView = { id: 'saved-plan', version: 1, status: 'ready', selections: [], progress: null, error: null,
    messages: [{ id: 'm1', role: 'user', text: 'Dinner next weekend', createdAt: '2026-11-07T12:00:00Z' }],
    proposal: { summary: 'Let us find the right place.', nextQuestion: 'Which city?', options: [] } }
  const writes: unknown[] = []
  const paths: string[] = []
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const path = String(input); paths.push(path)
    if (init?.method === 'POST') {
      expect(path).toBe('/api/planning')
      writes.push(JSON.parse(String(init.body)))
      return Response.json(saved, { status: 201 })
    }
    expect(path).toBe('/api/planning/saved-plan')
    return Response.json(saved)
  })
  const router = routerAt('/planning')
  const page = render(<RouterProvider router={router} />)
  const user = userEvent.setup()
  await user.type(await screen.findByRole('textbox', { name: 'Tell us about your event' }), 'Dinner next weekend')
  await user.keyboard('{Enter}')
  expect(await screen.findByText('Which city?')).toBeVisible()
  await waitFor(() => expect(router.state.location.pathname).toBe('/planning/saved-plan'))
  expect(writes).toHaveLength(1)
  page.unmount()
  render(<RouterProvider router={routerAt('/planning/saved-plan')} />)
  expect(await screen.findByText('Which city?')).toBeVisible()
  expect(writes).toHaveLength(1)
  expect(paths).toEqual(['/api/planning', '/api/planning/saved-plan', '/api/planning/saved-plan'])
})
