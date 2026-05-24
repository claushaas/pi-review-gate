# Roadmap de Implementação — `pi-review-gate`

## 1. Premissas

### 1.1 Premissas confirmadas

- A extensão se chama `pi-review-gate`.
- A implementação será em TypeScript.
- O runtime alvo é o Pi Extension Runtime.
- O hook principal é `agent_end`.
- O comando principal é `/review-gate`.
- A configuração local fica em `~/.config/pi-review-gate/config.json`.
- O estado/auditoria de sessão usa `pi.appendEntry()`.
- O contexto primário do review é `event.messages`.
- A extensão não deve enviar a sessão inteira por default.
- O session slice, quando usado, deve ser filtrado desde a última mensagem real do usuário.
- O reviewer deve retornar JSON estruturado e validado.
- O modo default é `block`.
- O limite default de correções é `2`.
- Em modo `block`, reprovação injeta follow-up obrigatório.
- Em modo `warn`, reprovação apenas notifica e registra resultado.
- O follow-up injetado deve conter `[pi-review-gate:correction-request]`.
- A coleta Git usa apenas comandos fixos:
  - `git status --short`
  - `git diff --stat`
  - `git diff`
- Biome será usado para lint/format.
- Vitest será usado para testes.
- `index.ts` deve permanecer fino.
- `model.ts` deve ser a única camada autorizada a chamar modelo.

### 1.2 Premissas técnicas adotadas

- A validação de schema será manual, sem dependências extras, conforme recomendação arquitetural.
- Mocks do runtime Pi serão mantidos dentro dos arquivos de teste existentes.
- O client real do modelo será encapsulado em `model.ts`, permitindo ajuste posterior conforme a API real do Pi.
- A reconstrução de estado via `session_start` pode ser implementada como suporte, mas a V1 permanece centrada em `agent_end`.
- A tensão entre marcadores será resolvida usando `[pi-review-gate:correction-request]`, pois é o marcador exigido pela arquitetura e pelos contratos de qualidade.

### 1.3 Fora de escopo

- Bloqueio visual da primeira resposta final do agente.
- Integração com CI externo.
- Revisão multi-agente.
- Revisão incremental durante cada tool call.
- Análise semântica profunda de todo o repositório.
- Descoberta automática completa de documentação relevante.
- Políticas diferentes por tipo de task.
- Dashboard TUI avançado.
- Histórico analítico de revisões.
- Scoring longitudinal de qualidade do agente.
- Leitura direta de `.env`.
- Execução de comandos arbitrários sugeridos pelo reviewer.

---

## 2. Critérios Globais de Conclusão

A V1 estará concluída quando:

- A extensão carregar via `/reload`.
- `src/index.ts` registrar a extensão, comandos e hook `agent_end` sem conter lógica pesada.
- `/review-gate` funcionar como comando principal.
- `/review-gate-status`, `/review-gate-model`, `/review-gate-on` e `/review-gate-off` estiverem disponíveis.
- A configuração local for carregada de `~/.config/pi-review-gate/config.json`.
- Config parcial for mesclada com defaults.
- Config inválida for rejeitada.
- O hook `agent_end` executar review automaticamente quando habilitado.
- O contexto incluir `event.messages`.
- O contexto incluir a última resposta do assistente.
- O session slice for filtrado desde a última mensagem real do usuário.
- A extensão não enviar a sessão inteira por default.
- A coleta Git funcionar para status, diff stat e diff.
- Diretórios não-Git não reprovarem automaticamente.
- Diffs grandes forem truncados com marcador explícito.
- O modelo revisor for configurável e separado do modelo principal.
- Ausência de modelo revisor gerar aviso e entrada `pi-review-gate-skipped`, sem bloquear.
- O reviewer retornar JSON estruturado validado.
- JSON inválido com `failClosedOnInvalidJson = true` reprovar de forma fail-closed.
- Resultado aprovado não gerar follow-up.
- Resultado reprovado em modo `block` gerar follow-up obrigatório.
- Resultado reprovado em modo `warn` não gerar follow-up.
- Follow-ups conterem `[pi-review-gate:correction-request]`.
- O limite máximo default de `2` ciclos ser respeitado.
- A extensão não entrar em loop infinito.
- Resultados serem persistidos via `pi.appendEntry()`.
- Falhas de Git, modelo, timeout e JSON inválido serem tratadas.
- `pnpm test` ou equivalente passar.
- `biome check .` passar.

---

## 3. Estratégia de Implementação

A implementação deve seguir uma progressão de baixo acoplamento:

1. Bootstrap do pacote e estrutura mínima.
2. Tooling: TypeScript, Biome e Vitest.
3. Tipos, constantes e contratos centrais.
4. Configuração local, defaults e validação.
5. Módulos puros: utils, schema, state, serialization, context, git, follow-up.
6. Testes unitários por módulo.
7. Abstração de modelo em `model.ts`.
8. Reviewer e prompts.
9. Orquestração do fluxo `agent_end`.
10. Comandos.
11. Persistência via `pi.appendEntry()`.
12. Testes integration-style com mocks do Pi.
13. Hardening, documentação e validação manual.

---

## 4. Roadmap Faseado

## Phase 1 — Bootstrap do package TypeScript

### Objetivo

Criar a base mínima do pacote `pi-review-gate`.

### Escopo

Estrutura de diretórios, `package.json` e entrypoint inicial.

### Entregáveis

- Estrutura alvo criada.
- Manifest inicial.
- `src/index.ts` mínimo.

### Etapas

#### Step 1.1 — Criar estrutura do pacote

**Objetivo:**  
Criar a árvore de arquivos prevista sem implementar lógica de domínio.

**Ações:**
- Criar `src/`, `tests/` e `examples/`.
- Criar arquivos vazios ou mínimos conforme estrutura alvo.
- Criar `package.json` com nome `pi-review-gate`.

**Arquivos prováveis:**
- `package.json`
- `src/index.ts`
- `src/commands.ts`
- `src/config.ts`
- `src/constants.ts`
- `src/context.ts`
- `src/follow-up.ts`
- `src/git.ts`
- `src/model.ts`
- `src/reviewer.ts`
- `src/schema.ts`
- `src/serialization.ts`
- `src/state.ts`
- `src/types.ts`
- `src/utils.ts`
- `tests/*.test.ts`
- `examples/config.example.json`

**Critérios de aceite:**
- Estrutura alvo existe.
- Nenhum arquivo fora da estrutura alvo é necessário.
- `package.json` declara o pacote como ESM.
- Campo `pi.extensions` aponta para `./src/index.ts`.

**Testes esperados:**
- Manual validation: verificar árvore de arquivos.
- Manual validation: validar que o manifest aponta para o entrypoint correto.

**Dependências:**
- Nenhuma.

#### Step 1.2 — Criar entrypoint fino inicial

**Objetivo:**  
Garantir que `index.ts` seja apenas ponto de conexão.

**Ações:**
- Exportar factory default da extensão.
- Preparar chamada para registro de comandos.
- Preparar registro futuro de `agent_end` sem lógica embutida.

**Arquivos prováveis:**
- `src/index.ts`
- `src/commands.ts`
- `src/state.ts`

**Critérios de aceite:**
- `index.ts` permanece fino.
- Nenhuma lógica de review é implementada no entrypoint.
- O arquivo pode ser importado sem efeitos colaterais inesperados.

**Testes esperados:**
- Integration-style: import do entrypoint em `tests/index.test.ts`.
- Manual validation: inspeção de que `index.ts` não contém lógica pesada.

**Dependências:**
- Step 1.1.

## Phase 2 — Configuração de Biome, TypeScript e Vitest

### Objetivo

Preparar tooling de build, lint, format e testes.

### Escopo

`tsconfig.json`, `biome.json`, `vitest.config.ts` e scripts.

### Entregáveis

- TypeScript configurado.
- Biome configurado.
- Vitest configurado.
- Scripts de qualidade disponíveis.

### Etapas

#### Step 2.1 — Configurar TypeScript

**Objetivo:**  
Permitir desenvolvimento TypeScript em ESM.

**Ações:**
- Criar `tsconfig.json`.
- Configurar ambiente Node/ESM compatível com Pi Extension Runtime.
- Garantir `strict` quando possível.

**Arquivos prováveis:**
- `tsconfig.json`
- `package.json`

