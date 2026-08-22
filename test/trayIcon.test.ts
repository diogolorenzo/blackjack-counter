import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

import { renderTrayIcon } from '../src/main/trayIcon'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const SIZE = 16

interface Chunk {
  type: string
  data: Buffer
  crcOk: boolean
}

const CRC_TABLE = ((): Int32Array => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer: Buffer): number {
  let crc = -1
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ -1) >>> 0
}

/** Leitor mínimo de PNG — o teste tem que ler o arquivo do jeito que o Windows lê. */
function parse(png: Buffer): Chunk[] {
  const chunks: Chunk[] = []
  let offset = SIGNATURE.length
  while (offset < png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.subarray(offset + 4, offset + 8).toString('ascii')
    const data = png.subarray(offset + 8, offset + 8 + length)
    const declared = png.readUInt32BE(offset + 8 + length)
    chunks.push({
      type,
      data: Buffer.from(data),
      crcOk: crc32(png.subarray(offset + 4, offset + 8 + length)) === declared
    })
    offset += 12 + length
  }
  return chunks
}

describe('renderTrayIcon', () => {
  const png = renderTrayIcon('#34d399')
  const chunks = parse(png)

  it('começa com a assinatura PNG', () => {
    expect(png.subarray(0, 8)).toEqual(SIGNATURE)
  })

  it('tem IHDR, IDAT e IEND nesta ordem, com CRC válido', () => {
    expect(chunks.map((chunk) => chunk.type)).toEqual(['IHDR', 'IDAT', 'IEND'])
    for (const chunk of chunks) expect(chunk.crcOk, `CRC de ${chunk.type}`).toBe(true)
  })

  it('declara 16x16 RGBA de 8 bits', () => {
    const ihdr = chunks[0]?.data
    if (ihdr === undefined) throw new Error('sem IHDR')
    expect(ihdr.readUInt32BE(0)).toBe(SIZE)
    expect(ihdr.readUInt32BE(4)).toBe(SIZE)
    expect(ihdr[8]).toBe(8)
    expect(ihdr[9]).toBe(6)
  })

  it('os dados descomprimem no tamanho exato de 16 linhas RGBA', () => {
    const idat = chunks[1]?.data
    if (idat === undefined) throw new Error('sem IDAT')
    expect(inflateSync(idat)).toHaveLength(SIZE * (1 + SIZE * 4))
  })

  it('desenha na cor pedida e deixa os cantos transparentes', () => {
    const idat = chunks[1]?.data
    if (idat === undefined) throw new Error('sem IDAT')
    const raw = inflateSync(idat)

    const pixel = (x: number, y: number): number[] => {
      const start = y * (1 + SIZE * 4) + 1 + x * 4
      return [raw[start], raw[start + 1], raw[start + 2], raw[start + 3]]
    }

    // Centro: o ponto cheio, na cor pedida e opaco.
    expect(pixel(8, 8)).toEqual([0x34, 0xd3, 0x99, 255])
    // Canto: fora do anel, totalmente transparente — sem isso o ícone vira um
    // quadrado colorido na bandeja.
    expect(pixel(0, 0)[3]).toBe(0)
  })

  it('cor inválida cai num padrão em vez de gerar lixo', () => {
    expect(() => renderTrayIcon('não é cor')).not.toThrow()
    expect(renderTrayIcon('não é cor').subarray(0, 8)).toEqual(SIGNATURE)
  })

  it('cores diferentes geram bitmaps diferentes', () => {
    expect(renderTrayIcon('#34d399').equals(renderTrayIcon('#f87171'))).toBe(false)
  })
})
