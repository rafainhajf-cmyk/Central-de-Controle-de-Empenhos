# Etapa 2 — NC e distribuição com gravação na planilha

Desenho aprovado pelo usuário — 26/10/2026. Ajustes de proteção registrados na execução em 27/10/2026.

## Resultado esperado e decisões confirmadas

O aplicativo deve cadastrar e acompanhar NCs e distribuições nas próprias abas da Central, preservando fórmulas e mantendo histórico de cada operação. O usuário confirmou que será o único operador de lançamentos. A consulta publicada na etapa 1 continua disponível durante o desenvolvimento.

Esta etapa adiciona cadastro de NC, associação de UG aos registros antigos, nova distribuição por NC e encerramento ou cancelamento de distribuição. Empenhos, liquidação, almox, processos, contratos e novos indicadores permanecem nas etapas seguintes.

## Abordagem recomendada e alternativa

Recomenda-se continuar com Google Sheets e gravar a alteração operacional e seu histórico em uma única requisição batchUpdate. Isso mantém a planilha como fonte dos controles e dispensa outro serviço para o operador único.

A alternativa é uma base transacional própria com sincronização para a planilha. Ela exigiria infraestrutura adicional e regras de conciliação entre duas fontes. Deverá ser reconsiderada antes de habilitar vários operadores simultâneos. Não será criada nesta etapa.

O Google documenta que as alterações de uma mesma requisição batchUpdate são aplicadas juntas, mas que colaboradores ainda podem interferir no resultado. Portanto, a proposta usa versões de registro, conferência antes/depois e recuperação de envios incertos; não promete exclusão global entre alterações feitas fora do aplicativo.

Referência: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate

## Estrutura examinada e preservação

- **NCs e prazos:** dez cabeçalhos em A:J, sem fórmulas nos intervalos examinados. K:L estão livres.
- **Distribuições detalhadas:** dez cabeçalhos em A:J, sem fórmulas nos intervalos examinados. K:L estão livres. Existem registros sem UG, uma distribuição sem data e referências ausentes da lista atual de NCs.
- **Histórico:** nove cabeçalhos em A:I. Os registros anteriores serão mantidos integralmente.
- **Crédito livre e distribuído:** os indicadores são fórmulas e usam as distribuições cujo estado não seja Cancelada nem Concluída. Essas fórmulas não serão substituídas.

As colunas livres K:L das duas abas operacionais receberão os títulos **UG** e **ID de controle**, depois de verificar que continuam vazias e sem fórmulas. Não haverá exclusão de linhas, substituição de abas, alteração de permissões ou migração automática de valores antigos.

A gravação ficará restrita às células necessárias em NCs e prazos, Distribuições detalhadas e ao acréscimo de histórico. Uma célula-alvo que contenha fórmula ou uma estrutura divergente interromperá a operação. Nesta etapa, não serão inseridos registros operacionais depois da linha 100, limite atualmente usado pelas fórmulas de crédito examinadas. Se a estrutura das fórmulas ou os intervalos de referência mudarem, o cadastro será recusado até uma manutenção explícita da integração.

## Identidade e conciliação dos registros antigos

NCs serão identificadas por UG + exercício + número completo da NC. Distribuições terão um ID de controle próprio e vínculo com essa chave da NC. O exercício deve coincidir com o prefixo do número. As UGs disponíveis inicialmente serão 160111 e 167111. Como as fórmulas existentes cruzam distribuições somente pelo número da NC, esta etapa recusará o cadastro de um número de NC que já exista em qualquer UG. Habilitar o mesmo número em UGs distintas exigirá uma revisão explícita dessas fórmulas.

Não será atribuída UG automaticamente aos registros antigos. O formulário permitirá confirmar a UG de uma linha existente mediante conferência e justificativa. A associação preenche somente os campos de controle e registra antes/depois no histórico; os valores financeiros existentes permanecem iguais.

Enquanto uma NC ou as distribuições dessa referência tiverem vínculo de UG pendente, o aplicativo mostrará a pendência e não autorizará uma nova reserva baseada em saldo ambíguo. Referências ausentes da lista de NCs, duplicadas ou ligadas a NE serão mantidas para consulta e conferência. Esta etapa não cria NC fictícia a partir de uma distribuição e não implementa distribuição por NE.

## Cadastro e acompanhamento de NC

Campos: UG, exercício, número da NC, data do recebimento, ND, finalidade do crédito, valores recebido/empenhado/disponível conforme documento, prazo informado, responsável, referência do documento e observação.

O formulário aceitará número completo no padrão AAAANC000000, ND com seis dígitos, datas válidas e valores monetários não negativos com duas casas. Os valores serão tratados em centavos. Para novos cadastros desta etapa, recebido deve ser igual a empenhado mais disponível, em centavos. Uma divergência recusará o cadastro e pedirá conferência da fonte; o aplicativo não ajustará os valores informados silenciosamente.

Uma NC nova será marcada como cadastro manual a conferir com a fonte SIAFI. Cadastro manual e confirmação de gravação no Sheets não serão apresentados como atualização financeira automática do SIAFI. A data de consulta do aplicativo e a data do retrato financeiro serão exibidas separadamente.

