import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// O vitest não lê o electron.vite.config.ts, então o alias @shared precisa ser
// repetido aqui — sem isso os testes de domínio não resolvem os imports.
export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(__dirname, 'src/shared') }
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts']
  }
})
