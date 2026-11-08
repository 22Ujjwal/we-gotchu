// Explicit opt-in; production builds always use Clerk.
export const localPreview = import.meta.env.DEV && import.meta.env.VITE_LOCAL_PREVIEW === 'true'
