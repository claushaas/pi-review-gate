# Arquitetura — `pi-review-gate`

## 1. Visão Geral

`pi-review-gate` é uma extensão para o Pi Coding Agent escrita em TypeScript.

A extensão implementa um **delivery gate obrigatório** executado no evento `agent_end`. Ao final de cada ciclo de trabalho do agente, ela coleta evidências da entrega, chama um modelo revisor configurável e decide se a entrega pode ser considerada aprovada.

Se o revisor reprovar a entrega, a extensão injeta um follow-up obrigatório para que o agente corrija os problemas encontrados. O ciclo de correção é limitado a um número máximo configurável, com default de `2`.

A extensão não é uma ferramenta chamada pelo agente. Ela é uma camada externa de governança executada automaticamente pelo runtime do Pi.

---

## 2. Stack Técnica

| Área | Decisão |
|---|---|
| Linguagem | TypeScript |
| Runtime | Pi Extension Runtime |
| Package name | `pi-review-gate` |
| Lint/format | Biome |
| Test runner | Vitest |
| Test style | Unit tests + integration-style tests com mocks do Pi runtime |
| Distribuição | Pi package via npm ou instalação local |
| Configuração | Arquivo JSON local |
| Estado de sessão | `pi.appendEntry()` |
| Hook principal | `agent_end` |

---

## 3. Objetivo Arquitetural

A arquitetura deve garantir:

1. **Baixo acoplamento com o agente principal**  
   O agente não decide quando revisar.

2. **Revisão focada no ciclo atual**  
   A extensão revisa o trabalho recém-executado, não a sessão inteira.

3. **Evidência objetiva**  
   O review deve receber mensagens do ciclo atual, resposta final, `git status`, `git diff --stat` e `git diff`.

4. **Configuração explícita de modelo revisor**  
   O modelo usado para revisar deve ser configurável, independente do modelo principal do agente.

5. **Controle de loops**  
   Correções obrigatórias devem ter limite máximo de ciclos.

6. **Falha segura**  
   JSON inválido, timeout ou falha de modelo não devem ser tratados como aprovação silenciosa quando o modo for `block`.

7. **Testabilidade**  
   Lógica de contexto, Git, configuração, parsing, follow-up e estado deve ser isolada e testável com Vitest.

---

## 4. Estrutura de Diretórios

```txt
pi-review-gate/
  package.json
  tsconfig.json
  biome.json
  vitest.config.ts
  README.md

  src/
    index.ts
    commands.ts
    config.ts
    constants.ts
    context.ts
    follow-up.ts
    git.ts
    model.ts
    reviewer.ts
    schema.ts
    serialization.ts
    state.ts
    types.ts
    utils.ts

  tests/
    config.test.ts
    context.test.ts
    follow-up.test.ts
    git.test.ts
    reviewer.test.ts
    schema.test.ts
    serialization.test.ts
    state.test.ts
    index.test.ts

  examples/
    config.example.json
````

---

## 5. Responsabilidade dos Módulos

## 5.1 `src/index.ts`

Ponto de entrada da extensão.

Responsabilidades:

* exportar a factory function da extensão;
* registrar hooks;
* registrar comandos;
* inicializar estado runtime;
* carregar configuração;
* coordenar o fluxo principal em `agent_end`.

Exemplo conceitual:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCommands } from "./commands";
import { handleAgentEnd } from "./reviewer";
import { createRuntimeState } from "./state";

export default function (pi: ExtensionAPI) {
  const state = createRuntimeState();

  registerCommands(pi, state);

  pi.on("agent_end", async (event, ctx) => {
    await handleAgentEnd({ pi, event, ctx, state });
  });
}
```

---

## 5.2 `src/types.ts`

Tipos internos da extensão.

Responsabilidades:

* definir tipos de configuração;
* definir tipos de resultado do review;
* definir tipos de contexto coletado;
* evitar dependência circular entre módulos.

Tipos principais:

