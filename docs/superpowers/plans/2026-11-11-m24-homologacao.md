# M24 — Integração administrativa na aplicação principal

**Objetivo:** disponibilizar a primeira fatia de governança do conhecimento na ST1 Academy principal, somente para contas Admin ativas, sem mudar publicação, certificados, progresso ou recomendações reais.

**Arquitetura:** monólito modular; rotas e arquivos privados protegidos no servidor; tabelas `academy_m24_*` exclusivas do piloto. A biblioteca existente é somente lida. `ACADEMY_M24_ENABLED=0` é a chave emergencial de desligamento.

## Restrições

- Acesso exige sessão válida, conta ativa e papel Admin conferido no servidor.
- Vendedor, Supervisor, anônimo e conta desativada não recebem página, arquivos ou APIs privadas.
- Não copiar credenciais ou dados pessoais para código ou documentação.
- Nenhuma gravação nas tabelas operacionais por este módulo; nenhuma campanha ou IA externa.
- Aprovação vinculada à revisão do conteúdo e versões das fontes. Autorrevisão exige justificativa explícita.

## Entrega

- [x] Implementar domínio experimental, concorrência, auditoria e repetição segura.
- [x] Implementar página, arquivos privados e APIs autenticadas.
- [x] Testar dois Admins autorizados e bloqueio dos demais papéis.
- [x] Manter chave de desligamento sem apagar os dados do piloto.
- [x] Registrar baseline da suíte geral e testes focados.
- [ ] Integrar na `main` e publicar a aplicação principal.
- [ ] Validar `/healthz`, acesso Admin, bloqueios e UI autenticada após a publicação.

## Decisão de 11/11/2026

O responsável optou por não duplicar aplicação ou banco. O M24 deve ser integrado à `main` e ficar visível somente para Admins. A rota histórica `/homologacao/m24` é mantida por compatibilidade interna, mas a interface é apresentada como **Governança do Conhecimento**.
