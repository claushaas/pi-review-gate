# SPEC — `pi-review-gate`

## 1. Visão Geral

`pi-review-gate` é uma extensão para o Pi Coding Agent que executa uma revisão obrigatória ao final de cada ciclo de trabalho do agente.

A extensão atua como um **delivery gate**:

- observa o evento `agent_end`;
- coleta o contexto do trabalho recém-executado;
- envia esse contexto para um modelo revisor configurável;
- exige um veredito estruturado;
- aprova a entrega ou injeta um follow-up obrigatório com correções;
- limita o número de ciclos de correção para evitar loops infinitos.

A extensão não é uma ferramenta opcional chamada pelo agente. Ela roda automaticamente e fora da decisão do agente principal.

---

## 2. Objetivo

Garantir que entregas feitas pelo agente passem por uma revisão obrigatória antes de serem consideradas concluídas.

A extensão deve reduzir os seguintes riscos:

- agente declarar conclusão cedo demais;
- implementação incompleta;
- ausência de testes ou validação;
- divergência entre resposta final e `git diff`;
- mudanças incompatíveis com o pedido do usuário;
- correções parciais após review;
- alucinação sobre arquivos, testes ou comportamento implementado.

---

## 3. Não Objetivos da V1

A V1 não deve tentar resolver:

- bloqueio visual da primeira resposta final do agente;
- integração com CI externo;
- revisão multi-agente;
- revisão incremental durante cada tool call;
- análise semântica profunda de todo o repositório;
- descoberta automática completa de documentação relevante;
- políticas diferentes por tipo de task;
- dashboard TUI avançado;
- histórico analítico de revisões;
- scoring longitudinal de qualidade do agente.

Essas capacidades podem ser consideradas em versões futuras.

---

## 4. Modelo Conceitual

```txt
User prompt
  ↓
Agent executes task
  ↓
Agent produces final response
  ↓
agent_end fires
  ↓
Review Gate collects delivery context
  ↓
Reviewer model evaluates delivery
  ↓
IF approved:
  delivery is accepted
ELSE:
  mandatory follow-up correction is injected
  ↓
Agent applies corrections
  ↓
Review Gate runs again
````

---

## 5. Nome da Extensão

Nome recomendado:

```txt
pi-review-gate
```

Nome de pacote sugerido:

```txt
@stoa-life/pi-review-gate
```

---

## 6. Local de Instalação

A extensão deve suportar instalação como extensão global ou local de projeto.

### Global

```txt
~/.pi/agent/extensions/pi-review-gate/index.ts
```

### Projeto

```txt
.pi/extensions/pi-review-gate/index.ts
```

### Package-based

```json
{
  "packages": [
    "npm:@stoa-life/pi-review-gate@latest"
  ]
}
```

---

## 7. Escopo da V1

A V1 deve implementar:

1. Hook em `agent_end`.
2. Coleta de contexto do ciclo atual.
3. Coleta de `git status`.
4. Coleta de `git diff --stat`.
5. Coleta de `git diff`.
6. Configuração de modelo revisor via comando.
7. Persistência de configuração local.
8. Chamada ao modelo revisor.
9. Validação de resposta JSON.
10. Injeção de follow-up obrigatório se a entrega for reprovada.
11. Máximo de 2 ciclos de correção por prompt original.
12. Registro persistido do resultado da revisão via `pi.appendEntry`.
13. Proteção contra recursão indevida.
14. Comando para mostrar status/configuração da extensão.

---

## 8. Eventos Usados

### 8.1 `agent_end`

Evento principal da extensão.

Uso:

```ts
pi.on("agent_end", async (event, ctx) => {
  // event.messages contém as mensagens do prompt atual
});
```

Responsabilidades:

* detectar se review gate está habilitado;
* coletar contexto da entrega;
* executar review;
* aprovar ou reprovar;
* injetar follow-up quando necessário.

---

### 8.2 `session_start`

Usado para restaurar estado persistido da sessão, se necessário.

Responsabilidades:

* reconstruir contadores de tentativas a partir de entradas customizadas;
* restaurar último estado conhecido da extensão;
* opcionalmente exibir status da extensão.

---

### 8.3 `input`

Opcional na V1, mas recomendado.

Uso:

* detectar mensagens originadas pela extensão;
* evitar que prompts injetados pelo próprio review gate sejam tratados como prompts reais do usuário para fins de delimitação do escopo original.

---

## 9. Estratégia de Contexto

A extensão deve revisar o **escopo da entrega atual**, não a sessão inteira.

### 9.1 Fonte Canônica

A fonte canônica do contexto da entrega é:

```ts
event.messages
```

Essas mensagens representam o trabalho executado pelo agente em resposta ao prompt atual.

### 9.2 Fonte Complementar

Como fallback ou enriquecimento, a extensão pode usar:

```ts
ctx.sessionManager.getBranch()
```

A extensão deve filtrar o branch desde a última mensagem real do usuário.

Pseudo-lógica:

```ts
const branch = ctx.sessionManager.getBranch();

