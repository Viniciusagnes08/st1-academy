# ST1 Academy — Segurança: diagnóstico e prioridades (12/11/2026)

Escopo: revisão passiva do repositório, configuração de autenticação e recomendações OWASP/Better Auth. Não houve pentest, varredura de produção ou análise de credenciais reais.

| Estado | Risco e evidência | Severidade / confiança | Ação e reteste |
|---|---|---|---|
| Confirmado: corrigido na branch de recuperação | `public/assets/login.js` encaminhava "Esqueci minha senha" para ajuda, sem fluxo de e-mail | Alto / alta | Usar Better Auth: link 30 min, uso único, revogação de sessões, throttling; testar conhecido, desconhecido, repetido, expirado, sessão antiga |
| Confirmado: atualização pendente | `package.json` fixa `better-auth@1.7.7`; GHSA-9hm7-xhfp-cx58 informa correção na 1.7.16. O cenário descrito envolve provedores OAuth específicos/claims e não foi comprovado nesta Academy, que verifica `email_verified===true` no login Google | Médio potencial / alta sobre versão, baixa sobre exploração | Atualizar para >=1.7.16 (preferir a estável mais recente compatível), atualizar lockfile, rodar migrações e testes de login Google e por convite; não afirmar exploração sem teste |
| Confirmado | Não há 2FA explícito para papéis Admin/Supervisor em `lib/context.mjs`; somente e-mail/senha/Google | Alto / alta | Planejar MFA obrigatório para perfis privilegiados; definir recuperação e fluxo Google com requisitos de segurança próprios |
| Confirmado: controle existente | Permissões por perfil/trilha, verificação de sessão no servidor, limite para login, no-referrer, CSP de mesma origem, HTTPS exigido para produção | Informativo / alta | Manter e acrescentar testes de regressão/negação |
| Confirmado: melhoria na branch | Ausência anterior de limite por e-mail e IP para pedido de redefinição | Médio / alta | Criar quota persistente, resposta indistinguível e bloquear endpoint alternativo |
| Não verificado | Configuração SMTP de produção, entrega e SPF/DKIM/DMARC, disponibilidade real da caixa do destinatário | Alto para disponibilidade / desconhecida | Validar com conta técnica, sem enviar links reais a funcionários durante QA |
| Não verificado | Exposição de endpoints externos, backups, sessões compartilhadas e controles de armazenamento | A avaliar | Revisão autorizada de infraestrutura, políticas de retenção e teste de restauração |
| Pendente | Dependências podem ficar defasadas sem manutenção | Médio / alta | Dependabot semanal para npm e GitHub Actions, sem merge automático |

## Estratégia de implementação
1. **Agora:** recuperar senha por e-mail com o Better Auth e SMTP existente, tokens temporários, rate-limit por conta/IP, encerrar sessões anteriores, aviso de alteração de senha, referrer-policy e cache seguro.
2. **Próximo ciclo:** atualizar `better-auth` e o lockfile; MFA para Admin/Supervisor, login suspeito e notificações administrativas.
3. **Depois:** logs de segurança estruturados (sem token, senha ou PII), limites por conta no login, auditoria de dependências e segredo, backups criptografados e restauração testada.

## Fatos e cautelas
- Um aviso de biblioteca não comprova exposição ou invasão da ST1 Academy.
- Não registrar credenciais, links de reset nem tokens em logs.
- Não executar testes intrusivos ou redefinir senhas reais sem validação e controle do ambiente.

Fontes:
- https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- https://wstg.owasp.org/latest/4-Web_Application_Security_Testing/04-Authentication/09-Weak_Password_Change_or_Reset_Functionalities/
- https://github.com/better-auth/better-auth/security/advisories/GHSA-9hm7-xhfp-cx58
- https://better-auth.com/docs/authentication/email-password
- https://github.com/OWASP/ASVS/blob/master/5.0/en/0x25-V16-Security-Logging-and-Error-Handling.md
