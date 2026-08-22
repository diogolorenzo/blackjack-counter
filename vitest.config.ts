import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const { version } = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf-8')
) as { version: string }

// O vitest não lê o electron.vite.config.ts, então os aliases precisam ser
// repetidos aqui — sem isso os testes de domínio e de renderer não resolvem os
// imports.
export default defineConfig({
  // Repetido do electron.vite.config.ts pelo mesmo motivo dos aliases: o vitest
  // não lê aquele arquivo, e sem isto qualquer teste que toque o changelog
  // quebraria em __APP_VERSION__ indefinido.
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@': resolve(__dirname, 'src/renderer/src')
    }
  },
  test: {
    // O padrão é node (main, preload, domínio). Os testes de renderer pedem
    // jsdom por docblock (`// @vitest-environment jsdom`) em vez de um segundo
    // projeto: são poucos arquivos e o custo de subir jsdom não paga por todos.
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx']
  }
})
