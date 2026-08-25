import { describe, expect, it } from 'vitest'

import { planInstall } from '../src/main/updater/install'
import { MAX_LOG_BYTES, formatLine, shouldRotate } from '../src/main/updater/log'
import { shouldCheck, visibleStatus } from '../src/main/updater/policy'
import type { UpdateState } from '../src/main/updater/policy'

const idle: UpdateState = {
  phase: 'idle',
  version: null,
  percent: 0,
  dismissed: false,
  lastCheckAt: null
}

describe('visibleStatus', () => {
  it('parado não mostra nada', () => {
    expect(visibleStatus(idle)).toBeNull()
  })

  /** Checagem em andamento não é notícia: a pílula só aparece quando há o quê dizer. */
  it('checando não mostra nada', () => {
    expect(visibleStatus({ ...idle, phase: 'checking' })).toBeNull()
  })

  /**
   * Falha de atualização nunca vira alerta: o app tem que abrir e contar cartas
   * com o GitHub fora do ar.
   */
  it('erro não mostra nada', () => {
    expect(visibleStatus({ ...idle, phase: 'error' })).toBeNull()
  })

  it('baixando mostra versão e progresso', () => {
    expect(
      visibleStatus({ ...idle, phase: 'downloading', version: '0.3.0', percent: 37 })
    ).toEqual({ phase: 'downloading', version: '0.3.0', percent: 37 })
  })

  it('pronta mostra a versão', () => {
    expect(visibleStatus({ ...idle, phase: 'ready', version: '0.3.0', percent: 100 })).toEqual({
      phase: 'ready',
      version: '0.3.0',
      percent: 100
    })
  })

  it('dispensada some, mesmo pronta', () => {
    expect(
      visibleStatus({ ...idle, phase: 'ready', version: '0.3.0', dismissed: true })
    ).toBeNull()
  })

  it('dispensada some também durante o download', () => {
    expect(
      visibleStatus({ ...idle, phase: 'downloading', version: '0.3.0', dismissed: true })
    ).toBeNull()
  })
})

describe('shouldCheck', () => {
  it('nunca checado -> checa', () => {
    expect(shouldCheck(idle, 1_000, 300_000)).toBe(true)
  })

  it('dentro da janela mínima -> não checa', () => {
    expect(shouldCheck({ ...idle, lastCheckAt: 1_000 }, 200_000, 300_000)).toBe(false)
  })

  it('passada a janela mínima -> checa', () => {
    expect(shouldCheck({ ...idle, lastCheckAt: 1_000 }, 400_000, 300_000)).toBe(true)
  })

  /**
   * Já baixada e pronta, checar de novo é tráfego à toa: o autoUpdater não tem
   * o que fazer com uma segunda resposta igual.
   */
  it('com atualização pronta -> não checa', () => {
    expect(shouldCheck({ ...idle, phase: 'ready', version: '0.3.0' }, 999_999, 300_000)).toBe(
      false
    )
  })

  it('baixando -> não checa', () => {
    expect(shouldCheck({ ...idle, phase: 'downloading' }, 999_999, 300_000)).toBe(false)
  })

  /**
   * `checking` é o estado mais provável de se encontrar na prática (round-trip
   * de rede lento): a checagem anterior carimbou `lastCheckAt` e ainda não
   * respondeu. `checking` não tem uma regra própria em `shouldCheck` — cai na
   * mesma janela mínima de idle/error — mas ainda assim não pode disparar uma
   * segunda checagem por cima da que está em andamento.
   */
  it('checando, dentro da janela mínima -> não checa', () => {
    expect(
      shouldCheck({ ...idle, phase: 'checking', lastCheckAt: 1_000 }, 200_000, 300_000)
    ).toBe(false)
  })
})

describe('planInstall', () => {
  it('pasta gravável instala em silêncio', () => {
    const plan = planInstall(true)
    expect(plan.silent).toBe(true)
    expect(plan.autoOnQuit).toBe(true)
  })

  /**
   * Instalação para todos os usuários mora em Program Files e exige UAC. Como o
   * `latest.yml` sai sem `isAdminRightsRequired` (o build é `perMachine: false`),
   * o electron-updater dispara o instalador sem elevação: com `/S`, o NSIS pede
   * UAC de janela escondida e desiste por `Quit` — o app fecha e nada é
   * instalado. Sem `/S` o instalador aparece e o UAC tem onde ser respondido.
   */
  it('pasta não gravável mostra o instalador', () => {
    expect(planInstall(false).silent).toBe(false)
  })

  /**
   * O caminho que precisa de UAC não pode ficar no fechamento: seria um prompt
   * escondido a cada vez que o app fecha, congelando a tela sem instalar nada.
   */
  it('pasta não gravável não instala sozinha no fechamento', () => {
    expect(planInstall(false).autoOnQuit).toBe(false)
  })
})

describe('log do updater', () => {
  it('linha carimba horário e nível', () => {
    expect(formatLine('info', 'oi', new Date('2026-01-02T03:04:05.000Z'))).toBe(
      '2026-01-02T03:04:05.000Z [info] oi\n'
    )
  })

  /** Erro sem stack ainda tem que dizer alguma coisa. */
  it('erro vira stack ou mensagem', () => {
    const semStack = new Error('falhou')
    semStack.stack = undefined
    expect(formatLine('error', semStack, new Date(0))).toContain('falhou')
  })

  it('rotaciona só quando a linha nova estoura o teto', () => {
    expect(shouldRotate(MAX_LOG_BYTES - 10, 5)).toBe(false)
    expect(shouldRotate(MAX_LOG_BYTES - 10, 20)).toBe(true)
  })
})
