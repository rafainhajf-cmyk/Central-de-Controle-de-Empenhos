# Regras para agentes de IA (Claude, Codex/ChatGPT e outros)

Projeto: Central de Controle Orçamentário — 10º BI Mth.
Vercel: projeto `empenhos`. Banco: PostgreSQL no Neon (schema `central_day`). Branch principal: `main`.

## Regras obrigatórias

1. Preservar todos os dados e lançamentos existentes.
2. Não recriar nem substituir o banco de dados. Migrações só aditivas (`CREATE ... IF NOT EXISTS`, `ADD COLUMN`); nunca `DROP`, `TRUNCATE` nem `DELETE` sem autorização expressa do titular.
3. Não excluir funcionalidades existentes.
4. Fazer alterações de forma incremental, em pequenos commits.
5. Testar antes de publicar: `npm test` (usa PGlite, banco isolado). Nunca rodar `npm run build` nem testes de integração (`test:integration`) contra o `DATABASE_URL` de produção.
6. Confirmar, quando houver acesso a uma instância de teste, que os dados continuam disponíveis após atualizar a página e fazer login.
7. Não publicar nenhuma alteração sem autorização do titular.

## Fluxo de trabalho (várias ferramentas)

- **Nunca** fazer push direto na `main`: cada push na `main` publica em produção na Vercel.
- Trabalhar em branch própria: `claude/<assunto>` ou `codex/<assunto>`.
- Antes de começar: `git fetch` e partir da `main` mais recente.
- Entregar por pull request e aguardar a aprovação do titular. Quem une à `main` é o titular.
- Descrever no PR o que mudou, como foi testado e se há migração de banco.

## Segredos

- Nunca colocar no repositório, em logs ou em mensagens: `DATABASE_URL`, `POSTGRES_*`, `NEON_*`, `APP_ACCESS_TOKEN`, `CRON_SECRET`, chaves do Google, senhas ou links de login.
- Não ler nem decifrar valores de variáveis de ambiente da Vercel, salvo pedido expresso.
- Não incluir dados reais de empenhos em testes; usar dados fictícios (`tests/fixtures`).

## Mapa rápido

- `api/`: funções serverless (operações, sincronização, gerencial, Meu Dia, financeiro, lançamentos).
- `lib/`: regras de negócio e acesso ao banco. `migrations/`: SQL aditivo numerado.
- `*.html`, `*-ui.js`, `*-client.js`: interface. `tests/`: testes (`npm test`).
- Sincronização automática diária às 10h15 (Brasília), definida em `vercel.json`.