**Critérios de aceite:**
- TypeScript reconhece arquivos em `src/` e `tests/`.
- O projeto não exige transpilação custom fora do escopo.

**Testes esperados:**
- Manual validation: executar typecheck, se script for incluído.
- Manual validation: importar arquivos TypeScript sem erro de módulo.

**Dependências:**
- Phase 1.

#### Step 2.2 — Configurar Biome

**Objetivo:**  
Aplicar lint e formatting padronizados.

**Ações:**
- Criar `biome.json`.
- Ativar formatter.
- Ativar linter recomendado.
- Incluir regra `useImportType`.
- Adicionar scripts `check`, `check:fix`, `format` e `lint`.

**Arquivos prováveis:**
- `biome.json`
- `package.json`

**Critérios de aceite:**
- `biome check .` executa.
- Config usa indentação de 2 espaços.
- Import type é exigido.

**Testes esperados:**
- Manual validation: `biome check .`.

**Dependências:**
- Step 2.1.

#### Step 2.3 — Configurar Vitest

**Objetivo:**  
Preparar suíte de testes unitários e integration-style.

**Ações:**
- Criar `vitest.config.ts`.
- Configurar ambiente `node`.
- Incluir `tests/**/*.test.ts`.
- Adicionar scripts `test` e `test:watch`.

**Arquivos prováveis:**
- `vitest.config.ts`
- `package.json`
- `tests/index.test.ts`

**Critérios de aceite:**
- `pnpm test` ou equivalente executa.
- Testes vazios/mínimos rodam sem erro de configuração.

**Testes esperados:**
- Unit: teste smoke inicial.
- Manual validation: execução do runner.

**Dependências:**
- Step 2.1.

## Phase 3 — Tipos e constantes

### Objetivo

Definir os contratos internos usados pelos demais módulos.

### Escopo

Tipos centrais e constantes globais.

### Entregáveis

- Tipos de config.
- Tipos de resultado.
- Tipos de contexto.
- Constantes de comandos, marker, entries e defaults.

### Etapas

#### Step 3.1 — Definir tipos centrais

**Objetivo:**  
Criar os tipos compartilhados sem dependência do runtime Pi.

**Ações:**
- Definir `ReviewGateMode`.
- Definir `ThinkingLevel`.
- Definir `ReviewerModelConfig`.
- Definir `ReviewGateConfig`.
- Definir `ReviewGateResult`.
- Definir `ReviewContext`.
- Definir `RuntimeState`.

**Arquivos prováveis:**
- `src/types.ts`

**Critérios de aceite:**
- Tipos cobrem o schema da SPEC.
- Nenhum tipo chama APIs do Pi diretamente.
- Não há dependência circular.

**Testes esperados:**
- Manual validation: typecheck.
- Unit: testes posteriores importam tipos sem dependências runtime.

**Dependências:**
- Phase 2.

#### Step 3.2 — Definir constantes globais

**Objetivo:**  
Centralizar strings e defaults normativos.

**Ações:**
- Definir nome da extensão.
- Definir comandos `/review-gate*`.
- Definir `[pi-review-gate:correction-request]`.
- Definir nomes de `appendEntry`.
- Definir limites default de ciclos e truncamento.

**Arquivos prováveis:**
- `src/constants.ts`
- `src/types.ts`

**Critérios de aceite:**
- Marker único é usado por todos os módulos.
- Defaults numéricos seguem SPEC.
- Nomes de entries são:
  - `pi-review-gate-result`
  - `pi-review-gate-skipped`
  - `pi-review-gate-final-failure`

**Testes esperados:**
- Unit: import de constantes em testes de state/follow-up.
- Manual validation: inspeção contra SPEC.

**Dependências:**
- Step 3.1.

## Phase 4 — Config local e defaults

### Objetivo

Implementar configuração local persistente com defaults.

### Escopo

`defaultConfig`, load, merge, save e exemplo.

### Entregáveis

- Config default.
- Load com fallback.
- Merge parcial com defaults.
- Save com permissão restrita quando possível.
- Exemplo de config.

### Etapas

#### Step 4.1 — Definir `defaultConfig`

**Objetivo:**  
Materializar os defaults da SPEC.

**Ações:**
- Criar `defaultConfig`.
- Garantir `enabled: true`.
- Garantir `mode: "block"`.
- Garantir `reviewerModel: null`.
- Garantir `maxCorrectionCycles: 2`.
- Garantir defaults de contexto, Git, reviewer e UI.

**Arquivos prováveis:**
- `src/config.ts`
- `src/types.ts`
- `src/constants.ts`
- `examples/config.example.json`

**Critérios de aceite:**
- Defaults correspondem à SPEC.
- `examples/config.example.json` reflete config final esperada.

**Testes esperados:**
- Unit: default quando arquivo não existe.
- Unit: valores default de `maxCorrectionCycles`, Git e reviewer.

**Dependências:**
- Phase 3.

#### Step 4.2 — Implementar load, merge e save

**Objetivo:**  
Persistir configuração local em `~/.config/pi-review-gate/config.json`.

**Ações:**
- Resolver path default.
- Carregar JSON quando existir.
- Mesclar config parcial com defaults.
- Salvar config válida.
- Criar diretório quando necessário.
- Aplicar permissão `0600` quando possível.

**Arquivos prováveis:**
- `src/config.ts`
- `tests/config.test.ts`

**Critérios de aceite:**
- Config ausente retorna defaults.
- Config parcial preserva defaults não informados.
- Save grava JSON válido.
- Falhas de filesystem são propagadas de forma clara.

**Testes esperados:**
- Unit: merge de config parcial com defaults.
- Unit: config ausente.
- Unit: salvar config válida.

**Dependências:**
- Step 4.1.

## Phase 5 — Validação de schemas

### Objetivo

Garantir que config e resultado do reviewer sejam validados antes de uso.

### Escopo

Validação manual em `schema.ts`.

### Entregáveis

- `validateConfig`.
- `parseReviewGateResult`.
- `safeParseReviewGateResult`.

### Etapas

#### Step 5.1 — Validar configuração

**Objetivo:**  
Rejeitar configurações inválidas antes de afetarem o runtime.

**Ações:**
- Validar `enabled`.
- Validar `mode`.
- Validar `reviewerModel`.
- Validar limites numéricos.
- Validar flags de contexto, Git, reviewer e UI.

**Arquivos prováveis:**
- `src/schema.ts`
- `src/config.ts`
- `tests/schema.test.ts`
- `tests/config.test.ts`

**Critérios de aceite:**
- Config inválida não é aceita silenciosamente.
- Mensagens de erro indicam campo inválido.
- Config válida retorna objeto normalizado.

**Testes esperados:**
- Unit: config inválida.
- Unit: `mode` inválido.
- Unit: `maxCorrectionCycles` inválido.

**Dependências:**
- Phase 4.

#### Step 5.2 — Validar `ReviewGateResult`

**Objetivo:**  
Impedir ação sobre resposta malformada do modelo.

**Ações:**
- Validar `approved`.
- Validar `severity`.
- Validar `summary`.
- Validar arrays de correções e evidências.
- Validar `confidence`.

**Arquivos prováveis:**
- `src/schema.ts`
- `tests/schema.test.ts`

**Critérios de aceite:**
- Resultado completo e válido é aceito.
- Campos ausentes causam falha.
- `severity` inválida causa falha.
- `approved` é a única regra de aprovação.

**Testes esperados:**
- Unit: parse de JSON válido.
- Unit: resultado sem campos obrigatórios.
- Unit: severity inválida.

**Dependências:**
- Step 5.1.

#### Step 5.3 — Implementar safe parse de JSON

**Objetivo:**  
Converter resposta textual do modelo em resultado validado.

**Ações:**
- Fazer parse seguro.
- Rejeitar JSON inválido.
- Rejeitar prose/markdown quando não houver objeto JSON válido.
- Retornar erro estruturado.

**Arquivos prováveis:**
- `src/schema.ts`
- `src/utils.ts`
- `tests/schema.test.ts`

**Critérios de aceite:**
- JSON válido retorna `{ ok: true }`.
- JSON inválido retorna `{ ok: false }`.
- Nenhuma ação externa ocorre dentro de `schema.ts`.

**Testes esperados:**
- Unit: parse de JSON válido.
- Unit: JSON inválido com `failClosedOnInvalidJson = true` coberto em fases posteriores.
- Unit: resposta com markdown/prose rejeitada ou extraída conforme política definida.

