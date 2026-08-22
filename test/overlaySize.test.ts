import { describe, expect, it } from 'vitest'

import { clampOverlaySize, effectiveOverlaySize } from '../src/shared/domain/overlaySize'
import { OVERLAY_SIZE_LIMITS, OVERLAY_SIZES, STRATEGY_OVERLAY_SIZES } from '../src/shared/defaults'

const limits = { min: { width: 100, height: 80 }, max: { width: 400, height: 300 } }
const bigArea = { width: 1920, height: 1040 }

describe('clampOverlaySize', () => {
  it('deixa passar o que está dentro dos limites', () => {
    expect(clampOverlaySize({ width: 250, height: 150 }, limits, bigArea)).toEqual({
      width: 250,
      height: 150
    })
  })

  it('sobe até o piso', () => {
    expect(clampOverlaySize({ width: 10, height: 10 }, limits, bigArea)).toEqual({
      width: 100,
      height: 80
    })
  })

  it('desce até o teto', () => {
    expect(clampOverlaySize({ width: 9999, height: 9999 }, limits, bigArea)).toEqual({
      width: 400,
      height: 300
    })
  })

  it('nunca passa da workArea', () => {
    expect(clampOverlaySize({ width: 400, height: 300 }, limits, { width: 320, height: 240 })).toEqual({
      width: 320,
      height: 240
    })
  })

  /**
   * O caso que decide a ordem dos clamps. Num monitor menor que o piso, ganhar
   * o piso produziria uma janela maior que a tela — impossível de arrastar de
   * volta para dentro. A workArea vem por último de propósito.
   */
  it('workArea menor que o piso ganha do piso', () => {
    expect(clampOverlaySize({ width: 100, height: 80 }, limits, { width: 60, height: 50 })).toEqual({
      width: 60,
      height: 50
    })
  })

  it('arredonda para inteiro', () => {
    expect(clampOverlaySize({ width: 200.6, height: 150.2 }, limits, bigArea)).toEqual({
      width: 201,
      height: 150
    })
  })

  it('tamanho não finito cai no piso em vez de virar NaN', () => {
    expect(clampOverlaySize({ width: Number.NaN, height: 150 }, limits, bigArea)).toEqual({
      width: 100,
      height: 150
    })
  })
})

describe('effectiveOverlaySize', () => {
  const preset = { width: 232, height: 150 }

  it('sem tamanho customizado usa o preset', () => {
    expect(effectiveOverlaySize(preset, null, limits, bigArea)).toEqual({ width: 232, height: 150 })
  })

  it('com tamanho customizado o customizado ganha', () => {
    expect(effectiveOverlaySize(preset, { width: 300, height: 200 }, limits, bigArea)).toEqual({
      width: 300,
      height: 200
    })
  })

  it('o customizado também passa pelo clamp', () => {
    expect(effectiveOverlaySize(preset, { width: 9999, height: 9999 }, limits, bigArea)).toEqual({
      width: 400,
      height: 300
    })
  })

  it('o preset também passa pelo clamp, para monitor pequeno', () => {
    expect(effectiveOverlaySize(preset, null, limits, { width: 200, height: 120 })).toEqual({
      width: 200,
      height: 120
    })
  })
})

describe('tabelas de tamanho', () => {
  it('todo preset de contagem cabe nos limites de contagem', () => {
    const { min, max } = OVERLAY_SIZE_LIMITS.count
    for (const size of Object.values(OVERLAY_SIZES)) {
      expect(size.width).toBeGreaterThanOrEqual(min.width)
      expect(size.height).toBeGreaterThanOrEqual(min.height)
      expect(size.width).toBeLessThanOrEqual(max.width)
      expect(size.height).toBeLessThanOrEqual(max.height)
    }
  })

  /**
   * Um preset fora dos limites seria redimensionado no primeiro applyPlacement
   * e o seletor de tamanho passaria a mostrar um valor que a janela não tem.
   */
  it('todo preset de jogada cabe nos limites do layout dele', () => {
    const pairs = [
      [STRATEGY_OVERLAY_SIZES.guide, OVERLAY_SIZE_LIMITS.strategyGuide],
      [STRATEGY_OVERLAY_SIZES.matrix, OVERLAY_SIZE_LIMITS.strategyMatrix]
    ] as const

    for (const [table, { min, max }] of pairs) {
      for (const size of Object.values(table)) {
        expect(size.width).toBeGreaterThanOrEqual(min.width)
        expect(size.height).toBeGreaterThanOrEqual(min.height)
        expect(size.width).toBeLessThanOrEqual(max.width)
        expect(size.height).toBeLessThanOrEqual(max.height)
      }
    }
  })
})
