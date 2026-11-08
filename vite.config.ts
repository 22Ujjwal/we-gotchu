import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { nitro } from 'nitro/vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // Permit only an explicitly selected tunnel host during an approved live check.
  server: { allowedHosts: process.env.ARRANGE_TUNNEL_HOST ? [process.env.ARRANGE_TUNNEL_HOST] : [] },
  plugins: [devtools(), tailwindcss(), tanstackStart(), nitro({ vercel: { functions: { maxDuration: 60 } } }), viteReact()],
})

export default config
