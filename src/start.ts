import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";
import { localPreview } from './lib/local-preview';

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

const previewMiddleware = createMiddleware().server(({ request, handlerType, next }) => {
  const path = new URL(request.url).pathname;
  if (handlerType === 'serverFn' || path === '/api' || path.startsWith('/api/')) {
    return new Response('API unavailable in local UI preview. Configure Clerk credentials to enable it.', { status: 503 });
  }
  return next();
});

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [csrfMiddleware, localPreview ? previewMiddleware : clerkMiddleware()],
  };
});
