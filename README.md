# Central de Controle Orçamentário — 10º BI Mth

Aplicativo de consulta autenticada ao Google Sheets, com registro de acompanhamento em histórico separado. As fórmulas e os controles oficiais continuam na planilha.

## Uso

1. Clique em **Sincronizar Drive** e informe a chave do painel. Ela permanece na memória da página; não é incluída no código público ou na cópia local.
2. As 31 seções permitem consultar as abas, incluindo distribuição detalhada, metas, liquidação semanal, observação integral do Almox e auditoria. As seções de NC e distribuição oferecem formulários operacionais na etapa 2; os demais controles seguem como consulta e acompanhamento geral.
3. A sincronização consulta as 31 abas em lote e só aplica o conjunto após validar a resposta completa. Em caso de falha, mantém a última consulta completa e informa o erro. Trechos vazios não encerram a consulta. A API de consulta individual mantém paginação pelos limites atuais da aba.
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


## NC e distribuição — etapa 2

O módulo oferece os formulários abaixo para um único operador:

- **Cadastrar NC:** informe UG, exercício, número completo, ND, data, valores da fonte, finalidade, prazo, responsável e documento de conferência. Recebido deve ser igual a empenhado mais disponível. O cadastro é marcado para conferência com o SIAFI; não atualiza o SIAFI.
- **Confirmar UG:** selecione um registro antigo e confirme sua unidade com justificativa. Nenhuma UG é atribuída por suposição. A associação grava somente os controles e o histórico.
- **Atualizar prazo e observação:** acompanhe uma NC existente sem editar livremente os seus valores financeiros.
- **Nova distribuição:** selecione uma NC com vínculos conferidos, informe setor, responsável, valor e finalidade. O servidor relê a fonte e desconta as reservas ativas antes de aceitar o valor.
- **Cancelar ou concluir:** selecione a distribuição e justifique. O estado é atualizado sem apagar o valor, o responsável ou a finalidade originais.

Os controles UG e ID são acrescentados às colunas K:L das duas abas somente na primeira operação real, após conferir que essas colunas estão livres. Cada alteração e seu histórico são gravados na mesma requisição. Fórmulas e registros anteriores são preservados.

Os novos registros ficam dentro das primeiras 100 linhas usadas pelas fórmulas atuais. O mesmo número de NC não pode ser cadastrado em duas UGs enquanto essas fórmulas agregarem somente por número. Referências antigas sem NC correspondente, UG pendente, valores inválidos ou registros fora do intervalo exigem conferência antes de uma nova reserva. Distribuições por NE ficam para a etapa de empenhos.

**Envio sem confirmação:** mantenha a página aberta e use a consulta de confirmação. O aplicativo não repete automaticamente o envio. Uma consulta que ainda não encontrou o ID não prova que houve falha. Com a cópia local opcional habilitada, o comando e seu ID são criptografados antes do POST para permitir recuperação após recarregar a página.

O uso por várias pessoas ao mesmo tempo exige rever a coordenação de gravações. Alterações externas na planilha podem gerar conflitos de versão ou de conferência; o histórico é preservado e o aplicativo não executa desfazimento automático.

Após consultar um envio ainda não localizado e aguardar cinco minutos do último envio, fica disponível uma tentativa manual dos mesmos dados e identificador. O aplicativo consulta novamente antes de repetir e pede confirmação explícita; não gera um identificador novo. A consulta de confirmação sinaliza alterações posteriores no registro, no saldo ou nas fórmulas.

Para testar a interface fictícia: `npm run test:operational`. A prova real é o POST autenticado em `/api/operacoes` com `{"action":"test-operational-write"}`. Ela cria quatro abas temporárias isoladas, usa o mesmo serviço de cadastro/distribuição, confere saldo e histórico e remove somente as abas criadas. Não aceita nomes ou IDs de alvos do cliente e não grava cadastros fictícios nas abas oficiais.