const lastRealUserMessageIndex = findLastIndex(branch, entry =>
  entry.type === "message" &&
  entry.message.role === "user" &&
  !isReviewGateInjectedMessage(entry.message)
);

const entriesSinceLastRealUserMessage = branch.slice(lastRealUserMessageIndex);
```

### 9.3 Regra de Ouro

A extensão **não deve enviar a sessão inteira por padrão**.

Contexto recomendado:

```txt
1. Current user prompt
2. event.messages
3. Latest assistant response
4. Session entries since latest real user message, if needed
5. git status
6. git diff --stat
7. git diff
```

---

## 10. Configuração

### 10.1 Arquivo de Configuração

Arquivo recomendado:

```txt
~/.config/pi-review-gate/config.json
```

Permissão recomendada:

```txt
0600
```

### 10.2 Schema da Configuração

```ts
type ReviewGateConfig = {
  enabled: boolean;

  mode: "warn" | "block";

  reviewerModel: {
    provider: string;
    id: string;
    thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  } | null;

  maxCorrectionCycles: number;

  context: {
    strategy: "current_run" | "since_last_user";
    includeEventMessages: boolean;
    includeSessionSlice: boolean;
    maxSessionEntries: number;
  };

  git: {
    enabled: boolean;
    includeStatus: boolean;
    includeDiffStat: boolean;
    includeDiff: boolean;
    maxDiffChars: number;
    maxStatusChars: number;
    maxDiffStatChars: number;
  };

  reviewer: {
    requireJson: boolean;
    failClosedOnInvalidJson: boolean;
    timeoutMs: number;
  };

  ui: {
    notifyOnPass: boolean;
    notifyOnFail: boolean;
    showReviewerSummary: boolean;
  };
};
```

### 10.3 Configuração Default

```json
{
  "enabled": true,
  "mode": "block",
  "reviewerModel": null,
  "maxCorrectionCycles": 2,
  "context": {
    "strategy": "current_run",
    "includeEventMessages": true,
    "includeSessionSlice": true,
    "maxSessionEntries": 40
  },
  "git": {
    "enabled": true,
    "includeStatus": true,
    "includeDiffStat": true,
    "includeDiff": true,
    "maxDiffChars": 60000,
    "maxStatusChars": 12000,
    "maxDiffStatChars": 12000
  },
  "reviewer": {
    "requireJson": true,
    "failClosedOnInvalidJson": true,
    "timeoutMs": 120000
  },
  "ui": {
    "notifyOnPass": true,
    "notifyOnFail": true,
    "showReviewerSummary": true
  }
}
```

---

## 11. Comandos

## 11.1 `/review-gate`

Comando principal de configuração.

Deve abrir um menu interativo com opções:

```txt
1. Show current config
2. Enable review gate
3. Disable review gate
4. Select reviewer model (diálogo interativo via ctx.ui.select quando sem args)
5. Set reviewer thinking level (diálogo interativo via ctx.ui.select quando sem args)
6. Set max correction cycles
7. Toggle git diff
8. Toggle session context
9. Run manual review now
```

**Seleção interativa:** quando `/review-gate model` ou `/review-gate thinking` são chamados sem argumentos, um diálogo `ctx.ui.select()` é aberto. O usuário seleciona com ↑/↓ e Enter, ou cancela com Escape. Com argumentos, a configuração é feita diretamente (fluxo antigo preservado).

---

## 11.2 `/review-gate-status`

Exibe estado atual:

```txt
Review Gate: enabled
Mode: block
Reviewer model: openrouter/moonshotai/kimi-k2.5
Max correction cycles: 2
Current cycle count: 0
Git diff included: true
Session strategy: current_run
```

---

## 11.3 `/review-gate-model`

Atalho para seleção do modelo revisor.

**Quando chamado sem argumentos:** abre um diálogo interativo (`ctx.ui.select()`) listando todos os modelos disponíveis no registry. O usuário seleciona com ↑/↓ e Enter, ou cancela com Escape.

**Quando chamado com argumentos** (`/review-gate-model <provider>/<id> [thinkingLevel]`): configura o modelo diretamente, sem abrir o diálogo.

O modelo é validado contra o registry (via `find`, `getAvailable`, `getModels`, ou `getAll`) quando disponível. Se o modelo não for encontrado, uma mensagem de erro é exibida e a configuração não é salva.

---

## 11.4 `/review-gate-on`

Ativa a extensão.

---

## 11.5 `/review-gate-off`

Desativa a extensão.

---

## 12. Modelo Revisor

## 12.1 Requisito

A extensão deve permitir configurar o modelo revisor de forma semelhante ao pacote `rpiv-advisor`.

O modelo revisor deve ser separado do modelo principal do agente.

### Exemplo

```json
{
  "reviewerModel": {
    "provider": "openrouter",
    "id": "moonshotai/kimi-k2.5",
    "thinkingLevel": "high"
  }
}
```

---

## 12.2 Comportamento se não houver modelo configurado

Se `enabled = true`, mas `reviewerModel = null`, a extensão deve:

* não bloquear a entrega;
* emitir aviso claro no UI;
* registrar entrada customizada indicando que o review foi ignorado por falta de configuração.

Exemplo:

```txt
Review Gate is enabled but no reviewer model is configured.
Run /review-gate-model to select one.
```

---

## 13. Resultado do Review

O modelo revisor deve retornar JSON estrito.

### 13.1 Schema

```ts
type ReviewGateResult = {
  approved: boolean;

  severity: "pass" | "minor" | "major" | "blocking";

  summary: string;

  requiredCorrections: string[];

  recommendedCorrections: string[];

  evidence: string[];

  confidence: "low" | "medium" | "high";
};
```

---

## 13.2 Regra de Aprovação

A V1 deve usar regra simples:

```ts
approved === true
```

Se `approved` for `false`, a extensão deve reprovar.

A severidade deve ser usada para comunicação, mas não deve sobrescrever `approved`.

---

## 13.3 JSON Inválido

Se o modelo revisor retornar JSON inválido:

### Se `failClosedOnInvalidJson = true`

A extensão deve reprovar a entrega e injetar follow-up obrigatório informando que o review falhou por resposta inválida.

### Se `failClosedOnInvalidJson = false`

A extensão deve emitir warning e não bloquear.

Default:

```json
{
  "failClosedOnInvalidJson": true
}
```

Recomendação: manter `true`.

---

## 14. Prompt do Modelo Revisor

A extensão deve montar um prompt determinístico.

### 14.1 System Prompt do Reviewer

```txt
You are the mandatory delivery reviewer for a coding agent.

