import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { APP_VERSION, CHANGELOG } from '../src/shared/changelog'

const { version: packageVersion } = JSON.parse(
  readFileSync(resolve(__dirname, '../package.json'), 'utf-8')
) as { version: string }

describe('changelog', () => {
  /**
   * A trava que dá sentido ao resto: sem ela dá para subir a versão, esquecer de
   * escrever o que mudou, e o app passar a afirmar que a novidade da 0.3.0 é o
   * que mudou na 0.2.1 — bem no momento em que alguém abriu a tela para
   * descobrir o que recebeu.
   */
  it('a versão do package.json é a entrada mais nova', () => {
    expect(CHANGELOG[0]?.version).toBe(packageVersion)
  })

  it('a versão injetada no build é a do package.json', () => {
    expect(APP_VERSION).toBe(packageVersion)
  })

  it('versões não se repetem', () => {
    const versions = CHANGELOG.map((entry) => entry.version)
    expect(new Set(versions).size).toBe(versions.length)
  })

  it('vai da mais nova para a mais antiga', () => {
    const dates = CHANGELOG.map((entry) => entry.date)
    expect([...dates].sort().reverse()).toEqual(dates)
  })

  it('toda entrada tem data ISO e ao menos uma mudança', () => {
    for (const entry of CHANGELOG) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(entry.changes.length).toBeGreaterThan(0)
    }
  })
})