**Dependências:**
- Step 5.2.

## Phase 6 — Estado runtime e controle de ciclos

### Objetivo

Controlar concorrência, prompt real, prompt injetado e ciclos.

### Escopo

`state.ts` puro, sem filesystem.

### Entregáveis

- `createRuntimeState`.
- Detecção de marker.
- Atualização de ciclo.
- Controle de `activeReview`.

### Etapas

#### Step 6.1 — Criar estado runtime

**Objetivo:**  
Inicializar estado em memória conforme arquitetura.

**Ações:**
- Implementar `createRuntimeState`.
- Inicializar `activeReview: false`.
- Inicializar `correctionCycle: 0`.
- Inicializar `lastOriginalUserPromptHash: null`.
- Inicializar `lastReviewResult: null`.

**Arquivos prováveis:**
- `src/state.ts`
- `tests/state.test.ts`

**Critérios de aceite:**
- Estado inicial é determinístico.
- Módulo não usa filesystem.
- Módulo não depende do Pi runtime.

**Testes esperados:**
- Unit: estado inicial.

**Dependências:**
- Phase 3.

#### Step 6.2 — Detectar prompt injetado

**Objetivo:**  
Distinguir mensagens reais de usuário de follow-ups da extensão.

**Ações:**
- Implementar `isReviewGateInjectedText`.
- Usar marker `[pi-review-gate:correction-request]`.
- Tolerar texto vazio/desconhecido.

**Arquivos prováveis:**
- `src/state.ts`
- `src/constants.ts`
- `tests/state.test.ts`

**Critérios de aceite:**
- Prompt com marker é detectado.
- Prompt sem marker é tratado como prompt real.
- A detecção não depende de role nem filesystem.

**Testes esperados:**
- Unit: detecção de prompt injetado.
- Unit: prompt real não é marcado como injetado.

**Dependências:**
- Step 6.1.

#### Step 6.3 — Atualizar ciclo por prompt

**Objetivo:**  
Resetar ciclos em prompt real e controlar correções.

**Ações:**
- Implementar atualização de ciclo.
- Resetar ciclo em novo prompt real.
- Incrementar/manter ciclo em prompt injetado conforme fluxo.
- Calcular hash do prompt real.

**Arquivos prováveis:**
- `src/state.ts`
- `src/utils.ts`
- `tests/state.test.ts`

**Critérios de aceite:**
- Novo prompt real zera ciclo.
- Prompt injetado não substitui `lastOriginalUserPromptHash`.
- Limite default de `2` pode ser avaliado pelo orquestrador.

**Testes esperados:**
- Unit: reset de ciclo em prompt real.
- Unit: prompt injetado incrementa ou preserva ciclo corretamente.
- Unit: limite máximo de 2 ciclos.

**Dependências:**
- Step 6.2.

#### Step 6.4 — Proteger contra reviews simultâneos

**Objetivo:**  
Evitar concorrência e recursão indevida.

**Ações:**
- Definir helpers ou contrato para `activeReview`.
- Garantir que orquestrador possa retornar cedo quando ativo.
- Garantir liberação via `finally` em fase de integração.

**Arquivos prováveis:**
- `src/state.ts`
- `tests/state.test.ts`
- `tests/index.test.ts`

**Critérios de aceite:**
- Estado permite bloquear review simultâneo.
- Nenhuma chamada de modelo ocorre quando `activeReview = true`.

**Testes esperados:**
- Unit: activeReview impede entrada concorrente.
- Integration-style: handler ignora quando já ativo.

**Dependências:**
- Step 6.3.

## Phase 7 — Serialização de mensagens

### Objetivo

Converter mensagens e entries do Pi em texto estável para o reviewer.

### Escopo

`serialization.ts` e utilitários de texto.

### Entregáveis

- `getMessageText`.
- `serializeMessages`.
- `serializeSessionEntries`.

### Etapas

#### Step 7.1 — Extrair texto de mensagens

**Objetivo:**  
Obter conteúdo textual sem depender de campos internos irrelevantes.

**Ações:**
- Implementar extração tolerante de conteúdo.
- Suportar formatos de mensagem de usuário e assistente.
- Suportar tool results quando disponíveis.

**Arquivos prováveis:**
- `src/serialization.ts`
- `tests/serialization.test.ts`

**Critérios de aceite:**
- Texto de user é extraído.
- Texto de assistant é extraído.
- Tool result tem conteúdo extraído.
- Formatos desconhecidos não quebram a serialização.

**Testes esperados:**
- Unit: serialização de user.
- Unit: serialização de assistant.
- Unit: serialização de toolResult.

**Dependências:**
- Phase 5.

#### Step 7.2 — Serializar mensagens do ciclo atual

**Objetivo:**  
Criar formato legível e estável para `event.messages`.

**Ações:**
- Gerar blocos `[message N]`.
- Incluir `role`.
- Incluir `tool` quando aplicável.
- Incluir `isError` quando aplicável.
- Preservar resposta final do assistente.

**Arquivos prováveis:**
- `src/serialization.ts`
- `tests/serialization.test.ts`

**Critérios de aceite:**
- Formato é estável.
- Roles relevantes aparecem.
- Tool result inclui tool e status de erro.
- Conteúdo grande pode ser truncado.

**Testes esperados:**
- Unit: serialização de user/assistant/toolResult.
- Unit: tolerância a formato desconhecido.
- Unit: truncamento de conteúdo grande.

**Dependências:**
- Step 7.1.

#### Step 7.3 — Serializar session entries

**Objetivo:**  
Serializar somente o slice filtrado, não a sessão inteira.

**Ações:**
- Implementar `serializeSessionEntries`.
- Reusar extração de texto.
- Evitar campos ruidosos.
- Aplicar truncamento quando necessário.

**Arquivos prováveis:**
- `src/serialization.ts`
- `tests/serialization.test.ts`

**Critérios de aceite:**
- Entries são serializadas de forma legível.
- Entries customizadas podem ser ignoradas ou representadas sem ruído.
- Módulo não busca branch por conta própria.

**Testes esperados:**
- Unit: serialização de entries.
- Unit: truncamento.
- Unit: formato desconhecido tolerado.

**Dependências:**
- Step 7.2.

## Phase 8 — Coleta de contexto do `agent_end`

### Objetivo

Montar o contexto textual da entrega atual.

### Escopo

Extração de prompt, última resposta, event messages e session slice.

### Entregáveis

- `extractCurrentUserPrompt`.
- `extractLatestAssistantResponse`.
- `collectSessionSliceSinceLastRealUserMessage`.
- `buildReviewContext`.

### Etapas

#### Step 8.1 — Extrair prompt atual e última resposta

**Objetivo:**  
Identificar os elementos principais do ciclo atual.

**Ações:**
- Extrair prompt atual a partir de `event.messages`.
- Extrair última mensagem do assistente.
- Usar serialização existente.

**Arquivos prováveis:**
- `src/context.ts`
- `src/serialization.ts`
- `tests/context.test.ts`

**Critérios de aceite:**
- Prompt atual vem de `event.messages`.
- Última resposta do assistente é detectada.
- Ausência de resposta retorna `null` sem quebrar.

**Testes esperados:**
- Unit: extração da última resposta do assistente.
- Unit: extração do prompt atual.
- Unit: ausência de assistant.

**Dependências:**
- Phase 7.

#### Step 8.2 — Filtrar session slice

**Objetivo:**  
Coletar contexto complementar desde a última mensagem real do usuário.

**Ações:**
- Obter branch via `ctx.sessionManager.getBranch()` quando disponível.
- Encontrar última mensagem user sem marker.
- Ignorar mensagens injetadas pela extensão.
- Respeitar `maxSessionEntries`.

**Arquivos prováveis:**
- `src/context.ts`
- `src/state.ts`
- `tests/context.test.ts`

**Critérios de aceite:**
- Session slice começa na última mensagem real do usuário.
- Prompt injetado não redefine o início do slice.
- A sessão inteira não é enviada por default.
- Limite de entries é respeitado.

**Testes esperados:**
- Unit: filtragem da session slice desde a última mensagem real do usuário.
- Unit: mensagem com marker ignorada como prompt real.
- Unit: aplicação de `maxSessionEntries`.

**Dependências:**
- Step 8.1.
- Phase 6.

#### Step 8.3 — Montar `ReviewContext`

**Objetivo:**  
Criar payload intermediário para prompt do reviewer.

