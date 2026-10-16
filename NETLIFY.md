# ST1 Academy — hospedagem gratuita na Netlify

Decisão de 15/10/2026: manter custo zero. A preparação da Vercel foi preservada no PR #1, sem publicar ou contratar o Pro. A direção atual é Netlify Free com o PostgreSQL já existente no Supabase.

## Conta e limites confirmados

O painel da equipe `viniciusagnes1092`, chamada ST1 Academy, mostrou Free, US$ 0,00, 300 créditos disponíveis e nenhum cartão cadastrado. A página declara que não há cobrança de excedentes nesse plano. A documentação informa que o projeto pode ser pausado quando a franquia termina; o custo zero não equivale a disponibilidade ilimitada.

Fontes oficiais: [Free e uso comercial](https://www.netlify.com/blog/introducing-netlify-free-plan/), [franquia atual e limite sem recarga](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/).

## Implementação

- Função Node.js 24 com a aplicação Express e os mesmos serviços de autenticação e dados. O adaptador Fetch usa `serverless-http`, também indicado no guia oficial de Express da Netlify.
- O esquema é conferido na inicialização; a função não reimporta materiais, não recria contas e não grava banco no disco efêmero. A chave de autenticação existente deve ser mantida para preservar os tokens Google criptografados.
- As páginas de login, inicial e APIs passam pela aplicação. Os recursos estáticos públicos usam a CDN. Arquivos particulares continuam sujeitos às permissões da Academy, sem cache público.
- Envios grandes utilizam partes de 1 MB, com autorização, revisão e hash. A finalização é atômica e idempotente.
- Respostas Fetch utilizam stream. Para preservar materiais de até 25 MB diante do limite de resposta de 20 MB da Netlify, arquivos acima de 18 MB são lidos em intervalos autenticados de 1 MB, com ETag e SHA-256. A leitura no PDF interno permanece integrada ao progresso. A abertura externa usa uma página ST1 que prepara o arquivo e oferece o botão para abrir ou baixar.
- A função de agenda é disparada pela própria plataforma a cada 15 minutos. Não aceita execução pública por URL; a sincronização manual permanece disponível. A precisão dos alertas dentro da Academy deve ser testada à parte da consulta periódica ao Google.
- O Free utiliza a região padrão da Netlify, Ohio. A escolha de São Paulo exige plano pago e não foi habilitada. Por isso, o tempo real de primeira abertura e de leitura deve ser medido antes da troca do site; a CDN, sozinha, não comprova que as consultas privadas ficaram mais rápidas.

## Publicação e verificação

1. Compilar e inspecionar o pacote real das funções: thread PostgreSQL, dependências `pg`, CA, questionários, fontes, arquivos públicos e `package.json`; excluir ambientes privados, bancos locais e a pasta `work`.
2. Autorizar o CLI oficial da Netlify para esta publicação. Não usar tokens em argumentos nem exibir credenciais.
3. Criar um projeto separado na equipe Free confirmada, preservando o Render durante a validação.
4. Copiar para as variáveis privadas de Functions: `ACADEMY_STORAGE=postgres`, `ACADEMY_DEPLOYMENT=production`, `ACADEMY_TEST_MODE=0`, `ACADEMY_TRUST_PROXY=1`, a origem HTTPS final, `DATABASE_URL`, `ACADEMY_AUTH_SECRET`, `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`. Nenhum valor privado deve ir ao Git ou ao diretório publicado.
5. Aplicar somente as duas tabelas novas de transferência com o preparador existente, verificando RLS, contagem de contas e conteúdos antes/depois. Não reimportar o banco.
6. Publicar e testar login por senha, acesso original Admin, biblioteca, material grande, envio em partes, conclusão de estudo, mapa, certificados, chat, CRUD e persistência. Configurar o retorno Google somente depois de conhecer o endereço real, com autorização específica para a nova origem.
7. Medir abertura inicial e subsequente. Manter o endereço anterior ativo enquanto houver alguma divergência.

## Estado

Preparação local. Uma compilação local, uma página de login aberta ou um teste de componentes não comprovam a publicação completa. O novo endereço só pode ser divulgado como concluído depois da validação na hospedagem real.