```ts
export type ReviewGateMode = "warn" | "block";

export type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export type ReviewerModelConfig = {
  provider: string;
  id: string;
  thinkingLevel?: ThinkingLevel;
};

export type ReviewGateConfig = {
  enabled: boolean;
  mode: ReviewGateMode;
  reviewerModel: ReviewerModelConfig | null;
  maxCorrectionCycles: number;
  context: ReviewContextConfig;
  git: GitContextConfig;
  reviewer: ReviewerRuntimeConfig;
  ui: ReviewGateUiConfig;
};

export type ReviewGateResult = {
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

## 5.3 `src/constants.ts`

Constantes globais.

Responsabilidades:

* nomes de comandos;
* marcador de follow-up injetado;
* nomes de entradas customizadas;
* paths default;
* defaults de truncamento.

Exemplo:

```ts
export const EXTENSION_NAME = "pi-review-gate";

export const CORRECTION_REQUEST_MARKER =
  "[pi-review-gate:correction-request]";

export const CUSTOM_ENTRY_REVIEW_RESULT = "pi-review-gate-result";
export const CUSTOM_ENTRY_REVIEW_SKIPPED = "pi-review-gate-skipped";
export const CUSTOM_ENTRY_FINAL_FAILURE = "pi-review-gate-final-failure";

export const DEFAULT_MAX_CORRECTION_CYCLES = 2;
```

---

## 5.4 `src/config.ts`

Carregamento, persistência e normalização da configuração.

Responsabilidades:

* resolver path de configuração;
* carregar JSON;
* aplicar defaults;
* validar configuração;
* salvar configuração;
* garantir permissões adequadas quando possível.

Path recomendado:

```txt
~/.config/pi-review-gate/config.json
```

Config default:

```ts
export const defaultConfig: ReviewGateConfig = {
  enabled: true,
  mode: "block",
  reviewerModel: null,
  maxCorrectionCycles: 2,
  context: {
    strategy: "current_run",
    includeEventMessages: true,
    includeSessionSlice: true,
    maxSessionEntries: 40,
  },
  git: {
    enabled: true,
    includeStatus: true,
    includeDiffStat: true,
    includeDiff: true,
    maxDiffChars: 60_000,
    maxStatusChars: 12_000,
    maxDiffStatChars: 12_000,
  },
  reviewer: {
    requireJson: true,
    failClosedOnInvalidJson: true,
    timeoutMs: 120_000,
  },
  ui: {
    notifyOnPass: true,
    notifyOnFail: true,
    showReviewerSummary: true,
  },
};
```

---

## 5.5 `src/schema.ts`

Validação estrutural.

Responsabilidades:

* validar `ReviewGateConfig`;
* validar `ReviewGateResult`;
* oferecer parse seguro;
* impedir que resposta malformada do modelo seja aceita.

Pode usar validação manual para reduzir dependências ou biblioteca leve como `zod`, se aceitável.

Recomendação para V1:

* evitar dependências extras;
* validar manualmente;
* manter mensagens de erro claras.

Funções esperadas:

```ts
export function validateConfig(value: unknown): ReviewGateConfig;

export function parseReviewGateResult(value: unknown): ReviewGateResult;

export function safeParseReviewGateResult(
  raw: string,
): { ok: true; value: ReviewGateResult } | { ok: false; error: string };
```

---

## 5.6 `src/state.ts`

Estado runtime da extensão.

Responsabilidades:

* controlar review ativo;
* controlar ciclos de correção;
* identificar prompt original;
* distinguir prompt real de follow-up injetado;
* evitar concorrência.

Estado recomendado:

```ts
export type RuntimeState = {
  activeReview: boolean;
  correctionCycle: number;
  lastOriginalUserPromptHash: string | null;
  lastReviewResult: ReviewGateResult | null;
};
```

Funções esperadas:

```ts
export function createRuntimeState(): RuntimeState;

export function isReviewGateInjectedText(text: string): boolean;

