# Google na ST1 Academy

A versão 2.3.0 permite cadastro aberto com uma conta Google de e-mail verificado e integração com uma agenda secundária. A agenda interna funciona sem Google. A configuração do cliente, a disponibilidade para o público e a conexão de cada conta são estados diferentes e precisam ser conferidos.

## Configuração e conexão conferidas no piloto

O projeto exclusivo **ST1 Academy**, ID `skilled-circle-511411-h1`, e o cliente OAuth Web foram criados com autorização do responsável pela ST1. A **Google Calendar API** está ativa. O público OAuth foi publicado e conferido no Google como **Em produção**, do tipo **Externo**. O piloto usa a origem `http://localhost:4177` e o retorno `http://localhost:4177/api/auth/callback/google`. As credenciais pertencem somente ao servidor privado.

A conexão real da conta Admin do piloto foi concluída pelo retorno OAuth. A conta, a sessão e o papel existentes foram preservados. O servidor armazenou o vínculo Google com o escopo do calendário, criou uma agenda secundária e registrou a conexão como **connected**, com uma leitura de sincronização concluída e sem erro. A interface confirmou “Sua agenda Google está conectada”; uma segunda leitura real foi acionada em **Sincronizar agora**.

Não foram criados compromissos fictícios no calendário real. Os testes de criação, alteração, convites, cancelamento e recuperação de eventos usam bancos isolados e respostas simuladas da API. A confirmação acima cobre o retorno OAuth, o vínculo, a criação da agenda secundária e sua leitura de conferência. Os cenários de eventos externos devem ser conferidos separadamente com compromissos autorizados do time.

## 1. Conferir o público e a marca no Google Cloud

