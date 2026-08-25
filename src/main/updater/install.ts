/**
 * De que jeito o instalador NSIS pode ser chamado nesta máquina.
 *
 * O app é publicado com `perMachine: false`, então o `latest.yml` sai sem
 * `isAdminRightsRequired` e o electron-updater SEMPRE dispara o instalador sem
 * elevação. Isso está certo para a instalação por usuário
 * (`%LOCALAPPDATA%\Programs\counter`), que é a padrão — mas o instalador é o
 * assistido (`oneClick: false`), e ele oferece "para todos os usuários" na
 * primeira instalação. Quem escolheu essa opção tem o app em `Program Files`, e
 * aí gravar por cima exige UAC.
 *
 * Com `/S` (silencioso) nesse caso o NSIS chama `UAC_RunElevated` com a janela
 * escondida: a tela inteira congela na transição para o desktop seguro do UAC,
 * o prompt não tem onde aparecer e o instalador sai por `Quit`. O app fecha,
 * nada é instalado e a versão antiga continua lá — sem uma linha de erro em
 * lugar nenhum.
 *
 * Por isso a decisão não é fixa: só instala em silêncio quem pode escrever no
 * próprio diretório de instalação. Precisando de elevação, o instalador aparece
 * — o UAC vem junto, visível, e dá para concluir.
 */
export interface InstallPlan {
  /** `/S`: instala sem nenhuma janela. */
  silent: boolean
  /** Instalar sozinho no próximo fechamento do app. */
  autoOnQuit: boolean
  /** Frase que vai para o log, para o diagnóstico não depender de adivinhação. */
  reason: string
}

/**
 * @param writableInstallDir o diretório do executável aceita escrita deste
 * usuário, sem elevação.
 */
export function planInstall(writableInstallDir: boolean): InstallPlan {
  if (writableInstallDir) {
    return {
      silent: true,
      autoOnQuit: true,
      reason: 'instalação por usuário: instalador roda em silêncio'
    }
  }

  // autoOnQuit ficaria pior que inútil aqui: todo fechamento normal do app
  // viraria um UAC escondido, ou seja, o mesmo congelamento de tela sem nada
  // instalado no fim. Precisando de elevação, a instalação é só a explícita,
  // pelo botão, e com o instalador na tela.
  return {
    silent: false,
    autoOnQuit: false,
    reason: 'instalação para todos os usuários: precisa de UAC, instalador aparece na tela'
  }
}
