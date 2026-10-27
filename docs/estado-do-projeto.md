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

| Área | Recursos atuais | Evolução restante |
| --- | --- | --- |
| Persistência e sincronização | Consulta completa, histórico, cópia criptografada, recuperação e retomada manual do mesmo comando | Coordenação transacional para vários operadores e conciliação de alterações externas |
| NC e distribuição | Cadastros, confirmação de UG, acompanhamento, reserva, cancelamento/conclusão e auditoria | Distribuição por NE, mais de um operador, números de NC repetidos entre UGs e ampliação além da linha 100 com revisão de fórmulas |
| Empenhos e liquidação | NEs, APRV, crédito retido e liquidação semanal | Movimentos confirmados, vínculo UG/ano/NE e evolução por setor e ND sem inferir liquidação por queda de saldo |
| Almox | Situação e observação integral, prazos e triagem | Atualizações operacionais com autoria e histórico, conciliação por UG + exercício + NE e validação humana da providência |
| Processos | Consulta de Processos e PRO | Cadastro, mudanças de etapa, responsáveis, prazos e vínculo com NC/NE |
| Contratos | Vigência, fiscais e encerramento registrados no Sheets | Formulários de acompanhamento, confirmação de encerramento e alertas de vigência |
| Metas e painel | Abas analíticas e fórmulas calculadas no Sheets | Indicadores gerenciais próprios, filtros combinados e distinção entre retrato SIAFI e consulta atual |
| Histórico e auditoria | Histórico geral e eventos estruturados de NC/distribuição com antes/depois e recuperação de conflitos | Identidade individual verificada e eventos dos demais módulos |

O responsável digitado no formulário atual é uma declaração do usuário, não uma identidade individual autenticada. O token compartilhado protege o acesso, mas não comprova autoria pessoal. A cópia local depende do armazenamento e das permissões do navegador, e não é um backup institucional.


## Etapa 2 — verificada para publicação

Desenho e plano aprovados pelo usuário, com execução direta nesta conversa. Confirmado que os registros alimentarão as próprias abas e que haverá um único operador de lançamentos.

Implementados leitura operacional, validação em centavos, confirmação de UG, cadastro e acompanhamento de NC, reserva por NC, cancelamento/conclusão, auditoria atômica e consulta de resultado incerto. A interface recupera o comando pendente pela cópia criptografada opcional, sem reenvio automático. Os 56 testes locais e a verificação de navegador com dados fictícios passaram antes da revisão final.

A prova real desta etapa passou em 27/10/2026 na candidata protegida: HTTP 200, `verified: true`, `cleanedUp: true` e `officialDataChanged: false`, em seis segundos. A comparação posterior confirmou igualdade dos conteúdos, fórmulas, validações, notas e chips das 31 abas, além de formatos e conteúdo nativo das cinco abas relevantes. Não restou aba temporária. As colunas de controle oficiais não foram ativadas e nenhum cadastro fictício foi inserido nos dados oficiais.

A interface da candidata sincronizou as 31 abas, exibiu as 12 NCs e nove distribuições reais com UG pendente e recusou um comando inválido com HTTP 400, sem tentativa de gravação oficial. O acesso temporário de automação foi revogado, os parâmetros temporários foram invalidados e as configurações Google permanecem exclusivamente no ambiente de produção. A chave de produção não foi substituída.

Ressalva de implementação: o leitor examina as abas operacionais até seus limites atuais, no máximo 10.000 linhas, para não ocultar registros inseridos externamente após a linha 100. Essas linhas são sinalizadas fora do intervalo das fórmulas e não podem receber novos cadastros por esta etapa. Auditoria nova preserva formato/validação do exemplar nativo, e registros com chips ou conteúdo nativo não suportado exigem conferência em vez de serem sobrescritos.


### Revisão da etapa 2 — 27/10/2026

Os três pontos importantes encontrados na revisão foram reproduzidos e corrigidos: a recuperação e a repetição de operação verificam conflitos posteriores; a proteção de crédito confere todas as 1.287 fórmulas de A2:M100; e o envio não localizado tem retomada manual dos mesmos dados/UUID após consulta, intervalo de cinco minutos e confirmação explícita. Não há reenvio automático. O navegador com dados fictícios verificou que a retomada não cria outro comando e que a cópia criptografada é gravada antes do POST. A revisão direcionada confirmou as correções.


### Observação da implantação candidata

As chamadas funcionais verificadas responderam corretamente. Os logs registraram um aviso de depreciação DEP0169 sobre url.parse em Node.js 24, também durante a consulta central. Não há chamada url.parse no código da aplicação examinado; o aviso é compatível com a camada de execução e não foi tratado como falha dos fluxos testados. Não foi alterado o runtime nem suprimido o diagnóstico.
