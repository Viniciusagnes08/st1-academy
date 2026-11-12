# ST1 Academy — Regra 1: limite de tentativas (design)

## Decisão aprovada
Até **três inícios de tentativa por avaliação e versão**, contando tentativas em andamento e concluídas. O retorno à mesma tentativa aberta não consome uma nova vaga. Uma formação com várias avaliações não é limitada a três provas no total.

## Escopo
Aplicar tanto às avaliações de etapa/sprint (`academy_quiz_attempt`) quanto à avaliação final de certificação (`academy_attempt`).

## Autorizações
Após esgotar o limite, um Admin ativo pode autorizar uma tentativa adicional para pessoa apta àquela avaliação. Um Supervisor ativo com permissão de resultados da equipe pode autorizar apenas vendedor ligado explicitamente a ele em `academy_supervision`. Supervisores não podem autorizar outras equipes nem a si mesmos. Cada autorização libera **uma** tentativa e exige motivo, autor, data e vínculo com avaliação/versão. Uma versão nova tem contador próprio.

## Interface
Aviso antes de começar, saldo e bloqueio visíveis. Tela de autorizações para Admin/Supervisor listar bloqueios sob seu escopo, justificar e liberar uma tentativa, com trilha de auditoria. Não expor gabaritos, PII ou conteúdos não autorizados.

## Integridade
Checagem e criação da tentativa na mesma transação para evitar duas abas contornarem o limite; retomada de tentativa aberta continua permitida. Iniciar deve revalidar o vínculo, trilha e permissão no servidor. Resultado, XP e certificações históricos não são apagados.

## Aceite
1. Inícios 1, 2 e 3 permitidos; quarto sem liberação retorna 423.
2. Reabrir tentativa ainda aberta não consome outra vaga.
3. Admin/gestor vinculado libera uma tentativa mediante motivo; demais negados.
4. Nova versão reinicia limite. Históricos persistem.
5. Etapas, sprints e prova final obedecem aos mesmos princípios; acesso/concorrência cobertos em testes.
