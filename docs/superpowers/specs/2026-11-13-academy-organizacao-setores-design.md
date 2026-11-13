# ST1 Academy — Organização por áreas e setores (13/11/2026)

## Objetivo aprovado
Disponibilizar as 18 macroáreas de uma empresa de telecom e seus setores dentro do ST1 Academy, para organizar pessoas e trilhas sem confundir setor com canal, squad, cargo ou permissão.

## Modelo
- Área: agrupamento organizacional fixo (18 categorias iniciais).
- Setor: especialidade que pertence a uma área, com nome, estado ativo/inativo e identificador estável; o Admin pode criar, renomear e desativar.
- Cargo: resposta de onboarding, separada de setor.
- Squad: grupo social/operacional já existente, sem alterações.
- Permissão e trilha: acesso explícito atual permanece intacto.
- Colaborador: associação a um setor, persistida separadamente da autorização de acesso.

## Funcionalidades
1. Administração em Gestão → Setores: visualizar 18 áreas e setores, criar/renomear/desativar, buscar colaboradores e classificar setor.
2. Onboarding: primeiro escolher a área, depois o setor, depois cargo/squad/desafios/metas; persistir IDs e nome legível.
3. Ler onboarding legado com setores PAP, Digital, Indoor, Elite, Gestão e Outro, sem apagar respostas. Atualização requer escolha nova de área/setor.
4. Não migrar em massa usuários atuais por inferência nem conceder trilhas/certificados automaticamente.
5. A lista é automaticamente inicializada de forma idempotente; novas publicações nunca reativam setores desativados.
6. APIs administrativas exigem sessão e role Admin. Classificações não concedem acesso à gestão.
7. Migração aditiva de banco, preservando logins, resultados, certificados e cursos.

## Verificação
- 18 macroáreas e todas as especialidades padrão listadas.
- Testes de idempotência, cadastro, edição, desativação, vínculo de usuário, isolamento de permissões e onboarding.
- CI de Node 24 e PostgreSQL 17 verde antes de mesclar em main.
- Não há migração destrutiva nem disparo de campanhas.

## Escopo adiado
Filtros de relatórios, campanhas e atribuição automática de trilhas por setor requerem regras pedagógicas e operacionais próprias. Não ativar esses efeitos colaterais neste cadastro.
