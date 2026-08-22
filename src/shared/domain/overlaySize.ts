export interface Size {
  width: number
  height: number
}

export interface SizeLimits {
  min: Size
  max: Size
}

function clampAxis(value: number, min: number, max: number, area: number): number {
  // Valor não finito vem de settings.json corrompido ou de um arrasto que
  // perdeu a referência da janela; cair no piso é o único resultado usável.
  const base = Number.isFinite(value) ? value : min
  return Math.round(Math.min(Math.min(Math.max(base, min), max), area))
}

/**
 * Piso -> teto -> workArea, nessa ordem.
 *
 * A workArea vem por último porque num monitor menor que o piso o piso perde:
 * uma janela maior que a tela não tem como ser arrastada de volta para dentro,
 * e overlay inalcançável é pior que overlay apertado.
 */
export function clampOverlaySize(desired: Size, limits: SizeLimits, area: Size): Size {
  return {
    width: clampAxis(desired.width, limits.min.width, limits.max.width, area.width),
    height: clampAxis(desired.height, limits.min.height, limits.max.height, area.height)
  }
}

/** O customizado tem prioridade sobre o preset; os dois passam pelo mesmo clamp. */
export function effectiveOverlaySize(
  preset: Size,
  custom: Size | null,
  limits: SizeLimits,
  area: Size
): Size {
  return clampOverlaySize(custom ?? preset, limits, area)
}