**Ações:**
- Incluir current user prompt.
- Incluir serialized event messages quando habilitado.
- Incluir latest assistant response.
- Incluir serialized session slice quando habilitado.
- Incluir Git context recebido como parâmetro.

**Arquivos prováveis:**
- `src/context.ts`
- `src/types.ts`
- `tests/context.test.ts`

**Critérios de aceite:**
- `event.messages` é fonte primária.
- Git context é apenas incorporado, não coletado aqui.
- Config controla inclusão de session slice.
- Contexto é determinístico.

**Testes esperados:**
- Unit: usa `event.messages` como fonte primária.
- Unit: inclui ou omite session slice conforme config.
- Unit: monta contexto com Git indisponível.

**Dependências:**
- Step 8.2.

## Phase 9 — Coleta de Git

### Objetivo

Coletar evidências Git de forma segura e truncada.

### Escopo

`git.ts` usando apenas `pi.exec` com comandos fixos.

### Entregáveis

- `collectGitContext`.
- `isNotGitRepositoryError`.
- Truncamento com marker.

### Etapas

#### Step 9.1 — Executar comandos Git fixos

**Objetivo:**  
Coletar status, diff stat e diff conforme config.

**Ações:**
- Executar `git status --short`.
- Executar `git diff --stat`.
- Executar `git diff`.
- Respeitar flags `includeStatus`, `includeDiffStat`, `includeDiff`.
- Usar timeouts definidos.

**Arquivos prováveis:**
- `src/git.ts`
- `src/types.ts`
- `tests/git.test.ts`

**Critérios de aceite:**
- Apenas comandos Git fixos são executados.
- Flags de config controlam coleta.
- Nenhum argumento vem do modelo revisor.

**Testes esperados:**
- Unit: coleta Git bem-sucedida com mocks de `pi.exec`.
- Unit: comandos esperados são chamados.
- Unit: flags desabilitam coletas específicas.

**Dependências:**
- Phase 4.

#### Step 9.2 — Tratar diretório não-Git

**Objetivo:**  
Permitir review mesmo sem repositório Git.

**Ações:**
- Detectar erro “not a git repository”.
- Definir `unavailableReason`.
- Não lançar erro fatal nessa condição.
- Incluir mensagem de indisponibilidade no contexto.

**Arquivos prováveis:**
- `src/git.ts`
- `tests/git.test.ts`
- `src/context.ts`

**Critérios de aceite:**
- Diretório não-Git não reprova automaticamente.
- Reviewer recebe evidência de indisponibilidade.
- Outras falhas são tratadas conforme política de erro.

**Testes esperados:**
- Unit: diretório não-Git.
- Unit: stderr reconhecido por `isNotGitRepositoryError`.

**Dependências:**
- Step 9.1.

#### Step 9.3 — Truncar outputs Git

**Objetivo:**  
Controlar custo/tamanho do payload.

**Ações:**
- Aplicar limites de status, diff stat e diff.
- Inserir marker `[TRUNCATED: original length ..., included first ... chars]`.
- Centralizar truncamento em `utils.ts`.

**Arquivos prováveis:**
- `src/git.ts`
- `src/utils.ts`
- `tests/git.test.ts`

**Critérios de aceite:**
- Diff grande é truncado.
- Marker explicita tamanho original.
- Defaults são 12k, 12k e 60k.

**Testes esperados:**
- Unit: truncamento de diff.
- Unit: truncamento de status.
- Unit: saída pequena não recebe marker.

**Dependências:**
- Step 9.1.

## Phase 10 — Prompt do reviewer

### Objetivo

Construir prompts determinísticos para o modelo revisor.

### Escopo

System prompt, user prompt e payload textual.

### Entregáveis

- `buildReviewerSystemPrompt`.
- `buildReviewerUserPrompt`.

### Etapas

#### Step 10.1 — Implementar system prompt

**Objetivo:**  
Fixar instruções obrigatórias do reviewer.

**Ações:**
- Incluir papel de mandatory delivery reviewer.
- Exigir JSON only.
- Proibir prose/markdown fora do JSON.
- Reforçar foco em pedido, entrega, diff e validação.

**Arquivos prováveis:**
- `src/reviewer.ts`
- `tests/reviewer.test.ts`

**Critérios de aceite:**
- Prompt corresponde à SPEC.
- Não contém instruções para executar ações.
- Não introduz critérios fora do escopo.

**Testes esperados:**
- Unit: prompt contém “Return JSON only”.
- Unit: prompt contém regra de não aprovar trabalho incompleto.

**Dependências:**
- Phase 8.

#### Step 10.2 — Implementar user prompt com contexto

**Objetivo:**  
Montar prompt do reviewer com shape JSON e seções estáveis.

**Ações:**
- Incluir decision rules.
- Incluir schema esperado do JSON.
- Inserir `<context>`.
- Montar `# Review Context` com seções da SPEC.

**Arquivos prováveis:**
- `src/reviewer.ts`
- `src/context.ts`
- `tests/reviewer.test.ts`

**Critérios de aceite:**
- Prompt contém shape completo de `ReviewGateResult`.
- Prompt contém current user prompt, event messages, latest assistant response, session slice e Git.
- Prompt não inclui sessão inteira por default.

**Testes esperados:**
- Unit: monta prompt com seções esperadas.
- Unit: inclui Git Status, Git Diff Stat e Git Diff.
- Unit: contexto ausente é representado de forma estável.

**Dependências:**
- Step 10.1.
- Phase 8.
- Phase 9.

## Phase 11 — Model client / abstração de chamada ao modelo

### Objetivo

Isolar seleção e chamada de modelo em `model.ts`.

### Escopo

Interface `ModelClient` e implementação compatível com Pi runtime.

### Entregáveis

- Interface `ModelClient`.
- Resolução de modelo configurado.
- Chamada com timeout/signal.
- Caminho claro para fallback se API do Pi divergir.

### Etapas

#### Step 11.1 — Definir `ModelClient`

**Objetivo:**  
Permitir mock do modelo e impedir chamadas diretas fora de `model.ts`.

**Ações:**
- Criar interface `complete`.
- Receber system prompt, user prompt, config de modelo, signal e timeout.
- Exportar factory/client default.

**Arquivos prováveis:**
- `src/model.ts`
- `src/types.ts`
- `tests/reviewer.test.ts`

**Critérios de aceite:**
- `reviewer.ts` depende da interface, não de provider concreto.
- Nenhum outro módulo chama modelo diretamente.
- Testes conseguem mockar `complete`.

**Testes esperados:**
- Unit: mock de `ModelClient` usado por reviewer.
- Manual validation: inspeção de chamadas de modelo restritas a `model.ts`.

**Dependências:**
- Phase 10.

#### Step 11.2 — Resolver modelo via registry do Pi

**Objetivo:**  
Usar modelo configurado sem hardcode de provider/id.

**Ações:**
- Ler `reviewerModel.provider`.
- Ler `reviewerModel.id`.
- Consultar `ctx.modelRegistry` quando disponível.
- Tratar modelo não encontrado.

**Arquivos prováveis:**
- `src/model.ts`
- `tests/reviewer.test.ts`
- `tests/index.test.ts`

**Critérios de aceite:**
- Provider/model vêm da config.
- Ausência de registry ou modelo gera erro claro.
- Nenhum provider é hardcoded.

**Testes esperados:**
- Unit: modelo encontrado via mock de registry.
- Unit: modelo ausente retorna erro.
- Integration-style: ausência de modelo revisor configurado gera skip no orquestrador.

**Dependências:**
- Step 11.1.

#### Step 11.3 — Aplicar timeout e signal

**Objetivo:**  
Evitar chamadas infinitas ao reviewer.

**Ações:**
- Respeitar `config.reviewer.timeoutMs`.
- Propagar `ctx.signal` quando disponível.
- Garantir que timeout não aprove silenciosamente.

**Arquivos prováveis:**
- `src/model.ts`
- `src/reviewer.ts`
- `tests/reviewer.test.ts`
- `tests/index.test.ts`

**Critérios de aceite:**
- Timeout gera erro tratável.
- Em modo `block`, falha de modelo não aprova silenciosamente.
- Nenhuma correção inventada é enviada.

**Testes esperados:**
- Unit: timeout simulado.
- Integration-style: falha de modelo em modo `block`.

**Dependências:**
- Step 11.2.