Para NCs existentes, esta etapa permitirá associação de UG e acompanhamento de prazo/observação. Não oferecerá edição livre dos valores financeiros importados. Uma correção financeira da fonte deverá seguir o fluxo de conciliação da própria fonte.

## Distribuição por NC

Campos: NC com UG confirmada, data, setor, responsável, valor da distribuição, finalidade, próxima providência e observação/documento de conferência. A ND e os valores do crédito serão apresentados a partir da NC vinculada.

Antes de salvar, o servidor relerá a NC e suas distribuições. O valor deverá ser positivo e não poderá exceder o disponível informado na NC menos as reservas ativas. Distribuições existentes continuam participando do cálculo; nenhuma será descartada por estar sem data ou ter sido criada fora do aplicativo. Dados inválidos ou ambíguos impedirão o novo lançamento e serão apresentados para conferência.

A distribuição será inserida em A:L, com estado Ativa e com os valores de referência da NC em H:I. O aplicativo relerá os resultados depois da gravação e mostrará a confirmação do Google e o saldo calculado. Não usará um saldo digitado pelo navegador como autorização para gravar.

Cancelar ou concluir exigirá selecionar a distribuição, reler sua versão e informar uma justificativa. O aplicativo atualizará somente seu estado e os campos de acompanhamento necessários, preservando os valores, o responsável original e a finalidade. O estado terminal libera a reserva conforme as fórmulas existentes. Uma operação terminal não será reaberta nem apagada nesta etapa.

## Histórico, repetição e falhas

Cada operação terá um UUID e uma versão esperada do registro. A alteração operacional e uma nova linha em Histórico serão enviadas juntas. O histórico guardará data/hora, operação, chave, setor, responsável declarado, antes, depois, documento de conferência e identificador da operação. O responsável declarado não será apresentado como identidade individual autenticada.

Uma repetição sequencial de uma operação já confirmada retornará a confirmação existente. A interface bloqueará duplo clique e não repetirá automaticamente um envio cujo resultado seja incerto. O rascunho e o ID serão mantidos na cópia criptografada opcional; a interface oferecerá consultar o resultado antes de permitir nova tentativa. Uma retomada manual só será oferecida após consulta sem resultado e cinco minutos do último envio; ela exige confirmação explícita, faz nova consulta e preserva integralmente o comando e seu UUID. Um erro de rede depois do envio será tratado como resultado pendente de confirmação, sem afirmar que o Google não recebeu os dados.

Se a versão encontrada diferir da versão selecionada, a operação será recusada com pedido de recarga. Depois de uma gravação, a releitura verificará o estado resultante. Divergência de releitura ficará visível como conflito de conferência, sem apagar o histórico ou tentar desfazer alterações alheias.

## Alterações previstas no aplicativo

- Formulários específicos nas seções Créditos e NCs e Distribuição por setores.
- Seletor de NC com UG, exercício, ND e data da fonte; pendências de associação visíveis.
- Lista de distribuições com ação de cancelar/concluir, confirmação e justificativa.
- Novo endpoint operacional autenticado, com validação no servidor e comandos restritos. O endpoint atual api/lancamentos.js continuará append-only para acompanhamentos gerais.
- Cliente Google compartilhado e funções de validação separadas da interface, com escopo restrito às abas e células aprovadas.
- Histórico apresentado com resumos legíveis; valores técnicos de controle não serão exigidos do usuário.

## Verificação antes de publicar

1. Testes de valores em centavos, datas, chaves, UG pendente, referência ausente, duplicidade e saldo insuficiente.
2. Testes de preservação de fórmulas, estrutura divergente, limite das fórmulas, versão alterada e operação já confirmada.
3. Testes de falha de rede antes/depois do envio, rascunho preservado e consulta de confirmação sem reenvio automático.
4. Testes de cadastro, associação de UG, distribuição e cancelamento no navegador com dados fictícios.
5. Prova real em abas temporárias isoladas, com nomes e IDs criados pelo próprio teste: NC, distribuição, crédito de teste e histórico de teste. O mesmo núcleo operacional será executado nesse contexto; o cliente não poderá escolher alvos arbitrários.
6. Conferir cadastros fictícios, reserva, cancelamento, histórico e repetição; remover somente as abas temporárias criadas pelo teste. Conferir que as abas oficiais e seu histórico permanecem inalterados.
7. Publicar candidata protegida, verificar o fluxo completo e só então integrar e publicar em produção. A criação dos cabeçalhos de controle oficiais só ocorrerá na ativação aprovada do módulo; nenhum cadastro fictício será escrito nas abas oficiais.

## Critérios de conclusão desta etapa

O usuário consegue registrar uma NC e uma distribuição nas abas correspondentes, confirmar a UG dos registros antigos, cancelar/concluir uma distribuição e consultar o histórico, sem substituir fórmulas ou registros anteriores. Os erros preservam o rascunho e tornam o resultado de gravação explícito. Os testes e a prova isolada passam antes da publicação. Os limites de operador único, fonte financeira e referências antigas pendentes permanecem claros.
