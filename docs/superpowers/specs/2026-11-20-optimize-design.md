# Otimizar contas

Acrescenta ao [design de 2026-11-02](2026-11-02-game-groups-design.md). Mudança pequena: este documento registra o
que foi combinado com o Pedro na conversa de 2026-11-20.

## Intenção

Com o tempo, a página de cada conta acumula memória: no teste de aceitação, cada conta foi de cerca de 270 MB para
560 MB em uma hora. O Pedro quer um botão que feche o processo da página e abra de novo, liberando essa memória, e
quer poder deixar isso automático, escolhendo de quantas em quantas horas acontece.

## Objetivos

- Um botão "Otimizar" no painel da conta, que age só na conta aberta no painel.
- Otimização automática configurada por conta, com o intervalo em horas.
- Um modal para configurar, com atalhos de tempo, um valor personalizado e um botão para replicar a configuração.
- Ver o efeito no histórico da conta.

## Fora deste trabalho

- **O processo de vídeo do Electron.** Ele é dividido entre todas as contas e chegou a 430 MB. Otimizar uma conta não
  o libera. Só fechar o app inteiro libera.
- **Otimizar por limite de memória** em vez de por tempo. O Pedro pediu horas.
- **Otimizar todas as contas com um clique.** O botão é por conta. O que se replica é a configuração.

## O que nunca pode acontecer

- A conta perder o login ao ser otimizada.
- O automático reiniciar uma conta enquanto o Pedro joga nela.
- Todas as contas reiniciarem juntas.
- Uma otimização deixar a conta presa fora do ar.

## Como funciona

**Abordagem escolhida pelo Pedro: A, reiniciar o processo da página.** É o mesmo caminho que a 0.2.1 usa para uma
página travada: o processo da conta é morto e a página do jogo carrega de novo, na mesma tela. A janela destacada, a
partição e o login continuam. A conta fica fora por cerca de 5 a 10 segundos.

Alternativas descartadas:

| | Por que não |
|---|---|
| B. Recriar a conta inteira, como Desligar e Ligar | Mesmo efeito na memória, mas fecha a janela destacada, entra na fila de abertura e pisca a tela. |
| C. Recarregar, como o botão atual | O processo continua, então só parte da memória é liberada. Não resolve o pedido. |

**O botão (decisão do Pedro).** "Otimizar" fica na fileira de baixo do painel, que passa a ter 4 botões: Foco,
Otimizar, Desligar e Mais. Ele age só na conta aberta e funciona também com a conta destacada. Fica desativado quando
a conta não tem página, ou seja, desligada, caída ou bloqueada, e enquanto ela já está reiniciando. A proteção de uso
recente não vale para o botão, porque é você quem está pedindo.

**O histórico (proposta aprovada).** Depois da otimização, a conta registra "Otimizada · liberou 290 MB". O número é a
memória da conta antes da otimização menos a primeira medida depois que a página voltou, e nunca fica negativo. Uma
otimização automática registra "Otimizada sozinha · liberou 290 MB".

**O automático, por conta (decisão do Pedro).** Cada conta tem o próprio intervalo, ou nenhum. O tempo conta desde a
última vez que o processo da página dela começou: ao abrir, ao reiniciar por falha ou ao ser otimizada. Ele não é
salvo, porque abrir o app abre todas as contas do zero.

**Quando o automático espera (propostas aprovadas):**

- **Uso recente:** espera se a conta recebeu um clique ou uma tecla nos últimos 5 minutos.
- **Conta sem página:** não otimiza conta desligada, caída, bloqueada ou que já está carregando ou reiniciando. Conta
  esperando login otimiza normalmente.
- **Uma por vez:** duas otimizações automáticas ficam a pelo menos 1 minuto uma da outra, para as contas não
  reiniciarem juntas.

**A linha do painel (proposta aprovada).** Abaixo dos gráficos de consumo:

```
Otimização automática: a cada 6 h · próxima às 14:30   Configurar
Otimização automática: desligada                       Configurar
```

Quando a hora já passou e a conta está em uso, a linha diz "esperando a conta ficar parada".

**O modal (decisão do Pedro, com valores propostos):**

```
Otimização automática — Conta 2
[x] Otimizar sozinha
    A cada:  [1 h] [2 h] [4 h] [6 h] [12 h] [24 h]
             Personalizado [   ] horas
[ Aplicar às outras contas ]                 [Cancelar] [Salvar]
```

- **Atalhos:** 1, 2, 4, 6, 12 e 24 horas. O atalho escolhido fica marcado.
- **Personalizado:** aceita horas inteiras de 1 a 72. Fora disso, o campo mostra "Use de 1 a 72 horas" e Salvar não
  faz nada. Escolher um atalho limpa o campo, e digitar no campo desmarca os atalhos.
- **Desmarcado:** com "Otimizar sozinha" desmarcado, os atalhos e o campo ficam desativados, e a conta fica sem
  intervalo.
- **"Aplicar às outras contas":** grava a configuração mostrada nesta conta e em todas as outras contas do mesmo
  grupo, e fecha o modal. As outras ficam com o intervalo, mas cada uma segue contando desde a própria abertura.
- **Abertura e fechamento:** o modal abre pelo link "Configurar" e fecha como os outros modais (X, Cancelar, Esc ou
  clique fora).

**Dados.** `StoredAccount` ganha `autoOptimizeHours: number | null`. Um arquivo sem esse campo é lido como `null`, por
isso a versão do arquivo continua 2 e os dados de hoje abrem sem conversão. A 0.2.1 lê um arquivo com o campo novo e
o ignora.

## Critério de pronto

- Otimizar uma conta troca o processo dela e mantém o login, a janela destacada e as outras contas.
- O histórico mostra quanto foi liberado.
- O automático otimiza no tempo certo, espera o uso recente, nunca duas contas a menos de 1 minuto e nunca uma conta
  sem página.
- O modal grava os atalhos, o valor personalizado e o desligado, recusa valores fora de 1 a 72 e replica para o grupo.
- Um arquivo de dados de hoje, sem o campo, abre igual.
- Os testes unitários e e2e passam, e os novos são provados com bugs plantados.
- Um pacote novo para o Pedro instalar.

## Deixado para quem construir

- Onde a regra de "está na hora" vive, desde que seja uma função pura com teste próprio.
- Os nomes dos comandos, das funções e dos componentes.
- Como medir a memória antes e depois para o histórico.
- O que conta como clique ou tecla para a proteção de uso. Não pode ser o mesmo valor que se gasta ao abrir um link
  externo, porque esse é zerado a cada link aberto.