## Phase 12 — Parse e validação do resultado do reviewer

### Objetivo

Transformar resposta do modelo em decisão segura.

### Escopo

`runReviewer` e tratamento de JSON inválido.

### Entregáveis

- `runReviewer`.
- Aplicação de `safeParseReviewGateResult`.
- Sem ação antes de validação.

### Etapas

#### Step 12.1 — Implementar `runReviewer`

**Objetivo:**  
Unir prompt, model client e parse validado.

**Ações:**
- Montar system prompt.
- Montar user prompt.
- Chamar `modelClient.complete`.
- Parsear retorno.
- Retornar `ReviewGateResult` validado.

**Arquivos prováveis:**
- `src/reviewer.ts`
- `src/model.ts`
- `src/schema.ts`
- `tests/reviewer.test.ts`

**Critérios de aceite:**
- Resultado validado é retornado.
- `schema.ts` valida antes de qualquer decisão.
- `reviewer.ts` não chama provider diretamente.

**Testes esperados:**
- Unit: reviewer aprovado.
- Unit: reviewer reprovado.
- Unit: modelo retorna JSON válido.

**Dependências:**
- Phase 10.
- Phase 11.
- Phase 5.

#### Step 12.2 — Tratar JSON inválido

**Objetivo:**  
Aplicar política `failClosedOnInvalidJson`.

**Ações:**
- Detectar parse inválido.
- Se `failClosedOnInvalidJson = true`, produzir reprovação tratável.
- Se `false`, permitir warning sem bloqueio pelo orquestrador.
- Preservar erro para persistência/notificação.

**Arquivos prováveis:**
- `src/reviewer.ts`
- `src/schema.ts`
- `tests/reviewer.test.ts`
- `tests/index.test.ts`

**Critérios de aceite:**
- JSON inválido nunca é aceito como aprovado.
- Default é fail-closed.
- Erro é representável em follow-up quando bloqueante.

**Testes esperados:**
- Unit: JSON inválido com `failClosedOnInvalidJson = true`.
- Unit: JSON inválido com `failClosedOnInvalidJson = false`.
- Integration-style: JSON inválido em modo `block` gera follow-up.

**Dependências:**
- Step 12.1.

## Phase 13 — Follow-up obrigatório

### Objetivo

Gerar mensagem obrigatória de correção sem acoplar ao runtime.

### Escopo

`follow-up.ts`.

### Entregáveis

- `buildCorrectionFollowUp`.
- Template completo.
- Marker obrigatório.

### Etapas

#### Step 13.1 — Construir follow-up de correção

**Objetivo:**  
Criar texto diretivo para o agente corrigir a entrega.

**Ações:**
- Incluir `[pi-review-gate:correction-request]`.
- Incluir summary.
- Incluir severity.
- Incluir required corrections.
- Incluir recommended corrections.
- Incluir evidence.
- Incluir instruções obrigatórias.

**Arquivos prováveis:**
- `src/follow-up.ts`
- `src/constants.ts`
- `tests/follow-up.test.ts`

**Critérios de aceite:**
- Marker aparece no início.
- Todas as seções obrigatórias aparecem.
- Required corrections são visíveis.
- Texto não chama API do Pi.

**Testes esperados:**
- Unit: follow-up com marcador interno.
- Unit: inclui summary.
- Unit: inclui required corrections.
- Unit: inclui severidade e evidências.

**Dependências:**
- Phase 12.

#### Step 13.2 — Garantir separação de responsabilidades

**Objetivo:**  
Impedir que `follow-up.ts` envie mensagens.

**Ações:**
- Manter `follow-up.ts` puro.
- Deixar `pi.sendUserMessage` apenas no orquestrador.
- Testar retorno textual.

**Arquivos prováveis:**
- `src/follow-up.ts`
- `src/reviewer.ts`
- `tests/follow-up.test.ts`

**Critérios de aceite:**
- `follow-up.ts` não importa Pi runtime.
- `follow-up.ts` não chama `pi.sendUserMessage`.
- Orquestrador decide quando enviar.

**Testes esperados:**
- Unit: função retorna string.
- Manual validation: inspeção de imports.

**Dependências:**
- Step 13.1.

## Phase 14 — Persistência via `pi.appendEntry`

### Objetivo

Registrar resultados, skips e falhas finais na sessão.

### Escopo

Helpers internos em `reviewer.ts` ou funções pequenas sem criar arquivo novo.

### Entregáveis

- Persistência de resultado aprovado.
- Persistência de resultado reprovado.
- Persistência de skip por modelo ausente.
- Persistência de falha final.

### Etapas

#### Step 14.1 — Persistir resultado do review

**Objetivo:**  
Registrar decisões aprovadas ou reprovadas.

**Ações:**
- Usar entry `pi-review-gate-result`.
- Incluir `approved`, `severity`, `summary`, `evidence`.
- Incluir correções quando reprovado.
- Incluir `timestamp`, `attempt` e `model`.

**Arquivos prováveis:**
- `src/reviewer.ts`
- `src/constants.ts`
- `tests/index.test.ts`

**Critérios de aceite:**
- Review aprovado gera appendEntry.
- Review reprovado gera appendEntry.
- Payload preserva tentativa e modelo.

**Testes esperados:**
- Integration-style: persistência de resultado via `pi.appendEntry`.
- Integration-style: aprovado persiste sem follow-up.
- Integration-style: reprovado persiste antes da decisão de follow-up.

**Dependências:**
- Phase 12.

#### Step 14.2 — Persistir skips e falha final

**Objetivo:**  
Registrar ausência de modelo e estouro de ciclos.

**Ações:**
- Usar `pi-review-gate-skipped` quando não houver modelo.
- Usar `pi-review-gate-final-failure` quando exceder ciclos.
- Incluir motivo e timestamp.

**Arquivos prováveis:**
- `src/reviewer.ts`
- `src/constants.ts`
- `tests/index.test.ts`

**Critérios de aceite:**
- Modelo ausente gera skip persistido.
- Estouro de ciclos gera falha final persistida.
- Nenhum dos casos inventa correções.

**Testes esperados:**
- Integration-style: ausência de modelo revisor.
- Integration-style: limite máximo de 2 ciclos.
- Integration-style: final failure registrado.

**Dependências:**
- Step 14.1.

## Phase 15 — Orquestração do `agent_end`

### Objetivo

Implementar o fluxo completo do gate no final do ciclo do agente.

### Escopo

`handleAgentEnd` em `reviewer.ts`, chamado por `index.ts`.

### Entregáveis

- Handler principal.
- Fluxo aprovado.
- Fluxo reprovado block.
- Fluxo reprovado warn.
- Controle de ciclos.
- Tratamento básico de falhas.

### Etapas

#### Step 15.1 — Implementar early returns

**Objetivo:**  
Evitar execução quando o gate não deve rodar.

**Ações:**
- Carregar config.
- Retornar se `enabled = false`.
- Retornar se `state.activeReview = true`.
- Atualizar estado de ciclo com prompt atual.
- Tratar `reviewerModel = null`.

**Arquivos prováveis:**
- `src/reviewer.ts`
- `src/config.ts`
- `src/state.ts`
- `tests/index.test.ts`

**Critérios de aceite:**
- Gate desabilitado não chama Git/modelo.
- Review ativo não inicia outro review.
- Modelo ausente não bloqueia.
- Modelo ausente notifica e registra skip.

**Testes esperados:**
- Integration-style: ausência de modelo revisor.
- Integration-style: activeReview impede concorrência.
- Integration-style: gate disabled não executa review.

**Dependências:**
- Phase 14.
- Phase 6.

#### Step 15.2 — Orquestrar review aprovado

**Objetivo:**  
Finalizar entrega sem follow-up quando aprovada.

**Ações:**
- Coletar Git.
- Montar contexto.
- Rodar reviewer.
- Persistir resultado.
- Notificar pass se configurado.
- Não chamar `pi.sendUserMessage`.

**Arquivos prováveis:**
- `src/reviewer.ts`
- `src/git.ts`
- `src/context.ts`
- `tests/index.test.ts`

**Critérios de aceite:**
- Reviewer aprovado não injeta follow-up.
- Resultado aprovado é persistido.
- `activeReview` é liberado.

**Testes esperados:**
- Integration-style: reviewer aprovado.
- Integration-style: appendEntry chamado.
- Integration-style: sendUserMessage não chamado.

