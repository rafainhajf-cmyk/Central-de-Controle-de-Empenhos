# Ambientes e banco de dados (prévias da Vercel)

## Situação encontrada na revisão
Todo build (`npm run build`) executa `prepare` e `prepareSources` contra o banco apontado por `DATABASE_URL`.
Na Vercel, as variáveis de **Preview** (qualquer branch) e de **Production** apontam, hoje, para o mesmo banco.
Resultado: uma branch de teste com migração nova alteraria o banco real antes de o PR ser aprovado.
As migrações atuais são aditivas e idempotentes, o que reduz o risco, mas não o elimina.

## Como separar (feito pelo titular, no Neon e na Vercel; não envolve código)
1. No Neon, abra o projeto do banco de produção e crie uma **branch** (por exemplo `preview`) a partir da principal.
   A branch é uma cópia isolada; alterações nela não chegam à produção.
2. Copie a string de conexão da branch `preview`.
3. Na Vercel: projeto `empenhos` → Settings → Environment Variables.
   Edite `DATABASE_URL` (e as variáveis `POSTGRES_*`/`NEON_*`, se existirem) e deixe o valor de produção **apenas** em *Production*.
   Crie o valor da branch `preview` **apenas** em *Preview*.
4. Faça um novo deploy de prévia e confirme, no log do build, que a linha `CENTRAL_RELEASE_CHECK` mostra o `databaseEndpoint`
   da branch `preview`, e não o da produção.
5. Opcional: renove a branch `preview` periodicamente a partir da principal, para testar com dados parecidos com os reais.

## Regra para quem altera o sistema (Claude, ChatGPT/Codex e pessoas)
- Migrações novas só podem ser aditivas e idempotentes.
- Nunca apontar o ambiente de Preview para o banco de produção.