Your job is to decide whether the agent's work can be considered complete.

You are not the implementation agent.
You must not propose broad rewrites unless they are required for correctness.
You must not approve incomplete work.
You must not approve work when the final response claims changes that are not supported by the provided evidence.
You must not approve work when tests or validation were required but no evidence was provided.
You must focus on the user's request, the actual delivery, the git diff, and the validation evidence.

Return JSON only.
Do not include markdown.
Do not include prose outside JSON.
```

---

### 14.2 User Prompt do Reviewer

```txt
Review the following delivery.

Decision rules:
- Approve only if the delivery satisfies the user's request.
- Reject if required implementation is missing.
- Reject if tests or validation are missing when they are necessary.
- Reject if the agent's final response is inconsistent with the diff.
- Reject if the implementation introduces obvious regressions.
- Reject if the work violates explicit user constraints.
- Do not reject for minor cosmetic preferences unless they affect correctness, maintainability, or contract compliance.
- If evidence is insufficient, reject and list the missing evidence.

Return JSON only with this exact shape:

{
  "approved": boolean,
  "severity": "pass" | "minor" | "major" | "blocking",
  "summary": string,
  "requiredCorrections": string[],
  "recommendedCorrections": string[],
  "evidence": string[],
  "confidence": "low" | "medium" | "high"
}