**Dependências:**
- Step 15.1.
- Phase 8.
- Phase 9.
- Phase 12.

#### Step 15.3 — Orquestrar reprovação em modo `block`

**Objetivo:**  
Injetar follow-up obrigatório quando houver ciclos disponíveis.

**Ações:**
- Persistir resultado reprovado.
- Verificar `maxCorrectionCycles`.
- Construir follow-up.
- Chamar `pi.sendUserMessage(followUp, { deliverAs: "followUp" })`.
- Incrementar/atualizar ciclo conforme contrato.

**Arquivos prováveis:**
- `src/reviewer.ts`
- `src/follow-up.ts`
- `src/state.ts`
- `tests/index.test.ts`

**Critérios de aceite:**
- Reprovação em `block` injeta follow-up.
- Follow-up contém marker obrigatório.
- Limite de ciclos é respeitado.
- Não há loop infinito.

**Testes esperados:**
- Integration-style: reviewer reprovado em modo `block`.
- Integration-style: follow-up com marcador interno.
- Integration-style: máximo de 2 ciclos.

**Dependências:**
- Step 15.2.
- Phase 13.

#### Step 15.4 — Orquestrar reprovação em modo `warn`

**Objetivo:**  
Registrar e notificar sem bloquear.

**Ações:**
- Persistir resultado reprovado.
- Notificar warning.
- Não chamar `pi.sendUserMessage`.
- Não consumir ciclo de correção obrigatório.

**Arquivos prováveis:**
- `src/reviewer.ts`
- `tests/index.test.ts`

**Critérios de aceite:**
- Reprovação em `warn` não injeta follow-up.
- Resultado é persistido.
- Usuário recebe aviso quando configurado.

**Testes esperados:**
- Integration-style: reviewer reprovado em modo `warn`.
- Integration-style: sendUserMessage não chamado.

**Dependências:**
- Step 15.3.

#### Step 15.5 — Tratar limite máximo de ciclos

**Objetivo:**  
Parar correções após limite configurado.

**Ações:**
- Comparar ciclo atual com `maxCorrectionCycles`.
- Não injetar novo follow-up ao exceder.
- Persistir final failure.
- Notificar usuário com summary e correções restantes.

**Arquivos prováveis:**
- `src/reviewer.ts`
- `src/state.ts`
- `tests/index.test.ts`

**Critérios de aceite:**
- Default de 2 ciclos é respeitado.
- Ao exceder, não há novo follow-up.
- Resultado do reviewer é preservado.

**Testes esperados:**
- Integration-style: limite máximo de 2 ciclos.
- Integration-style: final failure via appendEntry.
- Integration-style: sem sendUserMessage após limite.

**Dependências:**
- Step 15.3.

## Phase 16 — Comandos `/review-gate*`

### Objetivo

Permitir configuração e inspeção da extensão via comandos.

### Escopo

`commands.ts`.

### Entregáveis

- `/review-gate`.
- `/review-gate-status`.
- `/review-gate-model`.
- `/review-gate-on`.
- `/review-gate-off`.

### Etapas

#### Step 16.1 — Registrar comandos

**Objetivo:**  
Conectar comandos ao Pi runtime.

**Ações:**
- Implementar `registerCommands`.
- Registrar `/review-gate-status`.
- Registrar `/review-gate-on`.
- Registrar `/review-gate-off`.
- Registrar `/review-gate-model`.
- Registrar `/review-gate`.

**Arquivos prováveis:**
- `src/commands.ts`
- `src/index.ts`
- `tests/index.test.ts`

**Critérios de aceite:**
- `index.ts` apenas chama `registerCommands`.
- Comandos são registrados uma vez.
- Testes conseguem verificar nomes registrados.

**Testes esperados:**
- Integration-style: comandos registrados.
- Manual validation: comandos aparecem no Pi.

**Dependências:**
- Phase 15.

#### Step 16.2 — Implementar status, on e off

**Objetivo:**  
Permitir inspeção e ativação/desativação rápida.

**Ações:**
- `/review-gate-status` mostra enabled, mode, model, max cycles, Git diff e session strategy.
- `/review-gate-on` salva `enabled: true`.
- `/review-gate-off` salva `enabled: false`.

**Arquivos prováveis:**
- `src/commands.ts`
- `src/config.ts`
- `tests/index.test.ts`
- `tests/config.test.ts`

**Critérios de aceite:**
- Status reflete config atual.
- On/off persistem configuração.
- Nenhum comando inicia review automaticamente, exceto opção manual futura.

**Testes esperados:**
- Integration-style: status lê config.
- Integration-style: on/off salvam config.
- Manual validation: executar comandos no Pi.

**Dependências:**
- Step 16.1.
- Phase 4.

#### Step 16.3 — Implementar seleção de modelo

**Objetivo:**  
Configurar modelo revisor separado do modelo principal.

**Ações:**
- `/review-gate-model` lista modelos via `ctx.modelRegistry` quando disponível.
- Salvar provider/id selecionados.
- Permitir thinking level quando suportado pela config.
- Tratar ausência de registry com mensagem clara.

**Arquivos prováveis:**
- `src/commands.ts`
- `src/model.ts`
- `src/config.ts`
- `tests/index.test.ts`

**Critérios de aceite:**
- Modelo selecionado persiste.
- Provider/id não são hardcoded.
- Ausência de API documentada vira erro/aviso claro.

**Testes esperados:**
- Integration-style: seleção de modelo com registry mockado.
- Integration-style: registry ausente.
- Manual validation: selecionar modelo real no Pi.

**Dependências:**
- Step 16.2.
- Phase 11.

#### Step 16.4 — Implementar menu `/review-gate`

**Objetivo:**  
Disponibilizar menu principal da SPEC.

**Ações:**
- Expor opções:
  - Show current config
  - Enable review gate
  - Disable review gate
  - Select reviewer model
  - Set reviewer thinking level
  - Set max correction cycles
  - Toggle git diff
  - Toggle session context
  - Run manual review now
- Reusar funções de config.
- Para manual review, reutilizar fluxo existente sem duplicar lógica.

**Arquivos prováveis:**
- `src/commands.ts`
- `src/reviewer.ts`
- `src/config.ts`
- `tests/index.test.ts`

**Critérios de aceite:**
- Menu não duplica regras do orquestrador.
- Toggles persistem config.
- Manual review usa o mesmo pipeline de review quando possível.

**Testes esperados:**
- Integration-style: opções alteram config.
- Integration-style: manual review aciona fluxo mockado.
- Manual validation: navegação do menu no Pi.

**Dependências:**
- Step 16.3.
- Phase 15.

## Phase 17 — Tratamento de falhas

### Objetivo

Garantir falha segura e liberação de estado.

### Escopo

Falhas de Git, modelo, timeout, JSON inválido e erro inesperado.

### Entregáveis

- Política de erro aplicada.
- Notificações adequadas.
- `activeReview` liberado em `finally`.

### Etapas

#### Step 17.1 — Tratar falha de Git sem reprovar automaticamente

**Objetivo:**  
Continuar review com evidência de indisponibilidade.

**Ações:**
- Converter falha Git conhecida em contexto textual.
- Não interromper reviewer.
- Não bloquear por Git ausente isoladamente.

**Arquivos prováveis:**
- `src/git.ts`
- `src/context.ts`
- `src/reviewer.ts`
- `tests/git.test.ts`
- `tests/index.test.ts`

**Critérios de aceite:**
- Diretório não-Git não falha o fluxo.
- Reviewer recebe “Git context unavailable”.
- Erros Git inesperados são registrados/tratados.

**Testes esperados:**
- Unit: diretório não-Git.
- Integration-style: review continua sem Git.

**Dependências:**
- Phase 9.
- Phase 15.

#### Step 17.2 — Tratar falha de modelo e timeout

**Objetivo:**  
Não aprovar silenciosamente quando o reviewer falhar.

**Ações:**
- Capturar erro de chamada ao modelo.
- Capturar timeout.
- Notificar usuário.
- Registrar erro via `appendEntry` quando aplicável.
- Em `block`, não inventar correções.

**Arquivos prováveis:**
- `src/model.ts`
- `src/reviewer.ts`
- `tests/reviewer.test.ts`
- `tests/index.test.ts`

**Critérios de aceite:**
- Falha de modelo não vira aprovação.
- Timeout não causa retry infinito.
- `activeReview` é liberado.

