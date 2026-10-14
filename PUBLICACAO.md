# Publicação da ST1 Academy

A configuração escolhida é **Supabase Free para PostgreSQL e Render Free para o servidor Node.js**. `render.yaml` usa `plan: free`, sem disco pago. Não cadastrar cartão, mudar de plano nem contratar adicionais para aplicar esta configuração. O repositório é privado; banco, chave de autenticação e credenciais Google ficam fora do Git.

## Armazenamento e acesso

Contas, permissões, conteúdos e arquivos, módulos, mapas, provas, certificados, perfis, squads, mensagens e agenda ficam em tabelas relacionais reais no esquema privado `academy`. A conexão é TLS com validação do certificado. O esquema não concede acesso a `PUBLIC`, e as tabelas têm RLS habilitada. A Data API pública não deve expor esse esquema. A aplicação acessa o banco apenas pelo servidor e conserva as verificações de papel, squad, canal, versão e pré-requisitos.

O certificado público `config/supabase-root-ca.crt` vem do botão **Download certificate** do painel Supabase, em **Database → Settings → SSL configuration**. `NODE_EXTRA_CA_CERTS` aponta para esse arquivo antes da inicialização do Node, preservando a validação da cadeia e do hostname. O aplicativo não desativa `rejectUnauthorized`. Em comandos locais PowerShell, defina `$env:NODE_EXTRA_CA_CERTS = (Resolve-Path config/supabase-root-ca.crt).Path` antes de iniciar o processo; carregar essa variável somente por `--env-file` não basta. [Certificado e conexão verificada no Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

Os arquivos desta versão são `BYTEA` no PostgreSQL, com SHA-256 e permissões da Academy; ainda não usam buckets do Supabase Storage. Portanto, consomem a franquia do banco. A cópia inicial preparada tem cerca de 25 MB. Uma futura migração de arquivos para buckets privados pode liberar espaço, mas precisa manter as mesmas regras de acesso.

O piloto local conserva SQLite. O servidor publicado usa `ACADEMY_STORAGE=postgres`; o disco temporário do Render não guarda os dados principais nem o segredo da sessão. O repositório de consultas mantém o contrato síncrono dos serviços existentes por um worker dedicado, que executa SQL em PostgreSQL. A ponte preserva os tipos, transações, arquivos, datas e hashes de senha; ela não armazena uma cópia SQLite como banco remoto. Se uma conexão cair, a gravação que falhou não é repetida automaticamente. Transações interrompidas são rejeitadas antes de reconectar.

## Limites dos planos gratuitos

O [Supabase Free](https://supabase.com/pricing) inclui 500 MB de banco, 1 GB de Storage e franquias de tráfego; o projeto pode ser pausado após uma semana de inatividade. Backups automáticos do banco não estão incluídos no plano Free.

O [Render Free](https://render.com/docs/free) suspende o servidor após 15 minutos sem acesso e pode levar cerca de um minuto para despertar. Não oferece disco permanente nem Shell. O workspace tem franquias de horas, tráfego e build; sem método de pagamento, a plataforma suspende o recurso ao atingir os limites aplicáveis. A configuração deve permanecer sem cartão e sem recursos pagos.

A sincronização e as verificações internas da agenda dependem do servidor ativo. Eventos já enviados ao Google Calendar continuam no Google; uma tarefa interna que vencer enquanto o Render estiver suspenso só será processada quando o servidor voltar. Esta configuração gratuita não oferece execução contínua em segundo plano.

## Variáveis privadas do servidor

| Variável | Configuração |
| --- | --- |
| `NODE_VERSION` | `24.15.0` |
| `NODE_ENV` | `production` |
| `NODE_EXTRA_CA_CERTS` | `config/supabase-root-ca.crt`, configurado no ambiente antes de iniciar o Node |
| `ACADEMY_DEPLOYMENT` | `production` |
| `ACADEMY_STORAGE` | `postgres` |
| `DATABASE_URL` | Conexão PostgreSQL privada; pooler de sessão na porta 5432 para IPv4 |
| `ACADEMY_AUTH_SECRET` | Mesma chave privada da transferência, com pelo menos 32 caracteres |
| `ACADEMY_TEST_MODE` | `0` |
| `ACADEMY_LISTEN_HOST` | `0.0.0.0` |
| `ACADEMY_TRUST_PROXY` | `1` |
| `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` | Credenciais do cliente Web exclusivo da Academy |
| `ACADEMY_BASE_URL` | Origem HTTPS real; por padrão usa `RENDER_EXTERNAL_URL` |

Copie o hostname do pooler no painel **Connect → Direct → Session pooler**. Ele não pode ser deduzido apenas pela região. Roles próprias usam `ROLE.REFERENCIA_DO_PROJETO` como usuário do pooler. [Conexões PostgreSQL no Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

Nenhuma chave secreta, senha ou `DATABASE_URL` deve aparecer em Git, argumentos de comando visíveis, URLs públicas, navegador de vendedores, imagens ou logs. `ACADEMY_PG_QA` é exclusivo dos testes com PostgreSQL em localhost e não deve ser configurado em produção.

## Primeira transferência

1. Gere uma cópia consistente e privada do piloto, em uma pasta nova:

   ```text
   node scripts/export-production.mjs --source CAMINHO_DO_PILOTO --output PASTA_PRIVADA_NOVA
   ```

2. A pasta contém o backup integral do piloto e a subpasta `transferencia`. Preserve o backup e mantenha todos esses arquivos fora do Git e de pastas públicas. A cópia para produção conserva as contas e hashes de senha, permissões, materiais, arquivos, módulos, mapas, definições de provas, regras, perfis, squads, agenda e progresso de estudo. Avaliações, certificados, pontuação e sessões do piloto não são convertidos em resultados de produção. Convites pendentes são revogados somente na cópia.

3. Com o projeto Supabase criado e a conexão privada configurada em um arquivo de ambiente local, importe a cópia:

   ```text
   node --env-file=ARQUIVO_PRIVADO scripts/import-supabase.mjs --bundle PASTA_PRIVADA_TRANSFERENCIA
   ```

   O arquivo privado contém `DATABASE_URL` e `ACADEMY_BASE_URL`. O comando compara todas as linhas, arquivos e hashes antes de confirmar a transação. Um destino que já tenha contas ou materiais é recusado; não é permitido sobrescrever um sistema em uso.

4. No Render, crie um **Web Service Free** a partir do repositório privado, com `npm ci --omit=dev` e `npm start`. Deixe **Health Check Path** vazio para usar a sondagem TCP padrão. A ponte síncrona PostgreSQL pode ocupar o event loop durante consultas longas; uma sondagem HTTP com prazo de cinco segundos retirava temporariamente o serviço do tráfego. `/healthz` continua disponível para diagnóstico manual. Configure as variáveis privadas antes de iniciar a publicação. Até preservar o gestor no banco, o serviço retorna `503 preparing` e não abre o cadastro público. [Verificações de disponibilidade do Render](https://render.com/docs/health-checks).

Os vínculos de identidade Google são preservados, mas os tokens e a conexão da agenda do piloto não vão para produção. Após configurar o endereço final, a pessoa entra com Google e consente novamente para conectar a agenda ao ambiente publicado.

## Google e endereço público

No mesmo cliente OAuth da Academy, configure a origem HTTPS real, o retorno `ORIGEM_HTTPS/api/auth/callback/google` e a política `ORIGEM_HTTPS/privacidade.html`. O callback de localhost pode continuar para o piloto. Nunca anuncie Google como ativo antes de testar no endereço publicado; o cliente já configurado para localhost não autoriza automaticamente um domínio novo.

Não é preciso comprar domínio para usar o endereço gratuito fornecido pelo Render. Um domínio ST1 existente pode ser conectado depois, sem alterar os dados.

## Verificação e recuperação

A publicação precisa confirmar o commit remoto, `/healthz` com `production-postgres`, login do gestor, arquivos originais, criação e reabertura de material, permissões de Vendedor/Supervisor/BI, bloqueios do mapa, agenda e Google. Um reinício deve conservar os dados. HTTP 200 apenas na tela de login não prova a persistência.

Os testes automatizados usam SQLite local e PostgreSQL 17 real em bases isoladas. Incluem tipos binários, transações internas, interrupção e reconexão, importação conferida e proteção contra sobrescrita. A biblioteca, os conteúdos e a senha do gestor também foram conferidos numa migração da cópia real para PostgreSQL local. Esses resultados não substituem a validação do Supabase e do serviço publicado.

Para uma cópia externa do PostgreSQL, use um cliente `pg_dump` compatível com a versão do servidor, exporte o esquema `academy` em formato custom e mantenha o arquivo cifrado ou em uma pasta privada. Guarde a chave `ACADEMY_AUTH_SECRET` separadamente. Restaure primeiro em outro projeto vazio e valide contas, arquivos e permissões antes de apontar o serviço para ele. Não existe backup automático gratuito configurado nesta versão. O comando `npm run backup` é exclusivo do piloto SQLite e não deve ser usado como backup do Supabase.

Arquivos principais: `render.yaml`, `.github/workflows/academy.yml`, `lib/hosting.mjs`, `lib/postgres-db.mjs`, `lib/postgres-worker.mjs`, `lib/supabase-transfer.mjs` e `scripts/import-supabase.mjs`.