export function updateCycleState(params: {
  state: RuntimeState;
  currentUserPrompt: string;
}): {
  isCorrectionPrompt: boolean;
  correctionCycle: number;
};
```

Regra:

* prompt real do usuário reseta `correctionCycle`;
* prompt injetado pela extensão incrementa ou mantém ciclo conforme fluxo;
* nunca revisar simultaneamente se `activeReview = true`.

---

## 5.7 `src/context.ts`

Coleta do contexto da entrega.

Responsabilidades:

* extrair prompt atual;
* extrair última resposta do assistente;
* serializar `event.messages`;
* opcionalmente coletar slice da sessão desde a última mensagem real do usuário;
* montar `ReviewContext`.

A fonte canônica deve ser:

```ts
event.messages
```

A sessão inteira não deve ser enviada por default.

Tipo recomendado:

```ts
export type ReviewContext = {
  currentUserPrompt: string;
  serializedEventMessages: string;
  latestAssistantResponse: string | null;
  serializedSessionSlice: string | null;
  gitStatus: string | null;
  gitDiffStat: string | null;
  gitDiff: string | null;
};
```

Funções esperadas:

```ts
export async function buildReviewContext(params: {
  event: AgentEndEvent;
  ctx: ExtensionContext;
  config: ReviewGateConfig;
  gitContext: GitContext;
}): Promise<ReviewContext>;

export function extractCurrentUserPrompt(messages: unknown[]): string;

export function extractLatestAssistantResponse(messages: unknown[]): string | null;

export function collectSessionSliceSinceLastRealUserMessage(params: {
  branch: unknown[];
  maxEntries: number;
}): unknown[];
```

---

## 5.8 `src/serialization.ts`

Serialização estável das mensagens.

Responsabilidades:

* converter mensagens do Pi em texto legível;
* preservar roles;
* preservar tool calls e tool results quando disponíveis;
* remover campos ruidosos;
* truncar conteúdo longo.

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
```

Funções esperadas:

```ts
export function serializeMessages(messages: unknown[]): string;

export function serializeSessionEntries(entries: unknown[]): string;

export function getMessageText(message: unknown): string;
```

---

## 5.9 `src/git.ts`

Coleta de evidências Git.

Responsabilidades:

* executar `git status --short`;
* executar `git diff --stat`;
* executar `git diff`;
* lidar com diretórios não-Git;
* truncar saídas grandes;
* nunca executar comandos arbitrários vindos do reviewer.

Tipo recomendado:

```ts
export type GitContext = {
  status: string | null;
  diffStat: string | null;
  diff: string | null;
  unavailableReason?: string;
};
```

Funções esperadas:

```ts
export async function collectGitContext(params: {
  pi: ExtensionAPI;
  config: ReviewGateConfig;
  signal?: AbortSignal;
}): Promise<GitContext>;

export function isNotGitRepositoryError(stderr: string): boolean;
```

Comandos fixos:

```ts
await pi.exec("git", ["status", "--short"], { timeout: 10_000 });
await pi.exec("git", ["diff", "--stat"], { timeout: 10_000 });
await pi.exec("git", ["diff"], { timeout: 30_000 });
```

---

## 5.10 `src/model.ts`

Abstração para seleção e chamada de modelo.

Responsabilidades:

* encontrar modelo configurado no `ctx.modelRegistry`;
* chamar modelo revisor;
* isolar detalhes do runtime do Pi;
* facilitar mock em testes.

Interface recomendada:

```ts
export type ModelClient = {
  complete(params: {
    systemPrompt: string;
    userPrompt: string;
    model: ReviewerModelConfig;
    signal?: AbortSignal;
    timeoutMs: number;
  }): Promise<string>;
};
```

Na V1, a implementação pode seguir uma destas estratégias:

1. **Preferencial:** usar API do Pi, se houver chamada direta documentada/exposta para o modelo.
2. **Fallback:** usar provider compatível via `fetch`, desde que respeite a configuração existente.
3. **Mínimo viável:** encapsular a chamada em `model.ts` e deixar o mecanismo concreto substituível sem afetar o resto da arquitetura.

Regra importante:

```txt
Nenhum outro módulo deve chamar provider/model diretamente.
```

---

## 5.11 `src/reviewer.ts`

Orquestração da revisão.

Responsabilidades:

* coordenar o fluxo do `agent_end`;
* checar config;
* coletar Git;
* montar contexto;
* montar prompt;
* chamar modelo;
* parsear resultado;
* decidir aprovação/reprovação;
* persistir resultado;
* disparar follow-up quando necessário.

Função principal:

