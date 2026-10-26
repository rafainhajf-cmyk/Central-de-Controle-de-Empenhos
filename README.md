# Central de Controle Orçamentário — 10º BI Mth

Aplicativo de consulta autenticada ao Google Sheets, com registro de acompanhamento em histórico separado. As fórmulas e os controles oficiais continuam na planilha.

## Uso

1. Clique em **Sincronizar Drive** e informe a chave do painel. Ela permanece na memória da página; não é incluída no código público ou na cópia local.
2. As 31 seções permitem consultar as abas, incluindo distribuição detalhada, metas, liquidação semanal, observação integral do Almox e auditoria. Consultar uma aba não significa que seus formulários operacionais já foram implementados no aplicativo.
3. A sincronização troca os dados de cada aba somente após concluir todas as suas páginas. Em caso de falha, mantém a última consulta completa e informa o erro. Trechos vazios não encerram a paginação.
4. CSVs importados ficam separados dos dados consultados no Drive.
5. A cópia local é opcional e criptografada com AES-GCM e chave derivada por PBKDF2. Ela inclui dados consultados e rascunhos. Ative somente em computador autorizado; recupere usando a mesma chave do painel. A cópia não substitui o histórico no Drive. Use **Apagar cópia local** para removê-la.
6. O acompanhamento manual acrescenta uma linha à aba **Lançamentos do aplicativo**; não altera NCs, NEs, contratos, processos ou fórmulas. Confira esse histórico antes de repetir um envio sem confirmação, pois o Google pode ter recebido a gravação mesmo que a resposta tenha sido perdida.

## Teste de gravação sem lançamentos oficiais

O botão **Testar gravação isolada** exige a mesma autenticação do painel. A API cria uma aba temporária oculta, acrescenta dois registros fictícios com a opção RAW, lê os dois para verificar que o segundo não substituiu o primeiro e remove somente a aba recém-criada. Nenhum registro é acrescentado ao histórico oficial. Se a limpeza falhar, a resposta identifica a aba temporária a remover. A criação/remoção da aba pode aparecer no histórico administrativo do Google.

Um teste local com respostas simuladas não comprova as permissões reais da conta de serviço. Essa confirmação exige executar o botão na implantação com as credenciais configuradas e obter `verified: true` e `cleanedUp: true`.

## Configuração e publicação

Projeto Vercel existente: `empenhos`. Configure `APP_ACCESS_TOKEN` (mínimo de 24 caracteres e alta entropia), `GOOGLE_SERVICE_ACCOUNT_EMAIL` e `GOOGLE_PRIVATE_KEY` como variáveis sensíveis no ambiente de destino. Compartilhe a planilha com a conta de serviço. Nunca inclua valores dessas variáveis, exports administrativos, dados pessoais ou cópias de planilhas no GitHub.

Os cabeçalhos da aba de acompanhamento devem ser exatamente: ID; Data/hora UTC; Tipo; Referência; Responsável; Situação; Observação. A API recusa gravações se houver divergência e rejeita texto acima do limite, sem truncá-lo.

Execute `npm test` com Node.js 22 ou superior. Para o teste do navegador, instale as dependências de desenvolvimento e tenha Google Chrome instalado; execute `npm run test:browser`. Os testes usam dados fictícios e não gravam no Google.

Publique primeiro uma versão candidata, verifique interface e APIs, e só depois promova para produção. Credenciais marcadas como sensíveis na Vercel não podem ser recuperadas para testes locais.

## Etapas seguintes

Veja `docs/estado-do-projeto.md`. A cobertura de consulta das 31 abas não representa equivalência funcional completa com a planilha.
