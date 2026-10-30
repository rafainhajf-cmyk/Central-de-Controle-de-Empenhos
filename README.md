# Central Orçamentária — 10º BI Mth

Aplicação existente na Vercel, projeto `empenhos`. Esta árvore recupera o código da versão publicada diretamente na Vercel e inclui as correções de acompanhamento, classificação e exportação. Não contém credenciais nem cópias dos registros reais.

## Acesso e persistência

O administrador também entra por senha própria da Central, com sessão segura de oito horas. Os demais acessos individuais usam Neon Auth; perfis e setores são verificados no servidor. Novos acessos Google passam pela autorização do titular. A configuração é fornecida pelas variáveis já existentes da Vercel; não coloque valores no repositório.

O painel e o Meu Dia usam o mesmo retrato salvo em `central_day.management_snapshots`, com ajustes de acompanhamento em `management_manual`. A sincronização preserva os ajustes e identifica fontes ausentes. Gerar atividades não consulta o Drive nem escreve nas fontes: usa os dados preservados no Neon e registra os eventos com a identidade do operador.

## Recursos desta revisão

- Contratos e fiscais, dias desde a emissão e classificação de APRV para os subitens 07, 04 e 21. ND ausente permanece sinalizada para conferência.
- Prazo individual no acompanhamento; regras gerais em Administração, com controle de versão e histórico. Regras alteradas se aplicam às novas atividades, preservando as já existentes.
- Histórico de acompanhamento com autoria, protegido pelo mesmo escopo do registro.
- Exportação `.xlsx` por área, respeitando filtros; textos são células literais. O botão PDF / Imprimir abre a impressão do navegador para salvar em PDF. Relatórios do Meu Dia mantêm CSV e oferecem Excel e impressão.

As datas e valores importados continuam identificados como informações da fonte. Respostas do Meu Dia não comprovam liquidação, execução no SIAFI, recebimento de material nem envio efetivo de uma cobrança. Os controles financeiros e ferramentas legadas da Central permanecem disponíveis; esta revisão não os substitui por um novo sistema financeiro.

## Validação e publicação

`npm test` executa os testes com PostgreSQL isolado em PGlite. `npm run build` verifica a leitura do banco configurado, aplica apenas a estrutura adicional necessária e confirma que o retrato atual permanece inalterado antes de preparar os arquivos estáticos. O build exige `DATABASE_URL` do projeto existente.

A pasta `public` contém apenas os arquivos de interface. O cenário `/release-checks` é gerado exclusivamente quando o comando de build recebe `--browser-fixture`, em uma candidata, e contém somente dados fictícios. Não é incluído na publicação normal.

A validação da interface com dados fictícios cobre filtros, classificação, dias, contratos, histórico, geração do arquivo Excel e acionamento da impressão. O fluxo completo com o login individual real da Central ainda precisa de uma sessão concluída no navegador; o acesso confirmado à Vercel não equivale a esse login.


## Regras operacionais finais

Sincronização automática às 10h15 de Brasília. O Almox usa dias corridos: 5 para envio, 30 para entrega, 10 de resposta a cada notificação e revisão semanal do PA. As regras gerais são editáveis; prazos individuais e histórico são preservados. As datas de envio, entrega, notificações e PA podem ser informadas em Editar acompanhamento. A geração não considera uma data estimada como comprovação de envio. Empenhos liquidados sem saldo podem ser ocultados da consulta sem apagar o histórico.
