import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Leitura/escrita de JSON em disco para o estado do app.
 *
 * Nenhuma das duas lança: settings, sessão e histórico são conveniências, e
 * derrubar o processo main por causa de disco cheio ou arquivo corrompido
 * custaria a contagem em andamento — que é a única coisa aqui que não dá para
 * recriar.
 */
export function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!existsSync(filePath)) return null
    return JSON.parse(readFileSync(filePath, 'utf8')) as T
  } catch {
    return null
  }
}

/** Escreve em .tmp e renomeia: rename é atômico, então uma queda nunca deixa o arquivo truncado. */
export function writeJsonFile(filePath: string, value: unknown): boolean {
  const tmpPath = `${filePath}.tmp`
  try {
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(tmpPath, JSON.stringify(value), 'utf8')
    renameSync(tmpPath, filePath)
    return true
  } catch {
    return false
  }
}

export function removeFile(filePath: string): void {
  try {
    if (existsSync(filePath)) unlinkSync(filePath)
  } catch {
    // Sem permissão para apagar: o arquivo velho fica, e a janela de restauração
    // se encarrega de ignorá-lo.
  }
}
