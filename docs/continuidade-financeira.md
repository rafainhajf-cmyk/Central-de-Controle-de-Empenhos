# Continuidade financeira — 28/10/2026

Base: commit de produção de9c717ab4e35d0c121fa8fbb7c045c13ee256f2, em cópia isolada. Os oito testes existentes passaram.

Execução direta das tarefas de livro financeiro, conciliação e reserva por NE do plano de conclusão de 27/10. A persistência Neon e o login individual publicados posteriormente prevalecem sobre o armazenamento Sheets e a chave compartilhada do plano antigo. Não alterar saldos oficiais nem gravar no SIAFI.

## Contratos e tarefas

1. Modelo puro: fonte financeira identificada por UG/exercício/NE, versão baseada nos valores financeiros e data de origem; marco explícito, movimentos imutáveis, estorno único, documento não repetido, reservas internas e cálculos em centavos seguros. Uma fonte alterada bloqueia novos movimentos até conciliação explícita dos eventos incorporados.
2. Persistência: migração aditiva 005, livro versionado por NE, comandos idempotentes por UUID, auditoria com identidade histórica no mesmo commit. Bloqueio transacional em ordem corrente da fonte → campos manuais → livro; sincronização não troca a fonte durante a gravação. Acesso financeiro de gravação para administrador/gestor, consulta segundo setor atual.
3. API e interface: GET do livro/histórico/resultado incerto e POST protegido por origem/CSRF. Formulários com fonte e saldo operacional separados, conciliação, liquidação, anulação, estorno e reserva. Erro de rede conserva o mesmo comando; consultar antes de repetição explícita.
4. Verificação: testes de domínio, banco real em memória (PGlite), API e navegador, regressões e revisão independente. Candidata antes de promoção; backup Neon e validação de recuperação antes de migração real.

## Ledger

- Ruling: usar o Neon já publicado para o livro financeiro — mantém transações e identidade individual sem criar uma segunda fonte editável em Sheets — custo se incorreto: adaptar o armazenamento mantendo os eventos.
- Pre-flight: modelo → persistência consome/aplica livro puro; persistência → API preserva versão e resultado por UUID; API → interface consulta apenas registros autorizados. A consulta gerencial mantém seus saldos importados e recebe os dados do livro separadamente.
- Baseline: testes existentes 8/8, nenhuma alteração de produto.
- Tarefas 1–3 implementadas: modelo, migração 005, API, auditoria, formulários e recuperação por UUID. Testes locais 28/28; navegador com API real/PGlite validou conciliação, liquidação, resposta perdida, confirmação sem duplicar, recarga, estorno, reserva/cancelamento, Excel, tela móvel, cópia criptografada e senha incorreta.
- Revisão independente de domínio/store/API/UI não encontrou bloqueadores P0–P2. Lacunas de concorrência real e recuperação criptografada foram explicitadas; ensaio PostgreSQL em candidata pendente.
- Backup: snapshot `snap-spring-firefly-b56cegyg`, com expiração em 28/11/2026. O comando de restauração sem `finalize:false` também finalizou a troca de ramificações: o endpoint de produção passou a `br-bold-dawn-b586udr0`; a antiga `br-frosty-rain-b5r19qtv` foi preservada. A comparação confirmou hashes iguais de fontes e campos manuais. As 253 atividades da ramificação atual têm criação em 29/10/2026 00:24:56 UTC, depois da troca às 00:07 UTC.
- Ruling: preservar a ramificação atual e seus registros novos — voltar ao snapshot anterior descartaria atividades posteriores — custo: a identificação de infraestrutura de produção mudou e deve ser considerada nas próximas operações Neon. Nenhum retorno destrutivo foi executado.
- Base de teste criada explicitamente como filha da produção atual: `br-lucky-dust-b5qzt0mi`, contendo as mesmas 253 atividades e 75 fontes/campos manuais. Migração 005 aplicada somente nessa filha. Nova tentativa de snapshot foi recusada pelo limite da conta; o snapshot anterior e as ramificações preservadas permanecem disponíveis.
- A candidata usa `DATABASE_URL` sensível limitado à ramificação Git `codex/continuidade-financeira` no ambiente Preview. O ensaio PostgreSQL recusa o hostname de produção e exige endpoint de teste explícito; não lê nem exporta as credenciais de produção.
