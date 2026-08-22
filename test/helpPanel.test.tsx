// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { HelpPanel } from '../src/renderer/src/components/HelpPanel'
import { APP_VERSION, CHANGELOG } from '../src/shared/changelog'
import { DEFAULT_SETTINGS } from '../src/shared/defaults'

afterEach(cleanup)

function renderHelp() {
  render(<HelpPanel settings={DEFAULT_SETTINGS} onNavigate={() => {}} />)
}

describe('HelpPanel — versão e novidades', () => {
  it('mostra a versão que está rodando', () => {
    renderHelp()
    expect(screen.getByText(new RegExp(`Versão ${APP_VERSION}`))).toBeTruthy()
  })

  it('lista todas as versões do changelog com suas mudanças', () => {
    renderHelp()
    for (const entry of CHANGELOG) {
      expect(screen.getByText(entry.version)).toBeTruthy()
      for (const change of entry.changes) expect(screen.getByText(change)).toBeTruthy()
    }
  })
})
