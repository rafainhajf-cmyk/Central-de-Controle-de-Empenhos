# NC e distribuição — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para execução direta nesta sessão, ou superpowers:subagent-driven-development se esse método for escolhido pelo usuário. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir cadastro de NC, confirmação de UG, distribuição e encerramento nas abas oficiais, com preservação de fórmulas, auditoria e recuperação de resultado incerto.

**Architecture:** O aplicativo continuará usando a planilha como fonte. Um serviço operacional lerá versões dos registros, validará comandos e enviará a alteração e o acréscimo de histórico em um único batchUpdate; um módulo de interface consumirá esse serviço e manterá rascunhos e IDs de envio. Não será criada outra base de dados.

**Tech Stack:** Node.js 24 na Vercel, CommonJS nos endpoints, JavaScript/HTML no navegador, Google Sheets API v4, node:test e Playwright já presentes no projeto.

**Spec:** `docs/superpowers/specs/2026-10-26-nc-distribuicao-design.md`

## Global Constraints

- O usuário confirmou que será o único operador de lançamentos.
- As UGs disponíveis inicialmente serão 160111 e 167111.
- O exercício deve coincidir com o prefixo do número.
- Não será atribuída UG automaticamente aos registros antigos.
- Nesta etapa, não serão inseridos registros operacionais depois da linha 100.
- A alteração operacional e uma nova linha em Histórico serão enviadas juntas.
- O endpoint atual api/lancamentos.js continuará append-only para acompanhamentos gerais.
- O responsável declarado não será apresentado como identidade individual autenticada.
- Não serão inseridos cadastros fictícios nas abas oficiais nem credenciais/dados administrativos no repositório.
- Valores financeiros de NCs existentes e fórmulas de crédito não serão editados por esta etapa.
- Um número de NC já existente bloqueará um novo cadastro mesmo que a UG informada seja diferente, pois as fórmulas atuais somam por número.

## Review Focus

1. Duas UGs com o mesmo número de NC não podem produzir saldos separados quando as fórmulas existentes somam juntas; cobrir nas tarefas 1 e 2.
2. Distribuição antiga sem data ou UG e referência ausente não podem desaparecer dos cálculos nem receber identidade presumida; cobrir nas tarefas 1 e 3.
3. Resultado de envio perdido após o Google gravar não pode acionar uma repetição automática; cobrir nas tarefas 2 e 4.
4. Dados inseridos depois de uma lacuna e células de controle inesperadamente ocupadas não podem ser sobrescritos; cobrir nas tarefas 1 e 2.
5. Restauração de cópia local durante digitação ou depois de sua remoção deve respeitar as proteções da etapa 1 também para os novos formulários; cobrir na tarefa 4.

---

## Mapa de arquivos

- `lib/google-sheets.js`: autenticação existente, JWT/OAuth e transporte autenticado Google; nenhuma chave em código.
- `lib/operational-model.js`: validação de comandos, centavos, identidade e versões; sem efeitos externos.
- `lib/operational-store.js`: leitura das abas, construção da alteração restrita e da auditoria, envio e conferência.
- `api/operacoes.js`: contrato HTTP autenticado para leitura, comandos e consulta de confirmação.
- `lib/operational-probe.js`: prova isolada em quatro abas temporárias; acessível somente pelo comando autenticado de teste.
- `operational-ui.js` e `operational-ui.css`: formulários e estados de envio legíveis, sem expor campos técnicos ao operador.
- `index.html`: montar o módulo nas seções existentes e incluir seu estado na cópia criptografada.
- `tests/operational-model.test.js`, `tests/operational-store.test.js`, `tests/operacoes.test.js`, `tests/operational-browser.cjs`: testes dos contratos correspondentes.
- `README.md` e `docs/estado-do-projeto.md`: uso, limites e provas da etapa concluída.

## Contratos compartilhados

`Command` tem `operationId` UUID, `action`, `owner`, `document`, `note` e os campos específicos da ação. As ações serão `create-nc`, `associate-ug`, `update-nc-followup`, `create-distribution` e `close-distribution`.

Valores monetários na API serão inteiros em centavos: `receivedCents`, `committedCents`, `availableCents`, `amountCents`. Datas serão `YYYY-MM-DD` na API e `DD/MM/YYYY` nas células de operação. Datas/horas de auditoria serão ISO UTC, apresentadas em America/Sao_Paulo na interface.