No [Google Cloud Console](https://console.cloud.google.com/), selecione o projeto da Academy e abra **Google Auth Platform**. Confira nome, contato, público Externo, política de privacidade e configuração do cliente. O estado atual da Academy é **Em produção**. Se outro ambiente for configurado como Testando, o Google limitará seu acesso às contas de teste cadastradas; ele precisará ser publicado para receber qualquer conta Google.

A política de privacidade foi publicada e conferida em [ST1 Academy · Privacidade](https://st1-central-comercial.vercel.app/academy-privacidade). A configuração da marca no Google recebeu esse endereço, a página inicial da Central Comercial e o domínio autorizado. Essa publicação não publica o banco ou o painel da Academy. Se o Google solicitar verificação adicional, conclua a exigência antes de informar que a entrada está liberada para todo o time.

Os escopos salvos são `openid`, `userinfo.email`, `userinfo.profile` e `https://www.googleapis.com/auth/calendar.app.created`. Os quatro foram apresentados como não confidenciais no Google; não há escopos confidenciais ou restritos configurados. O escopo do Calendar permite administrar agendas secundárias criadas pelo aplicativo. Eventos de outras agendas pessoais não são importados. Consulte a [documentação de autorização do Calendar](https://developers.google.com/workspace/calendar/api/auth).

## 2. Conferir o cliente OAuth Web

O cliente deve ser do tipo **Aplicativo da Web**. Com uma conta Admin, abra **Gestão → Programação do time → Preparar conexão** e confira os valores do ambiente.

| Ambiente | Origem | URI de redirecionamento |
| --- | --- | --- |
| Local padrão | `http://localhost:4175` | `http://localhost:4175/api/auth/callback/google` |
| Piloto atual | `http://localhost:4177` | `http://localhost:4177/api/auth/callback/google` |
| Domínio próprio | origem HTTPS da Academy | mesma origem + `/api/auth/callback/google` |

O protocolo, a porta e o caminho precisam corresponder exatamente ao cadastro no Google. `/google/connected` é a etapa interna seguinte e não substitui o retorno OAuth acima. Ao publicar a Academy em um domínio próprio, cadastre a origem e o retorno desse domínio no cliente.

## 3. Manter as credenciais somente no servidor

Use `.env` privado ou variáveis privadas da hospedagem. O arquivo é ignorado pelo Git. Nunca coloque o segredo no HTML, no JavaScript público, em PDFs, no pacote de distribuição ou no chat.

```dotenv
PORT=4177
ACADEMY_BASE_URL=http://localhost:4177
ACADEMY_TEST_MODE=1
GOOGLE_CLIENT_ID=preencher-no-servidor
GOOGLE_CLIENT_SECRET=preencher-no-servidor
```

Inicie com `npm start`, que lê `.env` no Node.js 24.15 ou posterior. Preserve o banco e a chave de autenticação existentes; a chave protege os tokens armazenados. Em produção, use domínio HTTPS e banco separado do piloto. Não troque a chave durante uma atualização comum.

O botão Google fica habilitado quando os dois valores estão presentes. Um botão habilitado ainda não confirma que o cliente é válido, que o público foi publicado ou que a pessoa consentiu. Os tokens ficam no servidor e são armazenados de forma criptografada pelo Better Auth.

## 4. Entender o acesso de cada pessoa

**Entrar com Google** e **Criar conta com Google** aceitam qualquer e-mail verificado quando o público OAuth e o cliente estiverem disponíveis. Um novo cadastro sem convite começa como **Vendedor**, sem trilhas e sem permissões de áreas. O Admin recebe um aviso interno e libera os acessos em **Acessos**. O Google não permite a pessoa escolher o próprio papel de Supervisor ou Admin.

Uma conta existente conserva nome, papel, permissões e equipe. Uma conta bloqueada continua bloqueada. Um convite válido conserva seu perfil e suas liberações. O cadastro com e-mail e senha segue exigindo convite; a configuração do Google não muda essa regra.

Quem já entrou por e-mail e senha pode vincular o Google em **Minha agenda**, preservando a sessão atual. Depois do consentimento, a integração cria **ST1 Academy · Minha evolução**. Nenhum conteúdo da resposta de uma tarefa é copiado para o Google.

## 5. Conferir o vínculo e a sincronização

Confira primeiro o retorno OAuth da conta, o vínculo mostrado na Academy e a criação da agenda secundária no Google. Use contas e compromissos de teste isolados para validar os demais cenários, sem criar tarefas fictícias para participantes reais.

1. Programe um treinamento com organizador conectado e participantes autorizados. Confira convite e resposta do convidado.
2. Altere o horário na Academy e depois na agenda ST1 do organizador. Confira os dois lados; confirmação de convite deve permanecer separada da presença.
3. Programe uma tarefa para uma pessoa conectada. Confira o bloco antes do prazo e os lembretes. Envie e valide a resposta na Academy; seu texto deve permanecer na Academy.
4. Cancele e recupere o compromisso. Reinicie o servidor e confira que repetir a sincronização preserva o evento, sem duplicar convites.
5. Mova um evento para a lixeira e confira o cancelamento no próximo ciclo válido. Recupere o cadastro e confira a retomada do mesmo vínculo.
6. Pause e reconecte o vínculo. Confira o estado e a última sincronização; uma falha não deve aparecer como conexão concluída.

Treinamentos usam o calendário ST1 do organizador e solicitam ao Google o envio dos convites. Tarefas são espelhadas no calendário ST1 de cada pessoa conectada, como blocos de 15 minutos antes do prazo. Recebimento de e-mails e alertas depende também das preferências do Google. Os avisos internos da Academy funcionam independentemente dessas preferências.

O servidor verifica lembretes e vínculos a cada minuto enquanto está em execução. SQLite exige host Node com volume persistente. Publicar na Vercel depende da adaptação para banco persistente e execução das rotinas; a publicação da política de privacidade não conclui essa adaptação.

Os testes automatizados usam respostas simuladas da API e bancos isolados. Eles conferem o comportamento do adaptador, mas não comprovam a conexão real de uma conta ou o recebimento externo de cada convite. Registre separadamente os cenários realmente verificados no ambiente.

Referências: [Better Auth Google](https://better-auth.com/docs/authentication/google), [eventos e convites do Google](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert) e [sincronização incremental](https://developers.google.com/workspace/calendar/api/guides/sync).
