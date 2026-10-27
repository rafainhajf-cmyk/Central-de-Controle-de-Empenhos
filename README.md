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

## Migração para o banco — 27/10/2026

O projeto `empenhos` usa agora `DATABASE_URL` da integração Neon. `npm run build` cria a estrutura e, somente quando não existe base, importa as 31 tabelas completas através da conta de serviço, confere a leitura e preserva o retrato original em `imported_datasets`. Publicações posteriores não reimportam nem substituem os dados.

A interface usa `/api/programa` para ler, acrescentar e editar registros. Uma revisão global impede sobrescrever alterações concorrentes; a alteração e seu histórico são salvos na mesma instrução SQL. Comandos possuem UUID para confirmar repetições sem duplicar gravações. Não há exclusão de registros. O responsável é uma declaração do operador, não autenticação de identidade pessoal. A sessão segura HttpOnly dura 30 dias. As rotas antigas de gravação no Google ficam indisponíveis quando `DATABASE_URL` está configurada.

As 6.029 fórmulas atuais foram convertidas para um interpretador restrito no servidor. Elas recalculam dependências, reservas ativas, saldos, pendências, metas, percentuais, vínculos do Almox e vigências a partir dos dados do Neon. As regras são capturadas uma única vez e mantidas no banco, sem consulta ao Sheets durante o uso. A instalação exige comparação de todos os resultados com a origem, sem divergências, e mantém os valores editáveis e a importação arquivada. Resultados calculados ficam protegidos contra alteração manual na tela e na API. Novos registros nas tabelas de entidades recebem os padrões repetidos de cálculo; fontes SIAFI e totais que eram valores fixos continuam representando o retrato importado, até atualização explícita desses dados. A conversão não transforma informações fixas da origem em fórmulas nem comprova atualização do SIAFI. Consultas ao trabalho externo do Almox e conciliação de novas fontes ainda precisam de fluxo próprio que preserve as edições. CSV e PDF da consulta incluem os resultados recalculados.

Validação: `npm test` e `node tests/program-browser.cjs`. Os testes do navegador antigo (`test:browser`, `test:operational`) são históricos da versão Sheets.

A comparação da conversão cobre resultados numéricos com tolerância absoluta inferior a um milionésimo, textos e vazios. Datas correntes usam America/Sao_Paulo no programa. O retrato da origem é conferido no fuso declarado da planilha. Testes adicionais: `tests/calculation-engine.test.js`, incluindo propagação de edições, reservas canceladas/concluídas, datas, novos registros, erros e ciclos.

## Distribuição simples em Créditos

A seção Créditos apresenta o total “Distribuído por nós”, o saldo livre e os setores de cada NC. O botão “Distribuir” abre NC, setor e valor; responsável e observação são opcionais. O total distribuído inclui distribuições concluídas e exclui canceladas; o saldo livre desconta apenas reservas em aberto, evitando descontar novamente valores já empenhados. Valores são validados em centavos no servidor. NCs duplicadas e dados financeiros incertos exigem conferência antes da reserva.

A ação `distribute-credit` relê os dados do banco, valida a revisão e o saldo, preenche a primeira linha inteiramente livre em Distribuições detalhadas, recalcula os indicadores e grava distribuição e auditoria no mesmo comando SQL. O UUID confirma repetições sem duplicar o lançamento. A tela não envia saldos calculados pelo cliente. Não há gravação na planilha do Google. Exportações CSV e PDF de Créditos incluem os totais de distribuição. Verificação da interface: `node tests/credit-browser.cjs`.

## Providências e pendências do fiscal

No diálogo de destinação da NC, o operador pode distribuir para setor, solicitar recolhimento ou solicitar mudança de ND. As solicitações exigem valor, número do DIEx e, na mudança, ND de destino. A observação curta aparece em texto pequeno no crédito. O registro permanece no banco e na auditoria; nenhuma mensagem ou DIEx é enviado automaticamente. Solicitações não reduzem o saldo nem alteram a ND de origem. O saldo não distribuído, incluindo o remanescente de distribuições parciais, aparece como pendência do Fiscal em Créditos, no cartão inicial e em Pendências e cobranças. O acompanhamento permanece enquanto houver saldo livre ou inconsistência a conferir.

## Cadastros de setores e responsáveis

O menu Cadastros gerencia setores e responsáveis com criação, edição, vínculo e inativação, preservando os lançamentos históricos. Cada responsável pode ter um setor ou ser isolado (`sectorId: null`). Setores já utilizados são apresentados inicialmente sem inferir vínculos pessoais antigos. Após o primeiro cadastro, o diretório fica persistido em Configuração, dentro da mesma transação de revisão e auditoria do programa.

Na distribuição, a seleção filtra os responsáveis pelo setor e mantém disponíveis os isolados. É possível distribuir diretamente para um isolado, deixando o setor vazio. O servidor valida os vínculos e grava o destinatário no campo de responsável da distribuição, separado do autor do registro na auditoria. Não se pode inativar setor com responsáveis ativos vinculados. Renomeações não reescrevem documentos anteriores. Testes: `tests/directory.test.js` e `tests/directory-browser.cjs`.
