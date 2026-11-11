# WhatsApp na ST1 Academy

## Preparação

Em **Integrações → WhatsApp Business**, o Admin informa a versão da Graph API, o ID do número, o ID da conta WhatsApp Business e o token de acesso. Para receber os estados de envio, entrega e leitura, informa também o App secret e um token de verificação próprio. Todos os segredos são guardados cifrados e não voltam na API de leitura.

No aplicativo da Meta, cadastre `https://st1academy.tech/api/webhooks/whatsapp` como URL de callback, use o mesmo token de verificação e inscreva o campo `messages`. O endpoint verifica o desafio de cadastro e a assinatura HMAC-SHA256 das notificações antes de registrar recibos.

## Modelos e ativação

Em **Campanhas de WhatsApp → Automações**, há 20 gatilhos preparados, todos inicialmente pausados. Os textos exibidos são sugestões; não são modelos aprovados. Crie ou revise cada modelo na conta da Meta, aguarde aprovação e informe o nome e idioma exatos na Academy. Cada modelo automático deve ter somente o parâmetro `{{1}}` no corpo, destinado ao primeiro nome; parâmetros adicionais em cabeçalho ou botões impedem a ativação.

Use **Verificar e ativar** por gatilho ou **Ativar modelos aprovados** após revisar o conjunto. A Academy consulta a conta conectada antes da ativação. Uma mudança de modelo volta a pausar o gatilho e descarta pendências antigas. Pausar também descarta pendências, sem apagar o histórico.

## Regras de envio

- Apenas contas ativas, com telefone brasileiro válido e autorização específica de WhatsApp registrada para o telefone atual, entram na fila.
- Os eventos são posteriores à ativação do gatilho. A execução ocorre em dias úteis, das 9h às 18h, no horário de Fortaleza.
- Há no máximo uma mensagem automática aceita por pessoa a cada sete dias, contando também os disparos manuais aceitos. Pendências expiram após 14 dias.
- Falhas ou respostas incertas da API não são reenviadas automaticamente para evitar duplicidade. O Admin acompanha o resultado e decide sobre um novo disparo.
- **Aceito pela API** significa apenas que a Meta retornou um ID. **Entregue** e **Lido** dependem dos recibos assinados enviados ao webhook. A leitura pode não estar disponível para todas as pessoas.

## Estado inicial

Publicar o código não dispara mensagens. A conta Meta, os modelos aprovados, o webhook e os consentimentos precisam estar configurados. Até lá, campanhas podem ser preparadas como rascunho e os 20 gatilhos continuam pausados.
