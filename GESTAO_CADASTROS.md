# Cadastros da ST1 Academy

O Admin encontra os seis tipos em **Gestão → Cadastros**. A área reúne criar, consultar, editar, mover para a lixeira e recuperar. Os Vendedores e Supervisores continuam usando as áreas e conteúdos liberados para sua conta; o cadastro aberto com Google não concede acesso à gestão.

## Escolher o tipo de cadastro

| Tipo | Para que usar | Onde criar ou editar |
| --- | --- | --- |
| Eventos | Treinamentos, reuniões e tarefas com prazo, orientação e público | Editor de Programação do time |
| Conteúdos | PDFs, imagens, textos e links com categoria, módulo, público e trilhas | Editor de Publicar conteúdo |
| Certificados | Modelos de reconhecimento, carga horária, assinatura e regra de emissão | Formulário de certificados com prévia |
| Insígnias | Identidade visual de uma conquista, com formato, símbolo e cor | Formulário de insígnias com prévia |
| Squads | Nome, descrição, supervisor e participantes de um time | Editor de Organizar squads |
| Etiquetas | Nomes curtos para organizar cadastros relacionados | Formulário de etiquetas |

Cada lista oferece busca por nome, descrição ou etiqueta e filtro por situação. **Abrir** apresenta os detalhes; **Editar** leva ao formulário correspondente. A tela confere a versão do cadastro no servidor. Se outra tela tiver salvo uma alteração, reabra o cadastro antes de continuar.

## Organizar com etiquetas

1. Abra **Etiquetas → Nova etiqueta**.
2. Defina nome, descrição, cor e situação. Use um nome específico, como “Integração do time” ou “Processo PAP”.
3. Salve a etiqueta como Ativa.
4. Abra o cadastro que receberá a etiqueta, marque as opções e clique em **Salvar etiquetas**.

Etiquetas organizam conteúdos, eventos, certificados, insígnias e squads. Elas não concedem acesso ao material. Uma etiqueta arquivada ou na lixeira deixa de aparecer na seleção e nos rótulos apresentados ao time; seu vínculo histórico permanece armazenado.

## Criar um certificado personalizado

1. Em **Certificados → Novo certificado**, preencha nome e descrição.
2. Escolha cor, carga horária, assinatura e cargo ou área da assinatura.
3. Se desejar, vincule uma insígnia ativa.
4. Escolha a regra de emissão e o vínculo exigido.
5. Confira a prévia e salve como Rascunho ou Ativo.

| Regra | O que o servidor exige antes da emissão |
| --- | --- |
| Registro do Admin | Pessoa ativa e motivo ou evidência registrado pelo Admin |
| Participação validada | Entrega aceita ou presença confirmada pela gestão no evento vinculado |
| Prova da trilha | Certificação já conquistada pela pessoa na trilha vinculada |

Aceitar o convite de um treinamento ou declarar presença não comprova participação validada. O certificado personalizado registra o reconhecimento configurado; ele não substitui o certificado das cinco provas comerciais. Essas provas continuam exigindo pelo menos 80% de acertos e acerto em todas as regras críticas.

## Criar uma insígnia

Em **Insígnias → Nova insígnia**, defina nome, descrição, cor, formato e símbolo. A prévia acompanha o preenchimento. Salve como Ativa quando ela estiver pronta para ser emitida ou vinculada a um certificado.

Criar ou ativar um modelo não concede uma conquista a ninguém. A emissão acontece em uma ação separada.

## Emitir e conferir o reconhecimento

1. Abra um modelo ativo de certificado ou insígnia.
2. Clique em **Emitir para uma pessoa**.
3. Selecione a pessoa ativa e registre o motivo ou a evidência, com pelo menos 10 caracteres.
4. Confirme a emissão.
5. Consulte **Acompanhar certificados e insígnias emitidos**.

O reconhecimento aparece em **Minhas conquistas** e no perfil da pessoa. Se ela estiver em um squad, o canal interno recebe a novidade. O acesso ao perfil e ao arquivo continua dependendo da sessão e das permissões. A emissão personalizada não concede XP e não gera a integração de aprovação de trilha para o ST1 Sales.

O servidor guarda o nome, o modelo, a versão e o arquivo da emissão. Editar o modelo depois não modifica aquele PDF ou SVG. Repetir a emissão para a mesma pessoa e versão retorna o mesmo registro. Se o modelo mudar de versão, uma nova emissão passa a ser possível com nova evidência.

Certificados personalizados têm uma referência e um QR code. A verificação pública informa título, emissão, referência, situação e hash do PDF; não publica nome, telefone ou evidência. Os certificados gerados no piloto têm identificação de teste interno.

## Revogar ou restaurar uma emissão

Na lista de emissões, clique em **Revogar emissão** ou **Restaurar emissão** e registre o motivo. A situação é atualizada sem substituir o arquivo ou sua referência.

Uma emissão revogada deixa de aparecer como conquista válida para o participante e bloqueia seu download para ele. A gestão conserva o histórico, e a verificação pública informa a revogação. Restaurar recupera o mesmo registro e arquivo.

## Usar a lixeira

**Mover para a lixeira** tira o cadastro de circulação, preservando o histórico. A ação pede confirmação. Em cada tipo, abra **Lixeira → Recuperar** para devolver a situação anterior do cadastro.

| Cadastro removido | O que fica preservado |
| --- | --- |
| Conteúdo | Arquivos, versões, metadados e registros anteriores de leitura |
| Evento | Público, entregas, presenças e histórico; o evento fica cancelado |
| Squad | Mensagens e vínculos históricos |
| Certificado ou insígnia | Modelo e emissões já realizadas, com os arquivos originais |
| Etiqueta | Registro e vínculos históricos |

Se um evento tiver espelho no Google, o cancelamento é enviado na próxima sincronização válida. Recuperar o evento permite a retomada pelo mesmo vínculo. A agenda interna, o consentimento Google e o estado da sincronização precisam estar válidos para essa atualização externa ocorrer.

Remover o modelo não revoga automaticamente as emissões anteriores. Para invalidar um reconhecimento, use **Revogar emissão**. A lixeira não apaga os registros de auditoria.

## Continuidade do acesso

Mantenha a pasta privada `data/`, a chave de autenticação e as credenciais no servidor durante atualizações. Não publique essa pasta nem o arquivo `.env`. O pacote de código não leva contas, fotos, respostas, tokens ou credenciais. O piloto local continua identificado como teste e usa um banco separado dos bancos de QA.

## Módulos e materiais de estudo

Abra **Cadastros → Módulos de conhecimento → Novo módulo**. Informe o nome (por exemplo Gestão, Comercial ou Pesquisa de Mercado), uma descrição curta, as trilhas e o público. Salve o módulo. Ele aparece na faixa horizontal do Início para as contas autorizadas; depois associe os materiais pelo editor de conteúdo.

No conteúdo, selecione título, categoria, tipo, arquivo/texto/link, trilhas, módulos e público. Use **Salvar e publicar** para exibir em Conteúdos e nos materiais recentes do Início. **Salvar rascunho** guarda somente na gestão. Arquivos devem concluir o envio antes da publicação. Caso o envio falhe, o rascunho fica preservado e o formulário permite continuar.

Dentro do material, o participante pode **Marcar estudo como concluído**. Seu progresso fica na conta, no Início e nos cards. **Retomar estudo** desfaz a declaração de conclusão. Esse controle organiza o estudo; as certificações continuam exigindo aprovação na avaliação correspondente.