```ts
export async function handleAgentEnd(params: {
  pi: ExtensionAPI;
  event: AgentEndEvent;
  ctx: ExtensionContext;
  state: RuntimeState;
}): Promise<void>;
```

Funções auxiliares:

```ts
export function buildReviewerSystemPrompt(): string;

export function buildReviewerUserPrompt(context: ReviewContext): string;

export async function runReviewer(params: {
  ctx: ExtensionContext;
  config: ReviewGateConfig;
  reviewContext: ReviewContext;
  modelClient: ModelClient;
}): Promise<ReviewGateResult>;
```

---

## 5.12 `src/follow-up.ts`

Geração da mensagem obrigatória de correção.

Responsabilidades:

* criar texto de follow-up;
* incluir marcador interno;
* formatar correções requeridas;
* preservar tom diretivo;
* evitar ambiguidade.

Função esperada:

```ts
export function buildCorrectionFollowUp(result: ReviewGateResult): string;
```

Template:

```txt
[pi-review-gate:correction-request]

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

## 5.13 `src/commands.ts`

Comandos da extensão.

Responsabilidades:

* registrar `/review-gate`;
* registrar comandos auxiliares;
* permitir ativar/desativar;
* configurar modelo;
* exibir status;
* persistir alterações.

Comandos da V1:

```txt
/review-gate
/review-gate-status
/review-gate-on
/review-gate-off
/review-gate-model
```

### `/review-gate`

Menu principal.

Opções:

```txt
1. Show current config
2. Enable review gate
3. Disable review gate
4. Select reviewer model (interactive dialog when no args)
5. Set reviewer thinking level (interactive dialog when no args)
6. Set max correction cycles
7. Toggle git diff
8. Toggle session context
9. Run manual review now
```

Nas opções 4 e 5, chamar sem argumentos abre um diálogo `ctx.ui.select()` interativo. O usuário pode selecionar com ↑/↓ e Enter, ou cancelar com Escape. Chamar com argumentos configura diretamente, como antes.

### `/review-gate-status`

Exibe:

```txt
Review Gate: enabled
Mode: block
Reviewer model: provider/model
Max correction cycles: 2
Git diff included: true
Session strategy: current_run
```

---

## 5.14 `src/utils.ts`

Funções utilitárias puras.

Responsabilidades:

* hash;
* truncamento;
* safe JSON extraction;
* normalização de texto;
* formatação de listas.

Funções esperadas:

```ts
export function hashText(text: string): string;

export function truncateWithMarker(text: string, maxChars: number): string;

export function extractJsonObject(text: string): string | null;

export function formatList(items: string[]): string;
```

---

## 6. Fluxo Principal

```txt
agent_end
  ↓
loadConfig()
  ↓
if disabled → return
  ↓
if activeReview → return
  ↓
extract current user prompt
  ↓
update runtime cycle state
  ↓
if reviewer model missing → skip with warning
  ↓
collectGitContext()
  ↓
buildReviewContext()
  ↓
build reviewer prompts
  ↓
call reviewer model
  ↓
parse ReviewGateResult
  ↓
append review result
  ↓
if approved → notify pass and return
  ↓
if mode = warn → notify fail and return
  ↓
if correction cycles exceeded → append final failure and return
  ↓
build correction follow-up
  ↓
pi.sendUserMessage(followUp, { deliverAs: "followUp" })
```

---

## 7. Sequência de Execução

```txt
User prompt
  ↓
Pi agent starts
  ↓
Agent modifies files / runs tools / answers
  ↓
agent_end event fires
  ↓
pi-review-gate:
  - loads config
  - checks reviewer model
  - collects event.messages
  - collects git status/diff
  - asks reviewer model
  ↓
Reviewer returns JSON
  ↓
Approved?
  ├─ yes → append result, finish
  └─ no
      ↓
      correction cycles available?
      ├─ yes → inject mandatory follow-up
      └─ no → append final failure, notify
