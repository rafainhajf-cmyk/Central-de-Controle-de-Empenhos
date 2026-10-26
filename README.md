# Central de Controle de Empenhos — v2

## Publicação
Descompacte o ZIP. Envie a pasta `central-empenhos-publicar-v2` ao Vercel Drop para publicar um site estático. Para substituir a URL existente, faça a implantação **dentro do projeto existente** `central-controle-empenhos-vercel`; criar um novo projeto pode gerar outra URL. Não publique CSV com dados administrativos.

## Uso
Na Central do Google Sheets, abra a aba `Almox • Situação e prazo` e use Arquivo > Fazer download > Valores separados por vírgulas (.csv). Importe o CSV pelo botão no aplicativo. A marcação de acompanhamento é armazenada apenas no navegador. É possível exportar as marcações para CSV.

## Segurança e limitações
Esta versão estática não contém credenciais, dados internos ou integração automática com o Google Sheets. Os indicadores orçamentários são um retrato histórico de 21/10/2026, não são valores em tempo real. Acesso à URL pública não deve ser confundido com autenticação. Para dados sensíveis, use proteção de acesso no Vercel. Não adicione arquivos CSV ao GitHub nem à Vercel.