**Testes esperados:**
- Unit: timeout no model client.
- Integration-style: falha de modelo em modo `block`.
- Integration-style: liberação de `activeReview`.

**Dependências:**
- Phase 11.
- Phase 15.

#### Step 17.3 — Tratar JSON inválido no fluxo completo

**Objetivo:**  
Aplicar fail-closed no orquestrador.

**Ações:**
- Quando fail-closed, tratar como reprovação.
- Em modo `block`, injetar follow-up informando falha do review por JSON inválido.
- Em fail-open, notificar warning e não bloquear.
- Persistir resultado/erro.

**Arquivos prováveis:**
- `src/reviewer.ts`
- `src/schema.ts`
- `src/follow-up.ts`
- `tests/index.test.ts`

**Critérios de aceite:**
- Default fail-closed reprova.
- Follow-up não inventa correções além da falha de review.
- Fail-open não bloqueia.

**Testes esperados:**
- Integration-style: JSON inválido com `failClosedOnInvalidJson = true`.
- Integration-style: JSON inválido com `failClosedOnInvalidJson = false`.

**Dependências:**
- Phase 12.
- Phase 13.
- Phase 15.

## Phase 18 — Testes integration-style com mocks

### Objetivo

Validar os fluxos principais sem carregar o Pi real.

### Escopo

Mocks de `ExtensionAPI`, `ExtensionContext`, `pi.exec`, `modelClient` e comandos.

### Entregáveis

- Cobertura dos fluxos principais.
- Testes de regressão do gate.
- Confiança antes da validação manual.

### Etapas

#### Step 18.1 — Criar mocks inline do Pi runtime

**Objetivo:**  
Simular runtime Pi dentro dos testes existentes.

**Ações:**
- Mockar `pi.on`.
- Mockar `pi.exec`.
- Mockar `pi.appendEntry`.
- Mockar `pi.sendUserMessage`.
- Mockar `ctx.ui.notify`.
- Mockar `ctx.sessionManager.getBranch`.
- Mockar `ctx.modelRegistry`.

**Arquivos prováveis:**
- `tests/index.test.ts`
- `tests/reviewer.test.ts`
- `tests/git.test.ts`
- `tests/context.test.ts`

**Critérios de aceite:**
- Não criar arquivo extra de helper sem necessidade.
- Mocks cobrem chamadas do runtime.
- Testes são determinísticos.

**Testes esperados:**
- Integration-style: registro e execução de handler.
- Integration-style: appendEntry e sendUserMessage observáveis.

**Dependências:**
- Phase 15.
- Phase 16.

#### Step 18.2 — Cobrir matriz de decisão

**Objetivo:**  
Testar aprovado, reprovado block, reprovado warn, modelo ausente e ciclos.

**Ações:**
- Simular reviewer aprovado.
- Simular reviewer reprovado em `block`.
- Simular reviewer reprovado em `warn`.
- Simular `reviewerModel = null`.
- Simular ciclo excedido.

**Arquivos prováveis:**
- `tests/index.test.ts`
- `tests/reviewer.test.ts`
- `tests/state.test.ts`

**Critérios de aceite:**
- Aprovado não injeta follow-up.
- Block injeta follow-up.
- Warn não injeta follow-up.
- Modelo ausente gera skip.
- Máximo de 2 ciclos é respeitado.

**Testes esperados:**
- Integration-style: reviewer aprovado.
- Integration-style: reviewer reprovado em modo `block`.
- Integration-style: reviewer reprovado em modo `warn`.
- Integration-style: ausência de modelo revisor.
- Integration-style: limite máximo de 2 ciclos.

**Dependências:**
- Step 18.1.

#### Step 18.3 — Consolidar suíte obrigatória

**Objetivo:**  
Garantir que todos os casos exigidos estejam cobertos.

**Ações:**
- Revisar cobertura por módulo.
- Adicionar testes faltantes.
- Rodar Vitest completo.
- Rodar Biome.

**Arquivos prováveis:**
- `tests/config.test.ts`
- `tests/context.test.ts`
- `tests/follow-up.test.ts`
- `tests/git.test.ts`
- `tests/reviewer.test.ts`
- `tests/schema.test.ts`
- `tests/serialization.test.ts`
- `tests/state.test.ts`
- `tests/index.test.ts`

**Critérios de aceite:**
- Todos os testes obrigatórios existem.
- `pnpm test` passa.
- `biome check .` passa.

**Testes esperados:**
- Unit: config parcial, config inválida.
- Unit: prompt injetado, reset em prompt real, máximo de 2 ciclos.
- Unit: serialização user/assistant/toolResult.
- Unit: última resposta do assistente.
- Unit: session slice.
- Unit: Git success, não-Git, truncamento.
- Unit: JSON válido e inválido.
- Integration-style: approved/block/warn/model missing/appendEntry.

**Dependências:**
- Step 18.2.

## Phase 19 — Documentação de uso

### Objetivo

Documentar instalação, configuração, comandos e validação.

### Escopo

`README.md` e `examples/config.example.json`.

### Entregáveis

- README mínimo.
- Config example.
- Seção de validação manual.
- Limitações da V1.

### Etapas

#### Step 19.1 — Escrever README operacional

**Objetivo:**  
Permitir uso básico da extensão.

**Ações:**
- Descrever objetivo da extensão.
- Documentar instalação local/global/package-based conforme SPEC.
- Documentar comandos.
- Documentar config local.
- Documentar modos `warn` e `block`.
- Documentar limite de ciclos.
- Documentar marker de follow-up.

**Arquivos prováveis:**
- `README.md`

**Critérios de aceite:**
- Usuário sabe configurar modelo.
- Usuário sabe ativar/desativar.
- Usuário entende comportamento em modo `block` e `warn`.
- Fora de escopo da V1 fica explícito.

**Testes esperados:**
- Manual validation: seguir README para carregar extensão.
- Manual validation: executar comandos documentados.

**Dependências:**
- Phase 16.

#### Step 19.2 — Finalizar exemplo de config

**Objetivo:**  
Fornecer configuração de referência.

**Ações:**
- Atualizar `examples/config.example.json`.
- Incluir todos os campos default.
- Manter `reviewerModel` como `null` ou exemplo claramente editável.
- Evitar secrets.

**Arquivos prováveis:**
- `examples/config.example.json`
- `README.md`

**Critérios de aceite:**
- Exemplo é JSON válido.
- Exemplo não contém chaves/API keys.
- Campos correspondem ao schema.

**Testes esperados:**
- Unit: exemplo parseável pelo schema, se incluído em teste.
- Manual validation: copiar exemplo para config local.

**Dependências:**
- Phase 5.
- Step 19.1.

## Phase 20 — Validação manual no Pi

### Objetivo

Confirmar comportamento real no Pi runtime.

### Escopo

Reload, comandos, agent_end, modelo, Git e follow-ups.

### Entregáveis

- Checklist manual executado.
- Problemas de API real registrados.
- Ajustes finais aplicados.

### Etapas

#### Step 20.1 — Validar carregamento e comandos

**Objetivo:**  
Garantir que a extensão carrega no Pi.

**Ações:**
- Instalar extensão localmente.
- Executar `/reload`.
- Executar `/review-gate-status`.
- Executar `/review-gate-on`.
- Executar `/review-gate-off`.
- Executar `/review-gate-model`.

**Arquivos prováveis:**
- `README.md`
- `src/index.ts`
- `src/commands.ts`

**Critérios de aceite:**
- Extensão carrega sem erro.
- Comandos respondem.
- Config persiste entre comandos.

**Testes esperados:**
- Manual validation: `/reload`.
- Manual validation: `/review-gate-status`.
- Manual validation: on/off/model.

**Dependências:**
- Phase 19.

#### Step 20.2 — Validar fluxos aprovado e reprovado

**Objetivo:**  
Testar o comportamento real do gate no `agent_end`.

**Ações:**
- Configurar modelo revisor.
- Rodar tarefa simples com aprovação esperada.
- Rodar tarefa com reprovação esperada.
- Confirmar appendEntry.
- Confirmar follow-up em `block`.
- Confirmar ausência de follow-up em `warn`.

**Arquivos prováveis:**
- `src/reviewer.ts`
- `src/model.ts`
- `src/follow-up.ts`
- `README.md`