<context>
{{review_context}}
</context>
```

---

## 15. Context Payload

A extensão deve construir um payload textual com seções estáveis.

````txt
# Review Context

## Current User Prompt

{{current_user_prompt}}

## Current Agent Run Messages

{{serialized_event_messages}}

## Latest Assistant Response

{{latest_assistant_response}}

## Session Slice Since Latest Real User Message

{{serialized_session_slice}}

## Git Status

```txt
{{git_status}}
````

## Git Diff Stat

```txt
{{git_diff_stat}}
```

## Git Diff

```diff
{{git_diff}}
```

````

---

## 16. Serialização de Mensagens

A extensão deve serializar mensagens de forma legível e estável.

Formato recomendado:

```txt
[message 1]
role: user
content:
...

[message 2]
role: assistant
content:
...

[message 3]
role: toolResult
tool: bash
isError: false
content:
...
````

A serialização deve preservar:

* role;
* conteúdo textual;
* nome da tool, quando aplicável;
* status de erro, quando aplicável;
* resultados de comandos relevantes;
* resposta final do assistente.

A serialização não precisa preservar campos internos irrelevantes.

---

## 17. Coleta de Git

A extensão deve executar comandos via `pi.exec`.

### 17.1 Comandos

```ts
await pi.exec("git", ["status", "--short"], { timeout: 10000 });
await pi.exec("git", ["diff", "--stat"], { timeout: 10000 });
await pi.exec("git", ["diff"], { timeout: 30000 });
```

### 17.2 Se não for repositório Git

Se os comandos falharem com erro de “not a git repository”, a extensão deve:

* continuar a revisão;
* incluir no contexto que não há repositório Git detectado;
* não reprovar automaticamente apenas por isso.

Exemplo:

```txt
Git context unavailable: current directory is not a git repository.
```

### 17.3 Truncamento

A extensão deve truncar saídas grandes.

Defaults:

```txt
git status: 12k chars
git diff --stat: 12k chars
git diff: 60k chars
```

Quando truncar, deve deixar marcador explícito:

```txt
[TRUNCATED: original length 184203 chars, included first 60000 chars]
```

---

## 18. Ciclos de Correção

## 18.1 Contador

A extensão deve manter um contador por prompt original.

Default:

```ts
maxCorrectionCycles = 2;
```

### Conceito

```txt
Original user prompt
  → Review attempt 0
  → Correction cycle 1
  → Review attempt 1
  → Correction cycle 2
  → Review attempt 2
  → Stop if still failing
```

---

## 18.2 Identificação de Mensagens Injetadas

Todo follow-up injetado pela extensão deve conter um marcador interno textual.

Exemplo:

```txt
[review-gate:correction-request]
```

Esse marcador permite a extensão distinguir:

```txt
mensagem real do usuário
vs
mensagem injetada pela extensão
```

---

## 18.3 Detecção

```ts
function isReviewGateInjectedMessage(message: Message): boolean {
  return getMessageText(message).includes("[review-gate:correction-request]");
}
```

---

## 18.4 Ao exceder limite

Se `maxCorrectionCycles` for excedido:

* não injetar novo follow-up;
* registrar falha final;
* notificar o usuário;
* preservar o resultado do reviewer.

Mensagem sugerida:

```txt
Review Gate failed after 2 correction cycles.

The delivery is still not approved.

Reviewer summary:
{{summary}}

Remaining required corrections:
{{requiredCorrections}}
```

---

## 19. Follow-up Obrigatório

Quando o review reprovar e ainda houver ciclos disponíveis, a extensão deve enviar:

```ts
pi.sendUserMessage(followUpText, {
  deliverAs: "followUp"
});
```

### 19.1 Template

```txt
[review-gate:correction-request]

Mandatory review failed.

You must correct the delivery before considering the task complete.

Reviewer summary:
{{summary}}

Severity:
{{severity}}

Required corrections:
{{requiredCorrections}}

