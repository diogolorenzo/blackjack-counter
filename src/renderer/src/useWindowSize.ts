import { useEffect, useState } from 'react'

/**
 * Tamanho real da janela do renderer.
 *
 * Os overlays escalam o conteúdo por `zoom` a partir daqui, e não da tabela de
 * presets: com tamanho arrastável o preset deixa de descrever a janela, e a
 * medição própria ainda tem a vantagem de acompanhar o gesto sem latência de
 * IPC.
 */
export function useWindowSize(): { width: number; height: number } {
  const [size, setSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }))

  useEffect(() => {
    const measure = (): void => {
      setSize({ width: window.innerWidth, height: window.innerHeight })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  return size
}