```

---

## 8. Estratégia de Contexto

## 8.1 Regra Central

A extensão deve revisar o **trabalho recém-executado**.

Portanto:

```txt
event.messages é a fonte primária.
```

## 8.2 Session Slice

A sessão pode ser usada como complemento, mas filtrada:

```txt
desde a última mensagem real do usuário
```

Mensagens injetadas pela própria extensão devem ser identificadas pelo marcador:

```txt
[pi-review-gate:correction-request]
```

## 8.3 Não Enviar

A extensão não deve enviar por default:

* sessão inteira;
* arquivos arbitrários;
* `.env`;
* node_modules;
* conteúdo fora do diff;
* contexto histórico não relacionado.

---

## 9. Prompt do Reviewer

## 9.1 System Prompt

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

## 9.2 User Prompt

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

## 10. Contrato do Resultado

Schema lógico:

```ts
export type ReviewGateResult = {
  approved: boolean;
  severity: "pass" | "minor" | "major" | "blocking";
  summary: string;
  requiredCorrections: string[];
  recommendedCorrections: string[];
  evidence: string[];
  confidence: "low" | "medium" | "high";
};
```

Regra de aprovação da V1:

```ts
result.approved === true
```

`severity` não deve sobrescrever `approved`.

---

## 11. Persistência

## 11.1 Configuração Local

Arquivo:

```txt
~/.config/pi-review-gate/config.json
```

Uso:

* preferências do usuário;
* modelo revisor;
* modo `warn` ou `block`;
* limites de contexto;
* limites de ciclos.

## 11.2 Persistência na Sessão

Usar:

```ts
pi.appendEntry(customType, data)
```

Tipos de entrada:

```txt
pi-review-gate-result
pi-review-gate-skipped
pi-review-gate-final-failure
```

Essas entradas:

* não entram no contexto do LLM;
* sobrevivem a reloads;
* permitem auditoria da sessão;
* permitem reconstrução parcial de estado.

---

## 12. Comportamento em Falhas

## 12.1 Modelo não configurado

Comportamento:

* não bloquear;
* avisar usuário;
* registrar skip.

Motivo:

```txt
Sem modelo configurado, a extensão não tem como revisar.
```

## 12.2 Falha de Git

Comportamento:

* não reprovar automaticamente;
* incluir indisponibilidade no contexto;
* deixar reviewer decidir com base nas evidências restantes.

## 12.3 JSON inválido

Default:

```txt
failClosedOnInvalidJson = true
```

Comportamento:

* reprovar;
* registrar erro;
* injetar follow-up informando falha de review.

## 12.4 Timeout

Comportamento:

* abortar chamada;
* registrar erro;
* notificar;
* não aprovar silenciosamente em modo `block`.

## 12.5 Erro inesperado

Comportamento:

* capturar exceção;
* notificar erro;
* registrar entrada customizada;
* liberar `activeReview` em `finally`.

---

## 13. Modos de Operação

## 13.1 `block`

Modo default.

Quando reprova:

```txt
injeta follow-up obrigatório
```

## 13.2 `warn`

Modo diagnóstico.

Quando reprova:

```txt
apenas notifica e registra resultado
```

Não injeta follow-up.

Útil durante desenvolvimento inicial da extensão.

---

## 14. Segurança

A extensão roda com permissões locais do usuário.

Regras:

1. Não executar comandos sugeridos pelo modelo revisor.
2. Não executar shell arbitrário.
3. Executar apenas comandos Git fixos.
4. Não ler `.env`.
5. Não enviar arquivos arbitrários ao modelo.
6. Não vazar API keys em logs.
7. Truncar payloads grandes.
8. Salvar config com permissão restrita.
9. Tratar output do modelo como dado não confiável.
10. Validar JSON antes de agir.

---

## 15. Testes

## 15.1 Ferramenta

Test runner:

```txt
Vitest
```

Comando esperado:

```txt
pnpm test
```

ou:

```txt
npm test
```

dependendo do package manager escolhido.

## 15.2 Estratégia

A extensão deve ser testada com:

* unit tests para módulos puros;
* mocks do `ExtensionAPI`;
* mocks do `ExtensionContext`;
* mocks de `pi.exec`;
* mocks do model client.

## 15.3 Casos de Teste Obrigatórios

### Config

* carrega default quando arquivo não existe;
* mergeia config parcial com default;
* rejeita modo inválido;
* salva config válida.

### State

* detecta prompt real;
* detecta prompt injetado;
* reseta ciclo em novo prompt real;
* respeita máximo de ciclos;
* impede concorrência com `activeReview`.

### Context

* extrai prompt atual de `event.messages`;
* extrai última resposta do assistente;
* usa `event.messages` como fonte primária;
* filtra session slice desde última mensagem real;
* ignora mensagem com marcador da extensão.

### Serialization

* serializa mensagem user;
* serializa mensagem assistant;
* serializa tool result;
* tolera formatos desconhecidos;
* trunca conteúdo grande.

### Git

* coleta `git status`;
* coleta `git diff --stat`;
* coleta `git diff`;
* lida com diretório não-Git;
* trunca diff grande.

### Reviewer

* monta prompt com seções esperadas;
* parseia JSON válido;
* rejeita JSON inválido;
* aplica `failClosedOnInvalidJson`;
* não aprova silenciosamente em timeout.

### Follow-up

* inclui marcador interno;
* inclui summary;
* inclui required corrections;
* inclui instruções obrigatórias;
* não omite severidade.

### Integration-style

* review aprovado não injeta follow-up;
* review reprovado em modo `block` injeta follow-up;
* review reprovado em modo `warn` não injeta follow-up;
* máximo de 2 ciclos é respeitado;
* modelo ausente gera skip.

---

## 16. Configuração de Biome

Arquivo:

```txt
biome.json
```

Config base recomendada:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noExplicitAny": "warn"
      },
      "style": {
        "useImportType": "error"
      }
    }
  },
  "organizeImports": {
    "enabled": true
  }
}
```

