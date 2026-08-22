import { deflateSync } from 'node:zlib'

/**
 * Gerador do ícone da bandeja.
 *
 * O ícone precisa mudar de cor conforme o estado (atalhos desligados, contagem
 * neutra, vantagem, shoe estourado), e manter quatro PNGs em base64 no código
 * seria pior de ler e de ajustar do que desenhar os 16x16 aqui. Também evita
 * depender de arquivo em disco, que teria caminho diferente entre
 * `electron-vite dev` e o asar empacotado.
 *
 * `new Tray(nativeImage.createEmpty())` no Windows cria uma entrada de
 * notificação SEM bitmap: nada é desenhado, nenhum erro é lançado, e o app some
 * da bandeja em silêncio. Daí o bitmap ser obrigatório.
 */

const SIZE = 16
const CENTER = (SIZE - 1) / 2
const RING_OUTER = 7.2
const RING_INNER = 5.2
const DOT_RADIUS = 2.6

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

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

/** Cobertura do pixel: 1 dentro, 0 fora, rampa de 1px na borda para não serrilhar. */
function coverage(distance: number, radius: number): number {
  const edge = radius - distance
  if (edge >= 0.5) return 1
  if (edge <= -0.5) return 0
  return edge + 0.5
}

function alphaAt(x: number, y: number): number {
  const dx = x - CENTER
  const dy = y - CENTER
  const distance = Math.sqrt(dx * dx + dy * dy)

  const ring = Math.min(coverage(distance, RING_OUTER), 1 - coverage(distance, RING_INNER))
  const dot = coverage(distance, DOT_RADIUS)
  return Math.max(0, Math.min(1, Math.max(ring, dot)))
}

/** PNG 16x16 RGBA do anel + centro na cor informada (`#rrggbb`). */
export function renderTrayIcon(hexColor: string): Buffer {
  const match = /^#?([0-9a-f]{6})$/i.exec(hexColor.trim())
  const rgb = match === null ? 0xe6edf3 : Number.parseInt(match[1], 16)
  const red = (rgb >> 16) & 0xff
  const green = (rgb >> 8) & 0xff
  const blue = rgb & 0xff

  // Uma linha = 1 byte de filtro (0 = nenhum) + 4 bytes por pixel.
  const raw = Buffer.alloc(SIZE * (1 + SIZE * 4))
  let offset = 0
  for (let y = 0; y < SIZE; y++) {
    raw[offset++] = 0
    for (let x = 0; x < SIZE; x++) {
      const alpha = Math.round(alphaAt(x, y) * 255)
      raw[offset++] = red
      raw[offset++] = green
      raw[offset++] = blue
      raw[offset++] = alpha
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0)
  ihdr.writeUInt32BE(SIZE, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0 // deflate
  ihdr[11] = 0 // filtro adaptativo
  ihdr[12] = 0 // sem entrelace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}
