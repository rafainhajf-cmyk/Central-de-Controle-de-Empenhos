# Estado do projeto — 26/10/2026

## Levantamento

Foram examinadas as 31 abas da Central, incluindo os intervalos existentes, cabeçalhos, fórmulas, observações de célula e validações retornadas pelo conector. Foram contadas 6.027 fórmulas; nenhuma delas foi editada. Não foram retornadas validações de célula nessa leitura. Os dados detalhados inspecionados não foram copiados para este repositório.

A versão original oferecia 11 seções e autorizava 12 abas na API. Dados carregados eram mantidos somente na página; a leitura do histórico terminava na linha 1.000 e o tamanho retornado de cada página podia ocultar registros depois de um trecho vazio.

## Etapa 1 — publicada

- Consulta autenticada às 31 abas com links para os identificadores corretos e largura de colunas própria, incluindo as 32 colunas de APRV.
- Paginação pelos limites atuais da planilha, sem interromper em lacunas. A interface consulta as 31 abas em lote e só substitui o retrato depois de validar o conjunto inteiro, evitando a sequência de chamadas que falhou na primeira prova real.
- CSV importado separado da consulta ao Drive.
- Cópia local opcional criptografada, incluindo rascunhos; recuperação preserva os campos digitados na página atual.
- API de acompanhamento acrescenta linhas com RAW, confere cabeçalhos, rejeita JSON inválido e campos excessivos e preserva o texto integral aceito.
- Teste autenticado em aba temporária, com dois acréscimos, leitura de conferência e remoção da aba criada.
- Testes de comportamento das APIs, paginação, criptografia e recuperação no navegador.

## Validação real

A API de produção existente rejeitou consulta sem chave com HTTP 401. A existência da aba e dos cabeçalhos foi confirmada pelo conector Google Drive. Isso não comprova a gravação pela conta de serviço usada pela API.

Em 26/10/2026, a versão candidata protegida leu NCs, Almox e APRV (32 colunas) pela própria conta de serviço. O teste real retornou HTTP 200, `verified: true`, `cleanedUp: true` e `officialDataChanged: false`. A conferência posterior pelo conector confirmou as 31 abas, ausência de aba temporária e histórico de lançamentos inalterado.

A primeira sincronização completa pela interface falhou depois de uma sequência de dezenas de chamadas ao Google. Isso motivou a consulta consolidada: uma leitura de metadados e uma leitura em lote para as 31 abas, com aplicação atômica no navegador e recusa explícita de dados incompletos ou acima dos limites seguros. A revisão consolidada passou no navegador contra os dados reais: 31/31 abas carregadas em uma chamada à API, HTTP 200, sem erros ou alertas. A suíte local passou com 22 testes e a revisão de código não apontou impedimentos para esta etapa.

O teste usa um token temporário em uma ramificação protegida, com expiração automática. A chave de produção permanece inalterada. As configurações Google foram recolocadas no ambiente de produção depois que a candidata capturou suas variáveis. As autorizações temporárias de automação e compartilhamento foram revogadas após os testes; o token temporário foi invalidado na configuração da ramificação. Nenhuma chave deve ser enviada pelo chat ou adicionada ao código.

## Etapas operacionais ainda pendentes

| Área | Consulta disponível | Funcionalidade operacional pendente |
| --- | --- | --- |
| Persistência e sincronização | Retratos do Drive, histórico e cópia criptografada opcional | Recuperação de envios incertos, idempotência transacional, conflitos entre usuários e conciliação de alterações operacionais |
| NC e distribuição | NCs, saldos, crédito livre e distribuição detalhada | Formulários com valores, vínculo UG/ano/NC, validação de reserva, cancelamento e conclusão sem substituir fórmulas |
| Empenhos e liquidação | NEs, APRV, crédito retido e liquidação semanal | Movimentos confirmados, vínculo UG/ano/NE e evolução por setor e ND sem inferir liquidação por queda de saldo |
| Almox | Situação e observação integral, prazos e triagem | Atualizações operacionais com autoria e histórico, conciliação por UG + exercício + NE e validação humana da providência |
| Processos | Consulta de Processos e PRO | Cadastro, mudanças de etapa, responsáveis, prazos e vínculo com NC/NE |
| Contratos | Vigência, fiscais e encerramento registrados no Sheets | Formulários de acompanhamento, confirmação de encerramento e alertas de vigência |
| Metas e painel | Abas analíticas e fórmulas calculadas no Sheets | Indicadores gerenciais próprios, filtros combinados e distinção entre retrato SIAFI e consulta atual |
| Histórico e auditoria | Histórico oficial e lançamentos do aplicativo | Identidade individual verificada, eventos estruturados, autoria de alteração e recuperação de conflitos |

O responsável digitado no formulário atual é uma declaração do usuário, não uma identidade individual autenticada. O token compartilhado protege o acesso, mas não comprova autoria pessoal. A cópia local depende do armazenamento e das permissões do navegador, e não é um backup institucional.


## Etapa 2 — implementação em validação

Desenho e plano aprovados pelo usuário, com execução direta nesta conversa. Confirmado que os registros alimentarão as próprias abas e que haverá um único operador de lançamentos.

Implementados leitura operacional, validação em centavos, confirmação de UG, cadastro e acompanhamento de NC, reserva por NC, cancelamento/conclusão, auditoria atômica e consulta de resultado incerto. A interface recupera o comando pendente pela cópia criptografada opcional, sem reenvio automático. Os 55 testes locais e a verificação de navegador com dados fictícios passaram antes da revisão final.

A prova de integração real desta etapa e a publicação ainda precisam ser concluídas. As colunas de controle oficiais não foram ativadas e nenhum cadastro fictício foi inserido nos dados oficiais.

Ressalva de implementação: o leitor examina as abas operacionais até seus limites atuais, no máximo 10.000 linhas, para não ocultar registros inseridos externamente após a linha 100. Essas linhas são sinalizadas fora do intervalo das fórmulas e não podem receber novos cadastros por esta etapa. Auditoria nova preserva formato/validação do exemplar nativo, e registros com chips ou conteúdo nativo não suportado exigem conferência em vez de serem sobrescritos.


### Revisão da etapa 2 — 27/10/2026

Os três pontos importantes encontrados na revisão foram reproduzidos e corrigidos: a recuperação e a repetição de operação verificam conflitos posteriores; a proteção de crédito confere todas as 1.287 fórmulas de A2:M100; e o envio não localizado tem retomada manual dos mesmos dados/UUID após consulta, intervalo de cinco minutos e confirmação explícita. Não há reenvio automático. O navegador com dados fictícios verificou que a retomada não cria outro comando e que a cópia criptografada é gravada antes do POST. A revisão direcionada confirmou as correções.
