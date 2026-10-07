import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const proxyPort = Number(env.TASKMAP_PROXY_PORT || '3004')
  if (!Number.isInteger(proxyPort) || proxyPort < 1 || proxyPort > 65535) {
    throw new Error('TASKMAP_PROXY_PORT must be an integer from 1 to 65535')
  }
  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: env.DEV_HOST || '127.0.0.1',
      port: 3000,
      allowedHosts: (env.DEV_ALLOWED_HOSTS || '').split(',').map((host) => host.trim()).filter(Boolean),
      proxy: {
        '/api/jira-media': {
          target: `http://127.0.0.1:${proxyPort}`,
          changeOrigin: false,
        },
        '/api/jira-proxy': {
          target: `http://127.0.0.1:${proxyPort}`,
          changeOrigin: false,
        },
      },
    },
  }
})