Scripts esperados:

```json
{
  "scripts": {
    "check": "biome check .",
    "check:fix": "biome check --write .",
    "format": "biome format --write .",
    "lint": "biome lint .",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

---

## 17. Configuração de Vitest

Arquivo:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
```

---

## 18. Package Manifest

`package.json` recomendado:

```json
{
  "name": "pi-review-gate",
  "version": "0.1.0",
  "description": "Mandatory review gate extension for Pi Coding Agent.",
  "type": "module",
  "main": "./src/index.ts",
  "pi": {
    "extensions": ["./src/index.ts"]
  },
  "scripts": {
    "check": "biome check .",
    "check:fix": "biome check --write .",
    "format": "biome format --write .",
    "lint": "biome lint .",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {},
  "devDependencies": {
    "@biomejs/biome": "latest",
    "@earendil-works/pi-coding-agent": "latest",
    "typescript": "latest",
    "vitest": "latest"
  }
}
```

Observação:

```txt
Se a extensão for distribuída como pacote Pi, dependências necessárias em runtime devem ficar em dependencies, não apenas devDependencies.
```

---

## 19. Contratos Internos

## 19.1 Nenhum comando arbitrário

Somente `git` fixo:

```txt
git status --short
git diff --stat
git diff
```

## 19.2 Modelo isolado

Apenas `model.ts` pode chamar modelo.

## 19.3 Follow-up sempre marcado

Todo follow-up obrigatório deve conter:

```txt
[pi-review-gate:correction-request]
```

## 19.4 Review nunca usa sessão inteira por default

Contexto permitido:

```txt
event.messages
session slice filtrado
git status
git diff stat
git diff
```

## 19.5 Resultado do modelo é não confiável

Antes de agir:

```txt
parse → validate → normalize → decide
```

---

## 20. Interfaces Principais

## 20.1 `handleAgentEnd`

```ts
export async function handleAgentEnd(params: {
  pi: ExtensionAPI;
  event: AgentEndEvent;
  ctx: ExtensionContext;
  state: RuntimeState;
}): Promise<void>;
```

## 20.2 `collectGitContext`

```ts
export async function collectGitContext(params: {
  pi: ExtensionAPI;
  config: ReviewGateConfig;
  signal?: AbortSignal;
}): Promise<GitContext>;
```

## 20.3 `buildReviewContext`

```ts
export async function buildReviewContext(params: {
  event: AgentEndEvent;
  ctx: ExtensionContext;
  config: ReviewGateConfig;
  gitContext: GitContext;
}): Promise<ReviewContext>;
```

## 20.4 `runReviewer`

