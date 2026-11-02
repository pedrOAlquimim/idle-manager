# Grupos de jogo criados pelo usuário

Muda o design de [2026-11-01](2026-11-01-idlemanager-design.md). Onde os dois divergem, vale este. Referência
visual: [design no Claude Design](https://claude.ai/artifact/3UXTBvUVXEppS29xHT9oGT), versão 1793592538-0525.

## Intenção

Hoje o Pokeidle é o único jogo, fixo no código. O Pedro quer colocar qualquer jogo de navegador sem mexer no
código: ele informa o nome e a URL, e o jogo vira um grupo com contas em sessões isoladas. O Pokeidle deixa de
vir pronto e passa a ser criado do mesmo jeito.

## Objetivos

- Criar um grupo de jogo por um modal, com nome, URL e primeira conta.
- Adicionar contas a um grupo existente por um modal menor.
- Rodar grupos de jogos diferentes ao mesmo tempo, com a mesma isolação de hoje.
- Manter tudo o que o Pokeidle já tem.
- Atualizar a instalação atual sem perder a conta que já está logada.
- Trazer do design o painel direito recolhível.

## Fora deste trabalho

- **Login em outro domínio.** O que sai do domínio do jogo continua abrindo no navegador, e pop-ups seguem
  bloqueados, então login por Google, Discord ou por um site de terceiros não funciona dentro do app. O Pedro
  aceitou essa limitação.
- **Detectar login em outros jogos.** Sem adaptador, o app não sabe se a pessoa está logada.
- **Editar um grupo.** Para corrigir nome ou URL, remove-se o grupo e cria-se de novo.
- **Dois jogos no mesmo site.** Um segundo grupo com o mesmo endereço é recusado, mesmo com caminho diferente.
- **Recolher um grupo pela seta.** A seta do cabeçalho continua sem ação, como hoje.
- **O cartão do topo da lateral.** O design mostra "Principal"; o app continua com "Todas as contas".

## O que nunca pode acontecer

- A conta atual perder o login, ou o app recusar abrir, depois da atualização.
- A sessão de uma conta vazar para outra, de qualquer grupo.
- Um site qualquer ser tratado como Pokeidle, ou o Pokeidle escapar do limite de 4 contas.
- Abrir um modal recarregar um jogo.
- Enfraquecer as proteções atuais por causa de jogos desconhecidos (sandbox, downloads, permissões, pop-ups).

## O que muda na interface

Decisões do Pedro, conforme o design:

**Barra lateral.** O botão "+ Adicionar conta" vira "+ Novo grupo de jogo" e nunca fica desativado. O formulário
embutido na lateral sai. O "+" de cada grupo abre o modal "Adicionar conta". O grupo da conta selecionada tem a
borda de destaque e os outros, a borda comum. Cada grupo tem um ponto de cor próprio: amarelo no Pokeidle e os
demais na sequência `#a78bfa`, `#22d3ee`, `#f472b6`, `#34d399`, `#fb923c`, `#60a5fa`.

**Modal "Novo grupo de jogo".**

- Texto: "Um grupo reúne as contas de um mesmo jogo. Cada conta abre numa tela própria, com login separado."
- "Nome do jogo": exemplo "Ex.: PokeIdle", até 24 caracteres.
- "URL do jogo": exemplo `https://pokeidle.io/`, com a dica "Cole o endereço que você abre no navegador para
  jogar."
- "Nome da primeira conta": exemplo "Ex.: Principal", até 24 caracteres, já preenchido com "Principal".
- Botões "Cancelar" e "Criar grupo".

**Modal "Adicionar conta".**

- Texto: "A conta entra no grupo X e abre host com login separado."
- "Nome da conta": até 24 caracteres, já preenchido com a sugestão atual (`suggestName`).
- Botões "Cancelar" e "Adicionar conta".

**Nos dois modais.** Fecham pelo X, por "Cancelar", por Esc e por um clique fora. O primeiro campo recebe o foco
com o texto selecionado. Depois de criar, a conta nova fica selecionada e, se a disposição for "uma tela", volta
para a grade.

**Painel direito recolhível.** O cabeçalho do painel da conta ganha "Recolher painel da conta". Com o painel
fechado, o topo da grade mostra "Mostrar painel" à direita, ao lado de "Mostrar contas" quando a lateral também
estiver fechada. A escolha fica salva.

**Grade.** Uma coluna com 1 tela, duas até 4 telas e três a partir de 5, como no design. A partir de 10 telas,
quatro colunas. Não há rolagem: as telas encolhem para caber, e o `min-height` de `.game` sai, porque as views são
nativas e o CSS não as corta, então uma tela maior que o espaço invadiria a linha de baixo e a barra de status. O
uso esperado é de cerca de 4 contas por grupo, então telas muito pequenas são aceitáveis com muitas contas.

## Como validar a URL

Regras do design, com as mesmas mensagens:

1. Sem esquema, recebe `https://`.
2. Se não for uma URL: "Esse endereço não parece uma URL. Exemplo: https://pokeidle.io/".
3. Se não for `http`/`https`, ou se o host não tiver ponto: "Use um endereço de site, começando com https://".

Acrescentadas agora:

4. O mesmo site de um grupo existente, comparando o host sem `www.`: "Já existe um grupo para esse site".
5. URL com usuário ou senha embutidos é recusada com a mensagem da regra 2, porque o app nunca guarda senha.
6. Nome de jogo vazio marca o campo como inválido. Nome igual ao de outro grupo mostra "Já existe um grupo com
   esse nome". Nome de conta vazio ou repetido no grupo segue a regra atual.

A mesma validação roda na interface, para mostrar as mensagens, e no processo principal, que ignora e registra
no console um comando inválido.

## Dados

O arquivo passa para a versão 2:

```ts
interface StoredGame { id: GameId; name: string; startUrl: string }

interface AppData {
  version: 2;
  games: StoredGame[];             // na ordem de criação, que é a ordem da lateral
  accounts: StoredAccount[];
  nicks: Record<string, string[]>;
  preferences: Preferences;        // ganha panelOpen: boolean
}
```

`Game` deixa de vir de uma lista fixa e passa a ser montado de `StoredGame`. `accountLimit` passa a aceitar
`null`, que significa sem limite. `sessionKey` continua existindo.

**Migração da versão 1, automática na leitura:**

- Cria `games` com o PokeIdle se houver conta ou nick do `pokeidle`, e vazio caso contrário. O id continua
  `pokeidle` e o nome é "PokeIdle".
- Define `panelOpen: true`.
- Antes da primeira gravação na versão 2, salva uma cópia do arquivo original como `data.v1.json`.
- Uma conta da versão 1 com outro `gameId` torna o arquivo inválido, e o app recusa abrir como já faz hoje.
- Os ids de jogo e de conta não mudam, e por isso as partições e os logins continuam valendo.

Na instalação nova, `games` começa vazio.

**Partições.** O formato `persist:<gameId>-<accountId>` é mantido, porque o login atual depende dele. Com nomes
livres ele fica ambíguo: o jogo `foo` com a conta `bar-baz` e o jogo `foo-bar` com a conta `baz` cairiam na mesma
partição. Ao criar uma conta, o app precisa garantir que a partição dela seja diferente da de qualquer outra.

## Reconhecer o Pokeidle

Uma tabela no código guarda o que só vale para jogos conhecidos. Hoje ela só tem o Pokeidle: host `pokeidle.io`,
`startUrl` `https://pokeidle.io/app`, limite 4 e `sessionKey` `sessao`.

- Uma URL cujo host é `pokeidle.io` ou um subdomínio dele cria o jogo com id `pokeidle`, seja qual for o nome
  digitado. Sem isso, `www.pokeidle.io` ou `app.pokeidle.io` viraria um jogo comum e escaparia do limite.
- O caminho colado é ignorado e o app usa o `startUrl` da tabela, porque a raiz do site não é a tela do jogo.
- O id `pokeidle` fica reservado: um jogo de outro site com esse nome recebe outro id, porque o adaptador é
  escolhido pelo id.
- `IDLEMANAGER_GAME_URL` continua apontando o Pokeidle para o jogo falso dos testes.

Os outros jogos recebem o id do nome (mesma regra de `slugify`, com `jogo` se ficar vazio), único entre os jogos.

## O que cada jogo tem

| | Pokeidle | Outros jogos |
|---|---|---|
| Limite de contas | 4 | Nenhum |
| Bloqueio do 5º nick | Sim | Não |
| Texto do status | "conectada" | "aberta" |
| Tela de login, login expirado e sessão tomada | Detecta | Não detecta |
| Travamento, crash e falha de carga | Detecta | Detecta |
| Fora do domínio do jogo | Abre no navegador | Abre no navegador |
| Outros hosts do mesmo domínio | Saem para o navegador | Ficam dentro |
| Redirecionamento para fora ao carregar | Como hoje | Aviso na tela da conta |
| Pop-ups, downloads, permissões, sandbox | Como hoje | Como hoje |
| Bloqueio de suspensão com a conta aberta | Sim | Sim |

**Status "aberta".** Internamente a conta continua `connected`, que é o que o adaptador genérico já produz. Só o
texto muda, e isso dá de graça o bloqueio de suspensão e o "Tudo certo". `AccountView` precisa informar se o jogo
sabe ler a sessão, para `statusText` escolher a palavra.

**Hosts.** Nos outros jogos fica dentro o domínio inteiro da URL. Colar `app.jogo.com/painel` deixa dentro
`jogo.com`, `auth.jogo.com` e qualquer outro subdomínio, porque é comum o login de um jogo ficar em outro host do
mesmo domínio. O domínio são os dois últimos rótulos do host, ou os três últimos quando o penúltimo tem até 3
letras e o último tem 2, como em `jogo.com.br`. A regra pode errar para menos, nunca para `com.br` inteiro. Um
host que é só um IP vale exatamente como está. No Pokeidle a regra exata de hoje não muda: `sub.pokeidle.io`
continua indo para o navegador. Um grupo criado com `http://` aceita `http` nos próprios hosts, porque sem isso o
jogo nunca carregaria.

**Redirecionamento para fora.** Hoje, uma saída sem clique recente é cancelada em silêncio. Num jogo sem adaptador
isso deixaria a conta parada numa página vazia, marcada como "aberta" e sem explicação. Por isso, nos outros
jogos:

- Se a página inicial for desviada para outro domínio antes de terminar de carregar, a conta vai para `down`, com
  a mensagem "Esse jogo levou para host. Crie o grupo com esse endereço." e a ação "Tentar de novo". Sem novas
  tentativas automáticas, porque o resultado seria o mesmo.
- Depois que a página carregou, uma saída sem clique continua cancelada, e o histórico da conta registra
  "Saída para host bloqueada". O jogo segue rodando.

**Limite no Pokeidle.** Com 4 contas, o "+" do grupo fica desativado, com o título "Limite de 4 contas do
PokeIdle".

## Modal sobre os jogos

As telas dos jogos são views nativas, que ficam acima de qualquer HTML da janela, e a regra do projeto é só
mostrar HTML sobre uma tela escondida. Por isso, enquanto um modal estiver aberto, todas as views da janela
principal ficam escondidas com `setVisible(false)`. Elas voltam ao fechar. Nada recarrega, e a página continua
rodando porque `backgroundThrottling` é `false`. Janelas destacadas não são afetadas.

Ao abrir o modal, o foco do teclado precisa ir para a interface, porque ele pode estar dentro de um jogo. Esc
fecha só o modal e não sai da disposição "uma tela". Atalhos Ctrl+1 a Ctrl+9 com o modal aberto não devem mostrar
nenhuma view.

## Remover grupo

O menu "…" do grupo fica com "Ligar todas", "Desligar todas", um separador e "Remover grupo".

- Diálogo nativo com "Remover" e "Cancelar", e "Cancelar" como padrão, igual à remoção de conta.
- Mensagem: `Remover o grupo "X"?`. Detalhe: quantas contas e logins saem deste computador, e que nada muda nas
  contas do jogo. No Pokeidle, avisa também que os nicks usados seguem contando no limite.
- Para as contas, fecha janelas destacadas e aberturas na fila, e apaga armazenamento e cache de cada partição.
- Tira o jogo e as contas. A seleção vai para a primeira conta restante.
- **Os nicks ficam guardados**, ao contrário de "Remover conta", que libera o nick. Por isso a remoção do grupo
  não pode ser uma repetição de `removeAccount`. Quem recriar o grupo e logar com um nick antigo reassocia esse
  nick à conta nova, e "Remover conta" volta a poder liberá-lo.

"Remover conta" não muda. Remover a última conta deixa o grupo vazio na lateral, com a URL guardada.

## Telas vazias

- Sem nenhum grupo: "Crie seu primeiro grupo" e o botão "Novo grupo de jogo".
- Com grupo e sem contas: "Adicione sua primeira conta" e "Nova conta", que abre o modal "Adicionar conta".

## Chamadas minhas, para o Pedro conferir

Estas não vieram dele:

- Esconder as views durante o modal, em vez de uma camada nativa por cima. É menos código e segue a regra do
  projeto, mas os jogos somem da tela enquanto o modal estiver aberto. Trocar depois exige uma página própria para
  o modal.
- O zoom da grade, calculado para os 828 px do Pokeidle, vale para todos os jogos. Trocar depois exige zoom por
  jogo. A disposição "uma tela" e a janela destacada seguem em 100%.
- Colar qualquer caminho de `pokeidle.io` cria o jogo com o endereço certo.
- O domínio inteiro fica dentro nos outros jogos.
- O aviso na tela da conta quando um jogo redireciona para outro domínio ao carregar.
- Telas encolhem para caber, sem rolagem, com quatro colunas a partir de 10 telas.
- Nome de grupo repetido é recusado.
- A cópia `data.v1.json` antes da migração.
- Versão 0.2.0, para o `apt` tratar o pacote novo como atualização.
- Abrir o Histórico ou as Configurações com o painel recolhido reabre o painel.

## Critério de pronto

- Uma cópia dos dados da versão 1, com sessão salva na partição, abre na versão nova com a conta logada.
- Criar um grupo com uma URL que não é do Pokeidle abre a página, e duas contas dele não compartilham
  `localStorage`.
- Uma URL de `pokeidle.io` ativa o adaptador, o limite e o bloqueio do 5º nick, e um segundo grupo no mesmo site é
  recusado.
- Um site qualquer com o nome "Pokeidle" não recebe o adaptador.
- Um jogo que redireciona para outro domínio ao carregar mostra o aviso, em vez de ficar parado.
- Grupos cujos ids se confundiriam na partição não compartilham sessão.
- Abrir e fechar um modal não recarrega nenhum jogo.
- Remover um grupo apaga sessões e contas, e preserva os nicks.
- Os testes unitários e e2e passam, e os testes novos são provados com bugs plantados.
- Atualizar `docs/acceptance.md` (nome do botão e o link para a PRD, que não existe no repositório) e as linhas
  "Jogos" e "Fora da v1" do design anterior.

O teste de aceitação de 1 hora roda depois disso, no pacote novo.

## Deixado para quem construir

- Nomes dos comandos, dos arquivos novos e de como o modal se organiza em componentes.
- Como garantir a partição única, desde que os ids já salvos não mudem.
- Se a migração grava logo na abertura ou na primeira alteração, desde que a cópia venha antes.
- O texto exato do detalhe do diálogo de remoção.
- Quais eventos o histórico registra ao criar grupo e conta (o design usa "Grupo X criado" e "Conta adicionada").
