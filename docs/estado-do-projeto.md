# Estado do projeto — 26/10/2026

## Levantamento

Foram examinadas as 31 abas da Central, incluindo os intervalos existentes, cabeçalhos, fórmulas, observações de célula e validações retornadas pelo conector. Foram contadas 6.027 fórmulas; nenhuma delas foi editada. Não foram retornadas validações de célula nessa leitura. Os dados detalhados inspecionados não foram copiados para este repositório.

A versão original oferecia 11 seções e autorizava 12 abas na API. Dados carregados eram mantidos somente na página; a leitura do histórico terminava na linha 1.000 e o tamanho retornado de cada página podia ocultar registros depois de um trecho vazio.

## Etapa 1 — implementação local

- Consulta autenticada às 31 abas com links para os identificadores corretos e largura de colunas própria, incluindo as 32 colunas de APRV.
- Paginação pelos limites atuais da planilha, sem interromper em lacunas. Cada aba só substitui seu retrato anterior depois de uma leitura completa.
- CSV importado separado da consulta ao Drive.
- Cópia local opcional criptografada, incluindo rascunhos; recuperação preserva os campos digitados na página atual.
- API de acompanhamento acrescenta linhas com RAW, confere cabeçalhos, rejeita JSON inválido e campos excessivos e preserva o texto integral aceito.
- Teste autenticado em aba temporária, com dois acréscimos, leitura de conferência e remoção da aba criada.
- Testes de comportamento das APIs, paginação, criptografia e recuperação no navegador.

## Validação real pendente

A API de produção existente rejeitou consulta sem chave com HTTP 401. A existência da aba e dos cabeçalhos foi confirmada pelo conector Google Drive. Isso não comprova a gravação pela conta de serviço usada pela API.

As credenciais Vercel estão marcadas como sensíveis; não estão disponíveis para leitura pelo conector. Para a validação real, a implantação candidata deve usar as variáveis do ambiente e o usuário deve autenticar-se no painel. Não enviar chaves pelo chat. Somente declarar a permissão de Editor verificada após o teste real retornar sucesso e limpeza confirmada.

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