`RecordRef` tem `kind: 'nc' | 'distribution'`, `id` quando já existir, `row` e `version`. A linha é uma indicação para localizar um registro legado; o servidor sempre relê e valida conteúdo, ID e versão antes de escrever.

`ReadModel` tem `ncs`, `distributions`, `sourceDate`, `readAt` e `issues`. Cada registro inclui `ref`, valores legíveis e pendências de vínculo. Nenhum saldo enviado pelo navegador será aceito como fonte de autorização.

`OperationResult` tem `operationId`, `state: 'confirmed' | 'confirmed-with-conflict'`, `record`, `version`, `at` e eventual `issues`. Uma consulta de confirmação retorna esse resultado quando encontrado ou `state: 'not-found-yet'`; ausência na consulta não será apresentada como prova de que o envio falhou.

Erros de validação retornam HTTP 400; conflito de versão/estrutura/vínculo/saldo, 409; acesso inválido ou expirado, 401; limite de leitura, 413; indisponibilidade Google, 503 ou 429. Uma escrita de resultado desconhecido retorna `code: 'RESULT_UNCERTAIN'` e mantém o ID para consulta.

### Task 1: Leitura operacional e validação dos registros

**Files:** criar `lib/google-sheets.js`, `lib/operational-model.js`, `lib/operational-store.js`; testar em `tests/operational-model.test.js` e `tests/operational-store.test.js`.

