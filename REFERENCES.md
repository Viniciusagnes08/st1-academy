# Referências da gamificação ST1 Academy

As referências fornecidas orientaram os padrões de interação e organização. A implementação mantém HTML, CSS, JavaScript, Express e SQLite do projeto, com Poppins, preto/laranja ST1 e os temas de canal aprovados. Não há troca de marca nem certificação emitida pelas plataformas de referência.

| Referência original | Padrão usado na ST1 Academy |
| --- | --- |
| [Duolingo clone](https://github.com/sanidhyy/duolingo-clone/tree/main) | Percurso por etapas, próximo passo, personagem participando e devolutiva que incentiva continuar. |
| [Trophy UI](https://ui.trophy.so/) e [documentação](https://ui.trophy.so/docs) | Pódio, ranking, métricas de evolução e filtros, concentrados em Resultados. |
| [LMS Front](https://github.com/guillermoscript/lms-front) | Perfis, comunidade, organização de equipes, moderação, registros e celebração de certificados. |
| [Moodle Level Up XP](https://github.com/FMCorz/moodle-block_xp) | Prêmios por evidência, níveis com limiares editáveis, ranking e notificações. |
| [Moodle Block Game](https://github.com/jotadf/moodle-block_game/tree/master) | Identidade do participante, avatar/mascote e evolução visível por pontos. |
| [Moodle Trail](https://github.com/jotadf/moodle-format_trail/tree/main?tab=readme-ov-file) | Sequência de etapas, estado de conclusão e acesso à próxima prática. |
| [ClassQuiz](https://github.com/mawoka-myblock/ClassQuiz) | Provas rápidas, cronômetro, respostas salvas e encerramento pelo prazo. |
| [xyflow](https://github.com/xyflow/xyflow) | Mapa de nós e conexões, seleção de temas, zoom e navegação. |

As bibliotecas React dessas referências não foram instaladas nem apresentadas como uma integração concluída. Ranking, percurso, quiz e mapa foram implementados no próprio projeto. O mapa usa SVG e eventos nativos do navegador. Os repositórios Moodle orientaram conceitos; não há código copiado deles no produto. As dependências efetivamente distribuídas continuam declaradas no package.json e no arquivo de lock.

## Materiais e estrutura do time

Os sete materiais comerciais aprovados e o banco de 100 perguntas continuam sendo a base das cinco certificações. Novas perguntas criadas pelo Admin podem avaliar outros temas e passam a alimentar o mapa após uma tentativa concluída. A Academy não infere aprendizado apenas por tempo de leitura ou abertura de conteúdo.

Os squads iniciais foram extraídos dos nomes das pastas em [estrutura fornecida do time comercial](https://drive.google.com/drive/u/1/folders/15FE-05p5C5W4Z1Unqt2-IT0LlYfFFXMj). Os identificadores de origem estão em content/squads.json. Nomes de arquivos com indicação de supervisão são referências de cadastro, sem criação automática de contas ou concessão de acesso. A validação do vínculo é feita pelo Admin.

O Starzinho vem das poses oficiais já disponíveis nos artefatos ST1 do workspace. São arquivos WebP originais, usados sem alteração da aparência. A voz é a síntese em português disponível no navegador, acionada pelo botão; não é uma gravação de locutor.

## Estado desta entrega

A implementação funciona no piloto local com armazenamento persistente e testes isolados. Chat e notificações usam consultas periódicas. A publicação externa, o adaptador de banco para Vercel e o consumo da fila de integração pelo ST1 Sales continuam etapas próprias, ainda não concluídas.
