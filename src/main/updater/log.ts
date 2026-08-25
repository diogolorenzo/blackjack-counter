import { appendFileSync, renameSync, statSync } from 'node:fs'

/**
 * Log em arquivo do updater.
 *
 * O electron-updater fala tudo o que faz por um logger, e sem um o app
 * empacotado joga isso no console — que não existe. Foi exatamente esse silêncio
 * que deixou uma instalação falhando sem deixar rastro: o app fechava, voltava
 * na versão antiga, e não havia onde olhar. O arquivo é o rastro.
 */
export interface UpdaterLogger {
  info(message: unknown): void
  warn(message: unknown): void
  error(message: unknown): void
  debug(message: unknown): void
}

/** Acima disso o log vira `.old` e recomeça: são dias de app aberto rechecando. */
export const MAX_LOG_BYTES = 256 * 1024

export function formatLine(level: string, message: unknown, at: Date): string {
  const text = message instanceof Error ? (message.stack ?? message.message) : String(message)
  return `${at.toISOString()} [${level}] ${text}\n`
}

/** Tamanho já gravado + o que vai entrar agora passa do teto. */
export function shouldRotate(currentBytes: number, incomingBytes: number): boolean {
  return currentBytes + incomingBytes > MAX_LOG_BYTES
}

/**
 * Nenhuma falha de log pode derrubar o app: escrever o rastro da atualização é
 * menos importante que continuar contando cartas. Daí todo o corpo em try/catch.
 */
export function createFileLogger(file: string): UpdaterLogger {
  const write = (level: string, message: unknown): void => {
    try {
      const line = formatLine(level, message, new Date())
      let size = 0
      try {
        size = statSync(file).size
      } catch {
        // Ainda não existe: primeira linha do arquivo.
      }
      if (shouldRotate(size, Buffer.byteLength(line))) renameSync(file, `${file}.old`)
      appendFileSync(file, line)
    } catch {
      // Disco cheio, pasta sem permissão: o app segue.
    }
  }

  return {
    info: (message) => write('info', message),
    warn: (message) => write('warn', message),
    error: (message) => write('error', message),
    debug: (message) => write('debug', message)
  }
}