**Interfaces:**
- Consome as variáveis já existentes `APP_ACCESS_TOKEN`, `APP_ACCESS_EXPIRES_AT`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`.
- Produz `authorized(req): boolean`, `accessToken(scope): Promise<string>`, `googleJson(url, token, options): Promise<object>` em `lib/google-sheets.js`.
- Produz `validateCommand(input): Command`, `recordVersion(cells): string`, `ncKey(ug,year,nc): string` em `lib/operational-model.js`.
- Produz `readOperationalState(context): Promise<State>` e `toReadModel(state): ReadModel` em `lib/operational-store.js`. Contexto de produção usa os IDs reais já examinados; contexto alternativo só poderá ser criado internamente pela prova isolada.

- [ ] **Step 1 — escrever testes que falham.** Validar UUID, UG, exercício/prefixo, ND de seis dígitos, datas bissextas e valores em centavos seguros; rejeitar decimal JSON, valor negativo e soma recebido diferente de empenhado + disponível. Ler uma distribuição sem data e comprovar sua presença. Sinalizar referência ausente, UG pendente, referência duplicada e número repetido em outra UG. Preservar linhas preenchidas após lacunas e detectar fórmula/célula de controle ocupada.
- [ ] **Step 2 — executar `node --test tests/operational-model.test.js tests/operational-store.test.js`.** Confirmar falha por contratos ausentes ou comportamento ainda não implementado.
- [ ] **Step 3 — implementar os contratos acima.** Ler CellData das duas abas operacionais até a linha 100, o cabeçalho/linhas existentes de Histórico por limites atuais e o retrato financeiro do painel. Recusar leitura incompleta e histórico acima de 10.000 linhas, sem truncar. Usar `userEnteredValue` para detectar fórmulas e versões. Aceitar K:L vazias ou exatamente UG/ID de controle; outro conteúdo impede preparação.
- [ ] **Step 4 — executar a suíte inteira com `node --test tests/*.test.js`.** Todos os testes existentes e novos devem passar; não alterar os contratos dos endpoints publicados apenas para compartilhar código.
- [ ] **Step 5 — registrar a tarefa em commit na ramificação `feature/nc-distribuicao`.**

### Task 2: Comandos de NC e histórico atômico

**Files:** ampliar `lib/operational-store.js`; criar `api/operacoes.js`; ampliar testes de modelo/armazenamento e criar `tests/operacoes.test.js`.

**Interfaces:**
- Consome `Command`, `State`, transporte e versões da tarefa 1.
- Produz `executeOperation(context, command): Promise<OperationResult>` e `findOperation(context, operationId): Promise<OperationResult | null>`.
- HTTP GET sem ID retorna `ReadModel`; GET `operationId` consulta confirmação; POST recebe um `Command`. Seletores de planilha/aba/contexto fornecidos pelo cliente serão recusados.

- [ ] **Step 1 — escrever testes que falham.** Cadastrar uma NC em A:L e acrescentar uma linha de Histórico na mesma chamada batchUpdate. Confirmar que E:G contêm números corretos, I não inventa informação de idade da fonte e J identifica cadastro manual a conferir. Associar UG de legado mudando só K:L. Alterar acompanhamento de NC existente mudando só H/J. Rejeitar duplicidade global de número, versão divergente, fórmula-alvo, cabeçalho divergente e próxima linha depois de 100. Testar repetição sequencial do mesmo UUID, mudança do conteúdo usando um UUID já confirmado e falha após o envio.
- [ ] **Step 2 — executar `node --test tests/operational-store.test.js tests/operacoes.test.js` e confirmar as falhas esperadas.**
- [ ] **Step 3 — implementar os comandos e o endpoint.** Preparar K:L quando ainda estiverem vazias, na mesma requisição da operação real; nunca por uma consulta GET. Calcular a próxima linha após a última linha com dados em A:L. Gravar texto com `stringValue` e dinheiro com `numberValue`; não aceitar fórmulas do cliente.
- [ ] **Step 4 — implementar auditoria e confirmação.** Histórico A:I recebe data UTC, operação, chave, setor, responsável declarado, antes JSON, depois JSON, documento e metadados de controle contendo versão, UUID e hash do comando. Detectar o UUID antes de escrever; conteúdo diferente com o mesmo UUID gera conflito. Fazer uma única escrita do registro e auditoria e reler o resultado. Se a resposta da escrita for perdida, retornar resultado incerto, sem reenviar nem executar desfazimento automático.
- [ ] **Step 5 — executar toda a suíte e registrar commit.** Provar também que 401/expiração não fazem chamadas ao Google e que `api/lancamentos.js` mantém seu comportamento append-only.

### Task 3: Reserva, cancelamento e conclusão de distribuição

**Files:** ampliar `lib/operational-model.js` e `lib/operational-store.js`; ampliar `tests/operational-model.test.js` e `tests/operational-store.test.js`.

**Interfaces:**
- Consome o executor e a auditoria da tarefa 2.
- Acrescenta as ações `create-distribution` e `close-distribution` a `executeOperation`.
- Produz `distributionBalance(state, ncRef): {availableCents,reservedCents,freeCents,issues}`.

- [ ] **Step 1 — escrever testes que falham.** Disponível 10.000 centavos e reserva ativa 7.000 permitem nova distribuição de 3.000 e recusam 3.001. Cancelada/Concluída não reservam. Legado sem data continua contando; UG pendente, UG incompatível, saldo inválido e NC ausente bloqueiam nova reserva. Valor positivo, documentos e responsáveis são obrigatórios. Saldo vindo do cliente não muda o resultado. Referências por NE ficam fora da criação desta etapa.
- [ ] **Step 2 — testar cancelamento/conclusão antes da implementação.** Alterar somente G e acompanhamento J, com justificativa e auditoria; preservar responsável, valor e finalidade originais. Exigir versão atual e vínculo da distribuição confirmado. Recusar reabertura/novo encerramento de registro terminal. Cancelamento com NC ausente pode ser registrado se a distribuição tiver UG confirmada, sem criar NC ou inventar saldo.
- [ ] **Step 3 — executar os testes e confirmar as falhas.**
- [ ] **Step 4 — implementar os comandos.** Recalcular no servidor com o estado recém-lido e os mesmos critérios das fórmulas. H:I recebem os valores de referência da NC ao criar. A auditoria usa o mesmo protocolo da tarefa 2. Reler o estado após a escrita; se houver alteração externa ou divergência de saldo, retornar `confirmed-with-conflict`, sem apagar operação ou histórico.
- [ ] **Step 5 — executar a suíte completa e registrar commit.**

### Task 4: Interface, rascunho e recuperação de envio

**Files:** criar `operational-ui.js`, `operational-ui.css` e `tests/operational-browser.cjs`; modificar `index.html` e ampliar `tests/browser-check.cjs`.

**Interfaces:**
- Consome o contrato HTTP da tarefa 2, incluindo as ações da tarefa 3.
- Produz `OperationalUI.mount({root,getToken,onRefresh,onDraftChange}): controller`; o controller oferece `show(moduleId)`, `serializeDraft()` e `restoreDraft(value)`.
- `index.html` monta o módulo nas seções de NC/distribuição e inclui `operationalDraft` no objeto já criptografado. A restauração respeita os campos editados e o cancelamento de cópia local da etapa 1.

- [ ] **Step 1 — escrever teste de navegador que falha com respostas HTTP controladas.** Exibir lista de NCs/UG pendente, confirmar associação com justificativa, criar NC, reservar crédito, cancelar/concluir e consultar resumo do histórico. Exibir data da fonte separada da consulta. Não exigir UUID ou versão ao usuário. Mostrar confirmação antes de gravar e bloquear duplo clique.
- [ ] **Step 2 — acrescentar testes de falha.** Simular erro antes da escrita e resposta perdida após gravação, preservar o formulário e operationId, consultar confirmação sem novo POST automático. Recarregar com cópia criptografada, preservar edição feita antes da restauração e impedir recriação da cópia removida. Simular conflito de versão/saldo e manter o rascunho.
- [ ] **Step 3 — executar os testes de navegador e registrar as falhas esperadas.**
- [ ] **Step 4 — implementar os formulários e estados.** API transporta centavos; o formulário aceita valores brasileiros com até duas casas, rejeita entradas ambíguas/inválidas e apresenta o valor normalizado antes da confirmação. Um resultado incerto só oferece consulta de confirmação e orientação de conferência; não libera repetição automática porque uma consulta ainda não encontrou o UUID.
- [ ] **Step 5 — executar `node --test tests/*.test.js`, `node tests/browser-check.cjs` e `node tests/operational-browser.cjs`; corrigir qualquer regressão e registrar commit.**

### Task 5: Prova real isolada e publicação

**Files:** criar `lib/operational-probe.js`; ampliar `api/operacoes.js`, testes do endpoint, `README.md` e `docs/estado-do-projeto.md`.

**Interfaces:**
- Consome o mesmo `executeOperation` e leitor utilizados em produção, com um Contexto criado internamente.
- Produz `runOperationalProbe(): Promise<{verified,cleanedUp,officialDataChanged,at}>`; POST autenticado `action: 'test-operational-write'` chama essa função, sem aceitar alvos do cliente.

- [ ] **Step 1 — escrever testes que falham para a prova.** Criar quatro abas com prefixo aleatório de teste e guardar apenas seus IDs retornados; executar fixtures fictícias de NC, distribuição, crédito e histórico; remover somente esses IDs no finally. Falha de limpeza retorna os nomes temporários, sem afirmar sucesso. Recusar qualquer tentativa de passar nomes/IDs oficiais pelo cliente.
- [ ] **Step 2 — implementar a prova isolada.** Verificar cadastro, associação de UG, reserva, saldo calculado por fórmula de teste, cancelamento, repetição e histórico. Exercitar também a recusa de saldo insuficiente, versão alterada e célula-alvo com fórmula. Os dados fictícios e fórmulas de teste não entram nas abas oficiais.
- [ ] **Step 3 — executar todos os testes locais, verificar `git diff --check` e solicitar revisão de código.** Corrigir os achados importantes antes de criar a candidata.
- [ ] **Step 4 — criar candidata protegida na ramificação da etapa.** Conferir o ambiente antes de aproveitar permissões de teste; usar acesso temporário expirável, sem substituir a chave de produção. Se configurações sensíveis precisarem ser movidas temporariamente para capturar a candidata, restaurar o escopo de produção em finally e conferir o resultado.
- [ ] **Step 5 — executar a prova real isolada e conferir os dados oficiais antes/depois.** Exigir `verified: true`, `cleanedUp: true`, ausência de abas temporárias e preservação dos registros, cabeçalhos e fórmulas oficiais. A ativação dos cabeçalhos K:L oficiais ocorre somente em uma operação real autorizada pelo operador, não pela prova.
- [ ] **Step 6 — verificar no navegador da candidata a leitura dos registros reais e a recusa de envio inválido, sem cadastrar registros fictícios oficiais.** Revogar acessos temporários e invalidar a configuração de teste após concluir.
- [ ] **Step 7 — atualizar documentação com evidências reais, integrar a PR e acompanhar a implantação até READY.** Conferir a URL pública, a correspondência dos arquivos com a versão testada, HTTP 401 sem chave e logs de erros da nova implantação. Relatar o que foi concluído e as etapas operacionais restantes.

## Revisão do plano

Os critérios do desenho estão distribuídos entre leitura/validação (1), NC/histórico (2), distribuição (3), interface/recuperação (4) e prova/publicação (5). Os cinco riscos de Review Focus têm testes explícitos. Os contratos de estado, comando e confirmação são compartilhados entre as tarefas. Não há criação de banco de dados, edição de fórmulas existentes, migração presumida de UG ou inclusão das etapas posteriores.
