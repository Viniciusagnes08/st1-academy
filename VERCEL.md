# Publicação da ST1 Academy na Vercel

**Direção suspensa em 15/10/2026:** o usuário decidiu manter custo zero e escolher outra hospedagem. A implementação foi preservada no PR #1; a preparação atual está em `NETLIFY.md`. Nenhuma contratação Pro foi autorizada.

Preparação para Node.js 24, função em São Paulo (`gru1`) e o PostgreSQL privado existente do Supabase. O adaptador síncrono usa uma thread Node; não utiliza o runtime Edge nem os esboços da pasta `cloudflare/`.

## Estado e condição para publicar

Em 15/10/2026, a conexão Vercel confirmou a equipe `Vinicius Agnes` (`team_YpI8LEi3JJNnn1hsmf0Ecrjt`) e o plano Hobby. Nenhum projeto Academy, deploy, assinatura, cobrança, integração ou segredo foi criado na Vercel nesta preparação.

O [plano Hobby](https://vercel.com/docs/plans/hobby) é restrito a uso pessoal e não comercial. A Academy é destinada à operação da ST1. É necessário usar uma equipe Pro existente ou obter decisão explícita sobre a contratação antes da publicação empresarial. O [preço divulgado do Pro](https://vercel.com/pricing) começa em US$ 20/mês, com franquia de uso; impostos, assentos adicionais e excedentes dependem da conta e do consumo. A preparação não autoriza a contratação.

## Comportamento preparado

- `api/index.mjs` inicializa a aplicação na primeira requisição; falhas permitem nova tentativa sem exibir credenciais.
- `vercel.json` fixa a região São Paulo, duração máxima de 300 segundos e os arquivos necessários à função. O código pode guardar somente configurações e conexões no processo; os registros continuam no PostgreSQL.
- Consultas, versões e regras de acesso mantêm a implementação existente. Um controle serializa requisições da mesma instância para preservar as transações do adaptador síncrono enquanto o login ou um PDF aguarda uma operação assíncrona. Instâncias distintas usam conexões distintas.
- O servidor confere o esquema existente durante a inicialização e falha se uma migração estiver pendente. As requisições não criam tabelas, não importam conteúdos e não substituem configurações de gamificação.
- A inicialização PostgreSQL não cria diretórios ou arquivos privados no disco efêmero da Vercel. O certificado CA é incluído no pacote; a conexão exige validação TLS.
- O envio em partes de 1 MB atende os limites HTTP das funções. O servidor confere dono, destino, permissões, tamanho, hash SHA-256 e revisão. A conclusão grava uma versão e o resultado da operação na mesma transação. Repetir a conclusão não duplica o arquivo.
- O envio incompleto tem prazo de 30 minutos, máximo de dois envios abertos por pessoa e limite de 100 MB em aberto para toda a aplicação. Partes recebidas são removidas na conclusão; envios expirados são limpos na próxima criação.
- Arquivos grandes são entregues com escritas de resposta em partes, após autenticação e autorização. É necessário confirmar o download do Caderno de POPs (aproximadamente 8 MB) na Vercel real antes da liberação.
- `ctx.googleCalendar.start()` não é executado pelo ponto de entrada serverless. As ações de conectar e sincronizar continuam disponíveis. Um Cron de minuto em minuto, adequado ao plano Pro, chama `/api/internal/calendar-sync`. O endpoint exige `CRON_SECRET` privado com pelo menos 32 caracteres; sem a chave, responde 401. Não utiliza `setInterval` como serviço permanente em uma função.

## Sequência da publicação

1. Confirmar a equipe e o plano autorizados, com limite de gastos escolhido pela gestão.
2. Criar o projeto separado `st1-academy`, sem substituir `st1-central-comercial` ou os demais projetos existentes.
3. Configurar somente no servidor: `ACADEMY_DEPLOYMENT=production`, `ACADEMY_STORAGE=postgres`, `ACADEMY_TEST_MODE=0`, `ACADEMY_TRUST_PROXY=1`, a origem final em `ACADEMY_BASE_URL`, uma chave nova `CRON_SECRET` e os valores privados já existentes de `DATABASE_URL`, `ACADEMY_AUTH_SECRET`, `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`. Preservar a chave de autenticação para conservar os tokens Google criptografados. Não colocar essas variáveis em arquivos públicos ou no Git.
4. Conferir a migração com `node --env-file=ARQUIVO_PRIVADO scripts/prepare-vercel.mjs`. A aplicação de `--apply` adiciona somente as duas tabelas privadas de transferência e seu índice; não reimporta contas ou materiais. Conferir o resultado e RLS.
5. Executar os testes locais e os cenários PostgreSQL isolados da CI. Revisar o commit exato a publicar.
6. Publicar uma versão de teste com ambiente e origem definidos. Preservar o servidor Render durante a conferência.
7. Adicionar a origem HTTPS final e `/api/auth/callback/google` ao cliente Google existente, preservando os retornos já configurados. Essa alteração deve ocorrer com autorização específica no momento da ação.
8. Verificar, na hospedagem real, login por senha e Google, Admin original, biblioteca, PDF de 8 MB, upload maior que 4,5 MB, estudo/conclusão, bloqueios do mapa, chat multimídia, emissão e verificação de PDF, agenda e persistência. Conferir testes com acessos distintos.
9. Medir primeira abertura e leituras subsequentes. Só então promover a versão e divulgar o endereço novo.

## Verificações já realizadas

O relatório local privado `work/vercel-initialization-smoke.json` registrou inicialização serverless contra o esquema existente do Supabase, antes da inclusão das tabelas novas de upload. Preservou os totais de 2 contas, 35 conteúdos, 19 arquivos, 11 módulos, 7 percursos, 10 squads e 24 questionários. Esse teste não comprova um deploy Vercel nem o login Google em um novo domínio.

Os testes `serverless.test.mjs` e `uploads.test.mjs` exercitam isolamento de requisições, recuperação de inicialização, envio de arquivo maior que 5 MB, integridade, acesso privado, repetição de partes, conclusão idempotente, conflito de revisão e expiração. A execução PostgreSQL desses cenários depende de uma instância isolada de QA, sem apontar testes destrutivos para o Supabase real.
