# ST1 Academy — Recuperação de senha segura (12/11/2026)

## Contexto confirmado
A Academy usa Better Auth 1.7.7 (email + senha / Google) e integração SMTP própria, inclusive configurações cifradas na aba Integrações. A tela "Esqueci minha senha" atualmente só abre a ajuda e não envia uma recuperação. O servidor já tem CSP, no-referrer, nosniff e limite para login.

## Objetivo
Permitir ao usuário ativo recuperar sua senha através de link por e-mail, sem intervenção administrativa, sem revelar a existência de contas e sem comprometer as sessões ou o login Google.

## Abordagens consideradas
1. **Better Auth + SMTP existente (escolhida):** tokens de uso único, ciclo de recuperação padronizado, menor superfície de risco.
2. Serviço próprio de tokens de recuperação: controle completo, mas repetição de lógica sensível e maior custo de auditoria.
3. Reinicialização manual pelo Admin: operacionalmente ruim e propensa a engenharia social.

## Fluxo
1. Link "Esqueci minha senha" abre `/esqueci-senha`; usuário informa e-mail.
2. `POST /api/password-recovery/request` valida entrada e origem; responde texto neutro para contas válidas, inexistentes, não habilitadas ou limite excedido.
3. Limite de solicitações por e-mail e IP com hashes no banco, sem gravação de e-mails em tabela de throttle; 3/h por e-mail, 10/h por IP. A API de recuperação direta do Better Auth fica inacessível por HTTP, evitando contorno do limite.
4. O Better Auth cria token com validade de **30 min** e envia link via SMTP existente (credenciais no servidor / Integrações). Falha na entrega é registrada sem token ou dados sensíveis.
5. O link redireciona à página local `/redefinir-senha`. A página limpa o token da barra de endereço imediatamente e envia nova senha com confirmação via Better Auth.
6. Após sucesso, tokens não podem ser reutilizados, as sessões anteriores são revogadas e um e-mail transacional informa sobre a mudança, sem incluir senha.
7. Contas apenas Google seguem podendo entrar pelo Google; nenhuma permissão ou perfil é alterado pela redefinição.

## Segurança e limites
- Nunca retornar "e-mail não cadastrado" ao solicitante.
- O endereço de retorno é gerado a partir da URL base validada, não de cabeçalhos HTTP recebidos.
- E-mail de recuperação e de aviso não conterão credenciais, senhas ou informações sobre role/teams.
- Página de reset com CSP de mesma origem, Cache-Control no-store, Referrer-Policy no-referrer, sem scripts externos.
- Sessão criada só por login normal após a troca; sem auto-login pelo reset.
- Conta desativada não recebe e-mail de recuperação.
- Senhas novas devem ter ao menos 12 caracteres e até 128.
- Não publicar credenciais de SMTP nem executar reset real para usuários na validação; testes usam remetente falso injetável.

## Aceite
- E-mail conhecido com credencial recebe link; desconhecido recebe mesma mensagem, sem link.
- Quarto pedido por e-mail ou 11º por IP no período não gera e-mail.
- Token de 30 min, single-use e inválido após reset; outras sessões revogadas.
- Conta Google, convites, perfis e histórico das trilhas permanecem intocados.
- Testes HTTP e de serviços cobrem os caminhos de sucesso, abuso e falhas.
- Publicação somente após verificação e credenciais SMTP configuradas no ambiente de produção.

## Fontes
- OWASP Forgot Password Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- OWASP WSTG — https://wstg.owasp.org/latest/4-Web_Application_Security_Testing/04-Authentication/09-Weak_Password_Change_or_Reset_Functionalities/
- Better Auth email/password — https://www.better-auth.com/docs/authentication/email-password