Recommended corrections:
{{recommendedCorrections}}

Evidence:
{{evidence}}

Instructions:
1. Apply all required corrections.
2. Re-run the relevant validation commands.
3. Do not mark the task complete until the required corrections are addressed.
4. In your next final response, summarize:
   - what was corrected;
   - which files changed;
   - which validation commands were run;
   - any remaining limitation, if applicable.
```

---

## 20. Modo `block` vs `warn`

A V1 deve suportar dois modos.

### 20.1 `block`

Default.

Se reprovar:

* injeta follow-up obrigatório;
* exige correção;
* respeita limite de ciclos.

### 20.2 `warn`

Se reprovar:

* não injeta follow-up;
* apenas notifica;
* registra resultado.

Útil para testes iniciais da extensão.

---

## 21. Persistência em Sessão

A extensão deve registrar resultados com `pi.appendEntry`.

### 21.1 Review aprovado

```ts
pi.appendEntry("review-gate-result", {
  approved: true,
  severity,
  summary,
  evidence,
  timestamp: Date.now(),
  attempt,
  model: reviewerModel
});
```

### 21.2 Review reprovado

```ts
pi.appendEntry("review-gate-result", {
  approved: false,
  severity,
  summary,
  requiredCorrections,
  recommendedCorrections,
  evidence,
  timestamp: Date.now(),
  attempt,
  model: reviewerModel
});
```

### 21.3 Review ignorado

```ts
pi.appendEntry("review-gate-skipped", {
  reason: "no_reviewer_model",
  timestamp: Date.now()
});
```

---

## 22. Estado em Memória

A extensão pode manter estado simples em memória:

```ts
type RuntimeState = {
  activeReview: boolean;
  correctionCycle: number;
  lastOriginalUserPromptHash: string | null;
  lastReviewResult: ReviewGateResult | null;
};
```

### 22.1 Proteção contra concorrência

A extensão deve impedir reviews simultâneos:

```ts
if (state.activeReview) return;
state.activeReview = true;

try {
  await runReview();
} finally {
  state.activeReview = false;
}
```

---

## 23. Identificação do Prompt Original

A extensão deve determinar se o prompt atual é:

1. prompt real do usuário;
2. correção injetada pelo review gate.

### 23.1 Prompt real

Mensagem `role = user` que não contém:

```txt
[review-gate:correction-request]
```

### 23.2 Prompt de correção

Mensagem `role = user` contendo:

```txt
[review-gate:correction-request]
```

### 23.3 Reset do contador

Quando houver novo prompt real do usuário:

```ts
state.correctionCycle = 0;
state.lastOriginalUserPromptHash = hash(promptText);
```

Quando houver prompt de correção:

```ts
state.correctionCycle += 1;
```

---

## 24. Chamada ao Modelo Revisor

A extensão deve usar o registry/model API do Pi quando possível.

Requisito:

* não hardcodar provedor;
* não hardcodar modelo;
* usar modelo selecionado na configuração;
* permitir provider/model compatível com configuração local do Pi.

Pseudo-código conceitual:

```ts
const model = ctx.modelRegistry.find(
  config.reviewerModel.provider,
  config.reviewerModel.id
);

if (!model) {
  throw new Error("Configured reviewer model not found");
}