```ts
export async function runReviewer(params: {
  ctx: ExtensionContext;
  config: ReviewGateConfig;
  reviewContext: ReviewContext;
  modelClient: ModelClient;
}): Promise<ReviewGateResult>;
```

## 20.5 `buildCorrectionFollowUp`

```ts
export function buildCorrectionFollowUp(result: ReviewGateResult): string;
```

---

## 21. Critérios de Aceite Arquitetural

A arquitetura está correta quando:

1. `index.ts` é fino e orquestra módulos.
2. Lógica pura fica fora do runtime do Pi.
3. `config.ts` não depende de `reviewer.ts`.
4. `reviewer.ts` não executa Git diretamente.
5. `git.ts` não conhece prompts nem reviewer.
6. `follow-up.ts` não chama `pi.sendUserMessage`.
7. `model.ts` é a única camada autorizada a chamar modelo.
8. `schema.ts` valida resultado antes de qualquer ação.
9. `state.ts` controla ciclos sem depender de filesystem.
10. Testes conseguem simular aprovação, reprovação e falhas sem carregar o Pi real.

---

## 22. Roadmap Técnico de Implementação

## Fase 1 — Bootstrap

* criar package;
* configurar TypeScript;
* configurar Biome;
* configurar Vitest;
* criar entrypoint mínimo;
* registrar `/review-gate-status`.

## Fase 2 — Config

* implementar defaults;
* carregar config;
* salvar config;
* validar config;
* testes de config.

## Fase 3 — Estado e Marcadores

* implementar runtime state;
* detectar prompt injetado;
* controlar ciclos;
* testes de state.

## Fase 4 — Contexto

* serializar `event.messages`;
* extrair prompt atual;
* extrair última resposta;
* filtrar session slice;
* testes de context/serialization.

## Fase 5 — Git

* coletar status;
* coletar diff stat;
* coletar diff;
* tratar diretório não-Git;
* truncar outputs;
* testes de git.

## Fase 6 — Reviewer

* montar prompts;
* chamar model client;
* parsear JSON;
* validar resultado;
* tratar JSON inválido;
* testes de reviewer.

## Fase 7 — Follow-up

* gerar mensagem obrigatória;
* injetar com `deliverAs: "followUp"`;
* respeitar modo `warn` e `block`;
* respeitar máximo de ciclos;
* testes integration-style.

## Fase 8 — Commands

* `/review-gate`;
* `/review-gate-on`;
* `/review-gate-off`;
* `/review-gate-model`;
* `/review-gate-status`.

## Fase 9 — Hardening

* erros;
* timeouts;
* logs mínimos;
* documentação;
* exemplos;
* validação manual com `/reload`.

---

## 23. Decisões Mantidas da SPEC Funcional

| Decisão                                                        | Status     |
| -------------------------------------------------------------- | ---------- |
| Nome `pi-review-gate`                                          | Mantido    |
| Hook em `agent_end`                                            | Mantido    |
| Mensagem final pode aparecer antes do review                   | Aceito     |
| Modelo revisor configurável                                    | Mantido    |
| Contexto principal via `event.messages`                        | Mantido    |
| Session context filtrado desde última mensagem real do usuário | Mantido    |
| Git diff/status incluídos                                      | Mantido    |
| Reprovação injeta follow-up obrigatório                        | Mantido    |
| Máximo de 2 ciclos                                             | Mantido    |
| TypeScript                                                     | Adicionado |
| Biome                                                          | Adicionado |
| Vitest                                                         | Adicionado |

---

## 24. Resumo Executivo

`pi-review-gate` deve ser arquitetada como uma extensão TypeScript modular, testável e segura.

O núcleo da arquitetura é:

```txt
agent_end
  → build context
  → collect git evidence
  → call reviewer model
  → validate JSON
  → approve or inject mandatory follow-up
```

A regra mais importante:

```txt
A extensão revisa a entrega atual, não a sessão inteira.
```

A segunda regra mais importante:

```txt
O modelo revisor nunca executa ações; ele apenas retorna um veredito validado.
```

A terceira regra mais importante:

```txt
Em modo block, ausência de evidência suficiente não deve virar aprovação silenciosa.
```