**Critérios de aceite:**
- Fluxo aprovado não injeta follow-up.
- Fluxo reprovado em `block` injeta follow-up.
- Fluxo reprovado em `warn` não injeta follow-up.
- Resultado é persistido.

**Testes esperados:**
- Manual validation: fluxo aprovado.
- Manual validation: fluxo reprovado com follow-up.
- Manual validation: modo `warn`.

**Dependências:**
- Step 20.1.

#### Step 20.3 — Validar ciclos, Git e falhas

**Objetivo:**  
Confirmar hardening no ambiente real.

**Ações:**
- Forçar duas correções seguidas.
- Confirmar parada após limite.
- Validar coleta Git em repo.
- Validar comportamento fora de repo Git.
- Validar truncamento com diff grande.
- Validar comportamento sem modelo configurado.

**Arquivos prováveis:**
- `src/state.ts`
- `src/git.ts`
- `src/reviewer.ts`
- `README.md`

**Critérios de aceite:**
- Limite de 2 ciclos é aplicado.
- Git disponível entra no contexto.
- Não-Git não bloqueia automaticamente.
- Modelo ausente gera skip.
- Diff grande é truncado.

**Testes esperados:**
- Manual validation: limite de ciclos.
- Manual validation: coleta Git.
- Manual validation: diretório não-Git.
- Manual validation: ausência de modelo.

**Dependências:**
- Step 20.2.

## 5. Ordem Recomendada de Execução

- [ ] Step 1.1 — Criar estrutura do pacote
- [ ] Step 1.2 — Criar entrypoint fino inicial
- [ ] Step 2.1 — Configurar TypeScript
- [ ] Step 2.2 — Configurar Biome
- [ ] Step 2.3 — Configurar Vitest
- [ ] Step 3.1 — Definir tipos centrais
- [ ] Step 3.2 — Definir constantes globais
- [ ] Step 4.1 — Definir `defaultConfig`
- [ ] Step 4.2 — Implementar load, merge e save
- [ ] Step 5.1 — Validar configuração
- [ ] Step 5.2 — Validar `ReviewGateResult`
- [ ] Step 5.3 — Implementar safe parse de JSON
- [ ] Step 6.1 — Criar estado runtime
- [ ] Step 6.2 — Detectar prompt injetado
- [ ] Step 6.3 — Atualizar ciclo por prompt
- [ ] Step 6.4 — Proteger contra reviews simultâneos
- [ ] Step 7.1 — Extrair texto de mensagens
- [ ] Step 7.2 — Serializar mensagens do ciclo atual
- [ ] Step 7.3 — Serializar session entries
- [ ] Step 8.1 — Extrair prompt atual e última resposta
- [ ] Step 8.2 — Filtrar session slice
- [ ] Step 8.3 — Montar `ReviewContext`
- [ ] Step 9.1 — Executar comandos Git fixos
- [ ] Step 9.2 — Tratar diretório não-Git
- [ ] Step 9.3 — Truncar outputs Git
- [ ] Step 10.1 — Implementar system prompt
- [ ] Step 10.2 — Implementar user prompt com contexto
- [ ] Step 11.1 — Definir `ModelClient`
- [ ] Step 11.2 — Resolver modelo via registry do Pi
- [ ] Step 11.3 — Aplicar timeout e signal
- [ ] Step 12.1 — Implementar `runReviewer`
- [ ] Step 12.2 — Tratar JSON inválido
- [ ] Step 13.1 — Construir follow-up de correção
- [ ] Step 13.2 — Garantir separação de responsabilidades
- [ ] Step 14.1 — Persistir resultado do review
- [ ] Step 14.2 — Persistir skips e falha final
- [ ] Step 15.1 — Implementar early returns
- [ ] Step 15.2 — Orquestrar review aprovado
- [ ] Step 15.3 — Orquestrar reprovação em modo `block`
- [ ] Step 15.4 — Orquestrar reprovação em modo `warn`
- [ ] Step 15.5 — Tratar limite máximo de ciclos
- [ ] Step 16.1 — Registrar comandos
- [ ] Step 16.2 — Implementar status, on e off
- [ ] Step 16.3 — Implementar seleção de modelo
- [ ] Step 16.4 — Implementar menu `/review-gate`
- [ ] Step 17.1 — Tratar falha de Git sem reprovar automaticamente
- [ ] Step 17.2 — Tratar falha de modelo e timeout
- [ ] Step 17.3 — Tratar JSON inválido no fluxo completo
- [ ] Step 18.1 — Criar mocks inline do Pi runtime
- [ ] Step 18.2 — Cobrir matriz de decisão
- [ ] Step 18.3 — Consolidar suíte obrigatória
- [ ] Step 19.1 — Escrever README operacional
- [ ] Step 19.2 — Finalizar exemplo de config
- [ ] Step 20.1 — Validar carregamento e comandos
- [x] Step 20.2 — Validar fluxos aprovado e reprovado (checklist preparado em docs/manual-validation.md)
- [x] Step 20.3 — Validar ciclos, Git e falhas (checklist preparado em docs/manual-validation.md)

## 6. Riscos Técnicos

- **API exata do Pi para chamada de modelo**
  - Risco: a API real pode não expor uma chamada direta simples.
  - Mitigação: isolar tudo em `model.ts` e manter `ModelClient` mockável.

- **Disponibilidade de `ctx.modelRegistry`**
  - Risco: `ctx.modelRegistry.getModels` ou API equivalente pode diferir.
  - Mitigação: tratar ausência com aviso claro e manter fallback encapsulado em `model.ts`.

- **Serialização de tipos internos do Pi**
  - Risco: mensagens, tool results e entries podem ter formatos variáveis.
  - Mitigação: `serialization.ts` deve ser tolerante a formatos desconhecidos e testado com mocks.

- **Comportamento real de `event.messages`**
  - Risco: pode não conter exatamente o ciclo esperado.
  - Mitigação: usar `event.messages` como fonte primária e session slice filtrado como complemento.

- **Persistência e reconstrução de estado em reload**
  - Risco: estado em memória perde ciclos após reload.
  - Mitigação: registrar `appendEntry` suficiente para reconstrução parcial; considerar `session_start` como suporte.

- **Custo/tamanho do diff**
  - Risco: diff grande aumenta custo e pode exceder limites do modelo.
  - Mitigação: truncamento obrigatório com marker e limites configuráveis.

- **Review falso-positivo ou falso-negativo**
  - Risco: reviewer pode aprovar entrega ruim ou reprovar entrega válida.
  - Mitigação: prompt determinístico, evidência objetiva, modo `warn` para calibração e persistência do resultado.

- **Tensão no marker documentado**
  - Risco: SPEC usa também `[review-gate:correction-request]`, enquanto arquitetura e contratos exigem `[pi-review-gate:correction-request]`.
  - Mitigação: padronizar na V1 com `[pi-review-gate:correction-request]` e testar esse marker.

- **JSON inválido do reviewer**
  - Risco: modelo retorna markdown/prose ou shape errado.
  - Mitigação: `schema.ts` valida antes de qualquer ação; default `failClosedOnInvalidJson = true`.

- **Falha de modelo em modo `block`**
  - Risco: gate pode ficar sem decisão.
  - Mitigação: não aprovar silenciosamente, notificar e registrar erro sem inventar correções.

- **Comandos interativos do Pi**
  - Risco: API real de menu/interação pode variar.
  - Mitigação: manter lógica de config desacoplada de UI; comandos chamam funções puras.

## 7. Definição de Pronto da V1

A V1 estará pronta quando:

- `pnpm test` ou equivalente passar.
- `biome check .` passar.
- A extensão carregar via `/reload`.
- `/review-gate` funcionar.
- `/review-gate-status` funcionar.
- `/review-gate-model` permitir configurar modelo revisor.
- `/review-gate-on` e `/review-gate-off` persistirem config.
- Config local for carregada e salva em `~/.config/pi-review-gate/config.json`.
- Fluxo aprovado for testado manualmente.
- Fluxo reprovado em modo `block` injetar follow-up obrigatório.
- Fluxo reprovado em modo `warn` não injetar follow-up.
- Follow-up conter `[pi-review-gate:correction-request]`.
- Limite de 2 ciclos for validado.
- Resultado do review for persistido via `pi.appendEntry()`.
- Ausência de modelo revisor gerar skip sem bloquear.
- Git success, não-Git e truncamento forem testados.
- Documentação mínima em `README.md` existir.
- `examples/config.example.json` estiver atualizado.