const result = await callReviewerModel({
  model,
  systemPrompt,
  userPrompt,
  signal: ctx.signal
});
```

A API exata de chamada ao modelo deve seguir as capacidades reais disponíveis no Pi runtime.

Se a API interna não expuser chamada direta simples, a V1 pode implementar provider call via `fetch` usando configuração compatível, mas a preferência é usar abstração do Pi.

---

## 25. Falhas

## 25.1 Falha ao coletar Git

Não reprova automaticamente.

Inclui evidência:

```txt
Git context unavailable.
```

## 25.2 Falha ao chamar modelo revisor

Se `mode = block`:

* não deve injetar correções inventadas;
* deve notificar falha do gate;
* registrar erro;
* não aprovar silenciosamente.

Mensagem:

```txt
Review Gate could not complete because the reviewer model call failed.
```

## 25.3 JSON inválido

Seguir regra de `failClosedOnInvalidJson`.

Default: reprovar.

## 25.4 Timeout

Se timeout do reviewer for excedido:

* abortar chamada;
* registrar timeout;
* notificar usuário;
* não tentar infinitamente.

---

## 26. Segurança

A extensão roda com permissões do sistema local.

Requisitos:

* não executar comandos arbitrários vindos do modelo revisor;
* executar apenas comandos Git fixos definidos na extensão;
* não enviar secrets intencionalmente;
* truncar diffs grandes;
* não ler `.env` diretamente;
* não anexar arquivos arbitrários fora do diff;
* não exibir API keys em logs;
* salvar config com permissão restrita.

---

## 27. Critérios de Aprovação do Reviewer

O reviewer deve reprovar quando:

* o pedido do usuário não foi atendido;
* arquivos esperados não foram alterados;
* a resposta final alega algo que não aparece no diff;
* testes eram necessários e não foram executados;
* há erro evidente em comandos executados;
* há mudança perigosa não justificada;
* a implementação viola documentação ou contratos explicitamente presentes no contexto;
* o agente deixou TODOs em vez de implementar;
* o agente pediu para o usuário fazer algo que deveria ter feito;
* o diff indica mudança fora do escopo sem justificativa.

O reviewer pode aprovar quando:

* o pedido foi atendido;
* o diff sustenta a entrega;
* há evidência mínima de validação;
* limitações foram declaradas de forma honesta;
* pendências são realmente opcionais ou fora de escopo.

---

## 28. Critérios de Aceite da Extensão

A V1 será considerada implementada quando:

1. A extensão carrega via `/reload`.
2. O comando `/review-gate` funciona.
3. O modelo revisor pode ser configurado.
4. Configuração persiste entre sessões.
5. `agent_end` dispara review automaticamente.
6. O contexto inclui `event.messages`.
7. O contexto inclui `git status`, `git diff --stat` e `git diff` quando disponível.
8. A extensão não envia a sessão inteira por padrão.
9. A extensão consegue filtrar contexto desde a última mensagem real do usuário.
10. Resultado JSON válido é parseado.
11. Resultado aprovado não gera follow-up.
12. Resultado reprovado gera follow-up obrigatório.
13. O marcador `[review-gate:correction-request]` é usado.
14. Máximo de 2 ciclos é respeitado.
15. A extensão não entra em loop infinito.
16. Erros de reviewer são tratados.
17. Resultados são persistidos via `pi.appendEntry`.
18. O modo `warn` não bloqueia.
19. O modo `block` bloqueia por follow-up.
20. Há testes ou validação manual documentada para os fluxos principais.

---

## 29. Estrutura de Arquivos Recomendada

```txt
pi-review-gate/
  package.json
  src/
    index.ts
    config.ts
    reviewer.ts
    context.ts
    git.ts
    schema.ts
    state.ts
    commands.ts
    serialization.ts
    follow-up.ts
    utils.ts
