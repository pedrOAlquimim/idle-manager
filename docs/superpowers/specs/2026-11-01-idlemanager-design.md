# IdleManager: especificação

Data: 2026-11-01.

Fontes: [design do Claude Design](https://claude.ai/artifact/3UXTBvUVXEppS29xHT9oGT), entrevista com o Pedro e [Termos do Pokeidle](https://pokeidle.io/terms). Onde o design e a entrevista divergem, vale o design. A seção "Mudanças do design" lista esses casos.

## Objetivo

App desktop pessoal para rodar jogos de navegador com várias contas, em sessões isoladas, numa janela só. A v1 nasceu só com o Pokeidle, com até 4 contas; jogos de qualquer site entram como grupos, como descreve o [design de 2026-11-02](2026-11-02-game-groups-design.md). O app mostra e vigia os jogos. Ele não joga por você.

## Regras do Pokeidle que o app respeita

Lidas nas seções 5, 6 e 9 dos Termos, em 2026-11-01.

- Cada pessoa pode ter até 4 contas, somando todas as redes e aparelhos. Passar disso dá ban em todas as contas e bloqueia os saques de Gemas.
- Cada rede pode ter até 4 contas criadas e 4 conectadas ao mesmo tempo.
- A detecção usa a rede e um identificador aleatório salvo no navegador.
- Automação é permitida, desde que não burle limites nem sobrecarregue o servidor.

O app não tem bot, proxy nem disfarce de identificador, e mantém o user agent padrão do Electron.

## Decisões gerais

| Tema | Decisão |
|---|---|
| Público | Só o Pedro. Sem site, conta ou servidor. |
| Jogos | Grupos criados pelo usuário, com nome e URL. O Pokeidle é reconhecido pelo endereço e mostrado como "PokeIdle". Ver o [design de 2026-11-02](2026-11-02-game-groups-design.md). |
| Sistemas | Só Linux na v1 (`.deb`). |
| Base | Electron 45, TypeScript estrito, React 19 na interface. |
| Idioma | Código, tipos, arquivos, testes e commits em inglês. Textos da interface em português. |
| Pasta | `~/www/IdleManager`, com git local. |
| Login | E-mail e senha, digitados na tela do jogo. Login com Google fica fora da v1. |
| Dados | `~/.config/IdleManager`. As sessões usam partições `persist:<gameId>-<accountId>`. O app nunca guarda senha. |
| Limite | Por jogo, em `accountLimit`. No Pokeidle, 4. |
| Atualização | Sem atualização automática. |

## Interface

A janela usa o quadro nativo do sistema e tem quatro áreas. Tudo em português e tema escuro. Cores, fontes e medidas seguem o design.

### Barra lateral (248 px, recolhível)

- Marca "IM" e nome IdleManager, com botão de recolher. Recolhida, a grade mostra "Mostrar contas".
- Resumo "Todas as contas", com ligadas e memória total.
- Um grupo por jogo, com contagem, memória, botão `+` e menu `…`.
- Cada conta tem avatar com iniciais, ponto de status, nome e memória.
- "Adicionar conta" usa um campo inline na própria lateral. No limite do jogo, a ação fica desativada e mostra "Limite de 4 contas do PokeIdle".
- Sem contas, a grade mostra "Adicione sua primeira conta".

### Grade de telas

Cada tela tem cabeçalho de 32 px, barra de endereço de 28 px e a área do jogo.

- Cabeçalho: ponto de status, nome, texto de status, memória e botão de expandir.
- Barra de endereço: cadeado, host atual e partição.
- Três disposições: grade 2×2, uma tela (foco) e lado a lado em linha.
- Clicar em uma tela seleciona a conta e o clique chega ao jogo. Na grade, as contas são jogáveis.
- Expandir alterna entre foco e grade. As outras contas continuam rodando.
- Zoom na grade: `min(1, areaHeight / 828)`, com piso de 0,25, cerca de 50% em 1080p. Com esse valor, a escala automática do jogo não encolhe a tela de novo.
- Foco e linha usam zoom 100%. Na linha, a tela estreita faz o jogo usar o layout de celular.

### Painel da conta (288 px)

- Cabeçalho com avatar, nome, status e botão de próxima conta.
- Ações: Início, Recarregar, Som/Mudo, Destacar.
- Consumo do último minuto: memória e CPU, com gráfico de 30 amostras a cada 2 s.
- Histórico da conta, com os 6 eventos mais recentes.
- Ações finais: Foco, Ligar/Desligar e Mais.

### Barra de status

- "Tudo certo" ou "N contas precisam de você".
- Seletor das três disposições.
- Memória e CPU totais do app, com barra da fração da RAM do PC.
- Botões de histórico geral e configurações, versão do app.

O histórico geral e as configurações trocam o conteúdo do painel da direita.

### Regra técnica de sobreposição

As telas do jogo são `WebContentsView`, que ficam acima do HTML da janela. Nada em HTML pode sobrepor uma tela: menus são nativos, confirmações usam diálogo nativo e os avisos sobre uma tela só aparecem com a view escondida.

## Contas

- Cada conta tem nome, jogo, estado ligada/desligada, som e o último nick visto.
- Os nomes sugeridos são "Principal", "Alt 1", "Alt 2" e "Alt 3". O menu Mais permite renomear.
- O id da conta é gerado do nome na criação e não muda ao renomear.
- Desligar descarrega a página. Ao abrir o app, só contas ligadas carregam, com intervalo de 5 s.
- O menu `…` do grupo tem "Ligar todas" e "Desligar todas".
- "Remover conta" pede confirmação, apaga a sessão local e tira o nick da lista. O diálogo avisa que a conta segue contando no limite do jogo se não for excluída.

### Limite de nicks

- O app lê `sessao.nick` do `localStorage` do Pokeidle e guarda até 4 nicks por jogo.
- Trocar entre esses nicks é livre, em qualquer conta.
- Um nick a mais desconecta aquela conta: o app remove `sessao`, carrega `about:blank`, notifica e mostra "Voltar ao login".
- A trava só vale para jogos cujo adaptador informa o nick.

**Limitação:** a trava é reativa. O servidor do jogo já registrou o acesso quando o app vê o nick. Testes usam só o jogo falso.

## Som

Cada conta tem seu botão Som/Mudo, salvo entre execuções. Todas começam mudas.

## Teclado

| Tecla | Ação |
|---|---|
| `Ctrl+1` a `Ctrl+9` | Seleciona a conta daquela posição. Em foco, troca a conta mostrada. |
| `Esc` | Sai do foco para a grade, se o jogo não usou a tecla. |

Sem `Ctrl`, as teclas seguem para o jogo, inclusive para o chat.

## Abrir, fechar e segundo plano

- O app não inicia com o sistema.
- O X esconde na bandeja. Sair de verdade fica no menu da bandeja.
- Uma segunda execução mostra a janela existente.
- As contas seguem ativas com a janela minimizada, escondida ou coberta (`backgroundThrottling: false`).
- Enquanto houver conta conectada, o app impede a suspensão. O monitor pode apagar e a sessão pode bloquear.

## Destacar

Destacar move a conta para uma janela própria, em zoom 100%, e a tela da grade mostra "Destacada em janela" com "Trazer de volta". Fechar a janela destacada traz a conta de volta. Destacar não recarrega a página.

## Estados e quedas

| Estado | Texto | Cor | View |
|---|---|---|---|
| `off` | desligada | `--off` | Escondida, com "Ligar" |
| `loading` | carregando | `--mem` | Visível |
| `login` | aguardando login | `--xp` | Visível |
| `connected` | conectada · ligada há 10 s | `--on` | Visível |
| `notice` | Mensagem do aviso | `--xp` | Visível |
| `reloading` | recarregando (n/3) | `--mem` | Visível |
| `down` | não voltou depois de 3 tentativas | `--err` | Escondida, com "Tentar de novo" |
| `blocked` | 5º nick bloqueado | `--err` | Escondida, com "Voltar ao login" |

O combate roda no servidor, por WebSocket, e o jogo se reconecta sozinho. O app só atua quando a página morre.

| Situação | Sinal | Ação |
|---|---|---|
| Jogo reconectando sozinho | Página viva | Nenhuma |
| Crash, travamento ou erro de carga | Eventos do Electron | Recarrega |
| Sonda em silêncio por 60 s | Sem leitura | Recarrega |
| Página sem o jogo por 30 s | `#portal` ausente | Recarrega |
| Conta aberta em outro lugar | `#sessao-tomada` visível | Não recarrega, notifica |
| Ban, rede cheia e outros avisos | `#alerta-conta` visível, com sessão | Não recarrega, notifica o título |
| Login expirado | Tinha sessão e perdeu | Não recarrega, notifica |
| Erro no formulário de login | `#alerta-conta` visível, sem sessão | Nada |

- Recarga automática: até 3 tentativas, com esperas de 5 s, 15 s e 60 s. Depois, a conta fica em `down` e notifica.
- As tentativas zeram depois de 60 s conectada.
- Ao acordar de uma suspensão, o tempo parado não conta como silêncio.
- Notificações podem ser desligadas nas configurações.

## Navegação

- Só os hosts do jogo abrem dentro da conta. No Pokeidle, `https://pokeidle.io`.
- `http` e `https` para outros hosts abrem no navegador padrão, só se o usuário clicou ou usou o teclado naquela conta nos 3 s anteriores. Sem essa interação, nada abre e a navegação é cancelada.
- Outros esquemas são bloqueados.
- Downloads iniciados pelas páginas dos jogos são sempre bloqueados, e o histórico da conta registra "Download bloqueado".

## Mudanças do design em relação à entrevista

| Tema | Entrevista | Agora |
|---|---|---|
| Contas | 4 abas fixas | Lista dinâmica, até o limite do jogo |
| Clique na grade | Abre a tela cheia | Seleciona e chega ao jogo |
| Disposições | Grade e tela cheia | Grade, foco e linha |
| Consumo | Fora da v1 | Painel com memória e CPU |
| Histórico | Não tinha | Por conta e geral, só em memória |
| Ligar/Desligar | Não tinha | Por conta e por grupo |
| Destacar | Fora da v1 | Janela própria por conta |
| Som | Tela cheia toca sozinha | Botão por conta, sem regra automática |
| Atalhos | `1` a `4` na grade | `Ctrl+1` a `Ctrl+9` em todo lugar |
| Zoom da grade | Cerca de 58% | Cerca de 50%, porque as telas são menores |

## Decisões sobre o que o design deixou em aberto

- O card "Principal" da lateral virou o resumo "Todas as contas", sem seletor, porque a v1 não tem perfis.
- A barra de RAM mostra a fração da RAM do PC usada pelo app.
- Configurações da v1: notificações ligadas ou desligadas, e abrir a pasta de dados.
- Adicionados ao design: cor `--err: #f87171`, estados da tabela acima e estado sem contas.
- Removidos do design: moldura `.wrap`, link "Abrir pokeidle.io" e layout empilhado abaixo de 860 px. A janela tem tamanho mínimo de 1000×640.

## Fora da v1

Versão para Windows, perfis, cofre de senhas, alertas por Discord ou Telegram, monitor de textos, login com Google, extensão oficial do jogo, atualização automática, início com o sistema e histórico salvo em disco.

## Critério de pronto

O Pedro faz os logins. As 4 contas ficam conectadas por 1 hora com a janela minimizada, um crash forçado recarrega só a conta afetada, as contas seguem conectadas depois de 10 minutos com a sessão bloqueada, e CPU e RAM ficam registradas com uma recomendação sobre os Modos Economia do jogo.

## Riscos

1. O Turnstile pode recusar o Electron. É o primeiro teste. Se falhar, o trabalho para e as opções vão para o Pedro antes de qualquer contorno.
2. Wayland com NVIDIA pode alterar o comportamento com janela minimizada ou sessão bloqueada.
3. O Ubuntu restringe namespaces sem privilégio, então o sandbox precisa ser validado no `.deb`.
4. O adaptador depende de `#portal`, `#app`, `#sessao-tomada`, `#alerta-conta`, `#alerta-conta-titulo`, `#modal` e da chave `sessao`, lidos na versão 1.389.1 do jogo. Uma atualização pode exigir ajustes.
5. Com zoom perto de 50%, o texto do jogo fica pequeno na grade. Se atrapalhar, o foco e a janela destacada usam 100%.
6. O consumo de RAM com 4 contas em 14 GB ainda não foi medido.