```

---

## 30. Responsabilidade por Arquivo

### `index.ts`

* registra eventos;
* registra comandos;
* conecta módulos principais.

### `config.ts`

* lê config;
* salva config;
* aplica defaults;
* valida shape.

### `reviewer.ts`

* monta prompt;
* chama modelo revisor;
* parseia JSON;
* valida resultado.

### `context.ts`

* coleta `event.messages`;
* extrai prompt atual;
* extrai última resposta;
* coleta session slice.

### `git.ts`

* executa comandos Git;
* trata falhas;
* trunca saídas.

### `schema.ts`

* define tipos e schemas;
* valida config;
* valida resultado do reviewer.

### `state.ts`

* controla ciclos;
* detecta prompt real vs follow-up;
* impede concorrência.

### `commands.ts`

* implementa `/review-gate`;
* implementa atalhos.

### `serialization.ts`

* serializa mensagens;
* serializa tool results;
* remove campos ruidosos.

### `follow-up.ts`

* gera mensagem obrigatória;
* aplica marcador interno.

### `utils.ts`

* hashing;
* truncamento;
* extração de texto;
* safe JSON parse.

---

## 31. Pseudo-código Principal

```ts
export default function (pi: ExtensionAPI) {
  const state = createRuntimeState();

  registerCommands(pi, state);

  pi.on("agent_end", async (event, ctx) => {
    const config = await loadConfig();

    if (!config.enabled) return;
    if (state.activeReview) return;

    const currentPrompt = extractCurrentUserPrompt(event.messages);
    const isCorrectionPrompt = isReviewGateText(currentPrompt);

    if (!isCorrectionPrompt) {
      state.correctionCycle = 0;
      state.lastOriginalUserPromptHash = hash(currentPrompt);
    }

    if (!config.reviewerModel) {
      ctx.ui.notify(
        "Review Gate enabled but no reviewer model configured.",
        "warn"
      );

      pi.appendEntry("review-gate-skipped", {
        reason: "no_reviewer_model",
        timestamp: Date.now()
      });

      return;
    }

    state.activeReview = true;

    try {
      const reviewContext = await buildReviewContext({
        event,
        ctx,
        config
      });

      const result = await runReviewer({
        ctx,
        config,
        reviewContext
      });

      state.lastReviewResult = result;

      pi.appendEntry("review-gate-result", {
        ...result,
        attempt: state.correctionCycle,
        timestamp: Date.now(),
        model: config.reviewerModel
      });

      if (result.approved) {
        if (config.ui.notifyOnPass) {
          ctx.ui.notify("Review Gate approved delivery.", "info");
        }
        return;
      }

      if (config.mode === "warn") {
        ctx.ui.notify(`Review Gate warning: ${result.summary}`, "warn");
        return;
      }

      if (state.correctionCycle >= config.maxCorrectionCycles) {
        ctx.ui.notify(
          `Review Gate failed after ${config.maxCorrectionCycles} correction cycles.`,
          "error"
        );

        pi.appendEntry("review-gate-final-failure", {
          result,
          timestamp: Date.now()
        });

        return;
      }

      state.correctionCycle += 1;

      const followUp = buildCorrectionFollowUp(result);

      pi.sendUserMessage(followUp, {
        deliverAs: "followUp"
      });
    } finally {
      state.activeReview = false;
    }
  });
}
```

---

## 32. Exemplo de Config Final

```json
{
  "enabled": true,
  "mode": "block",
  "reviewerModel": {
    "provider": "openrouter",
    "id": "moonshotai/kimi-k2.5",
    "thinkingLevel": "high"
  },
  "maxCorrectionCycles": 2,
  "context": {
    "strategy": "current_run",
    "includeEventMessages": true,
    "includeSessionSlice": true,
    "maxSessionEntries": 40
  },
  "git": {
    "enabled": true,
    "includeStatus": true,
    "includeDiffStat": true,
    "includeDiff": true,
    "maxDiffChars": 60000,
    "maxStatusChars": 12000,
    "maxDiffStatChars": 12000
  },
  "reviewer": {
    "requireJson": true,
    "failClosedOnInvalidJson": true,
    "timeoutMs": 120000
  },
  "ui": {
    "notifyOnPass": true,
    "notifyOnFail": true,
    "showReviewerSummary": true
  }
}
```

---

## 33. Futuras Versões

## V2

* perfis de review;
* leitura seletiva de documentação do repo;
* detecção automática de comandos de teste esperados;
* comparação entre plano solicitado e diff;
* modo “docs only”;
* modo “implementation only”;
* política por diretório;
* suporte a múltiplos revisores.

## V3

* bloqueio visual mais forte no TUI;
* painel de histórico;
* integração com CI;
* score de qualidade por sessão;
* review incremental antes de tool calls destrutivas;
* integração com Git checkpoints;
* aprovação explícita antes de finalizar branch;
* integração com PR local.

---

## 34. Resumo Executivo

A V1 de `pi-review-gate` deve ser simples e rígida:

```txt
agent_end
  → coleta contexto do ciclo atual
  → coleta git diff/status
  → chama modelo revisor configurável
  → exige JSON
  → aprova ou injeta follow-up obrigatório
  → máximo de 2 ciclos
```

A decisão mais importante da arquitetura é:

```txt
Revisar o trabalho recém-executado, não a sessão inteira.
```

Portanto, a fonte principal deve ser:

```txt
event.messages
```

E o session context deve ser apenas um complemento filtrado:

```txt
desde a última mensagem real do usuário
```

Isso mantém a revisão objetiva, barata, menos ruidosa e alinhada com a entrega atual.