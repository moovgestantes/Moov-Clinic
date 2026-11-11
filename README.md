# MOOV Clinic

## Teste local no VS Code e no Windows

No VS Code, abra a pasta interna `moov-clinic`. No terminal, execute `npm ci` na primeira vez e depois `npm run dev`. Abra http://127.0.0.1:3000/ e mantenha o terminal aberto.

Extraia todo o ZIP em uma pasta nova e dê dois cliques em `ABRIR_MOOV_CLINIC.cmd`. O atalho fica ao lado da pasta `moov-clinic`. Ele usa o Node.js já instalado, instala as dependências na primeira execução e abre o navegador em http://127.0.0.1:3000/. Deixe a janela aberta durante o teste. O `.env.local` já contém a configuração pública do Supabase do Clinic.

Para publicar, abra apenas a pasta interna `moov-clinic` no VS Code. O `.env.local` fica fora do Git. Use no Netlify as duas variáveis públicas do mesmo Supabase, com a pasta base em branco, o comando `npm run build -- --require-supabase` e a pasta de publicação `dist`. Aplique `supabase/excluir_pendencias_e_laudos.sql` no Supabase antes de testar a nova exclusão.


## Criar e concluir pendências

Em **Nova pendência** ou **Editar**, preencha o primeiro campo **Pendência**. Clique em **Adicionar outra pendência** para incluir mais campos no mesmo registro. Ao abrir o registro, marque cada item com o ✓. O progresso aparece na lista e no perfil do paciente. O salvamento dos itens usa a migração `supabase/itens_da_pendencia.sql`.

## Excluir pendências e laudos

Execute `supabase/excluir_pendencias_e_laudos.sql` após as migrações do projeto já instalado. Essa atualização funciona com ou sem a migração anterior `excluir_pendencias.sql`. Ao excluir uma pendência, suas observações e seus anexos saem também do histórico do paciente. Para excluir somente um laudo, use **Excluir** no laudo. Use **Editar** para ajustar o nome, a data ou os resultados.

O banco remove os registros e enfileira a remoção dos originais. O app usa a API do Storage para excluir os arquivos e tenta novamente ao atualizar ou reabrir o painel se houver falha. A seção de restauração de laudos foi removida. Laudos arquivados anteriormente permanecem ocultos, salvo quando sua pendência ainda existe e é excluída junto com seus anexos.

## Cadastro a partir de um laudo

Execute `supabase/cadastro_pelo_laudo.sql` após as migrações anteriores. Em uma pendência geral com um único laudo ativo, o app tenta preencher o nome e a data de nascimento por leitura local. A equipe pode corrigir os campos, vincular um cadastro existente ou confirmar **Criar cadastro**. O laudo original já salvo aparece no histórico após o vínculo. Para reabrir a sugestão, use **Cadastrar pelo laudo** na pendência. Pendências com vários laudos continuam com o vínculo manual em **Editar**.

## Atualização de laudos e cadastros

- Execute uma vez `supabase/leitura_e_pacientes_arquivados.sql` no Supabase existente. Em um projeto novo, execute esse arquivo após `acesso_equipe.sql`. A migração adiciona os campos `read_at` e `archived_at`.
- Em uma pendência geral ou vinculada a paciente, use **Anexar laudos** para selecionar vários arquivos. Informe a modalidade e, se quiser, a data de cada laudo. A leitura começa ao salvar. Com o Gemini habilitado, os PDFs elegíveis seguem para análise após confirmação de anonimização. Quando o envio for cancelado ou o Gemini falhar, o app tenta a leitura local. Se um arquivo falhar depois que outros já foram salvos, a mesma janela permite repetir o envio sem duplicar os arquivos concluídos.
- Ao criar ou editar uma pendência sem vínculo, escolha **Vinculada a paciente**, digite o nome e clique no resultado. Os laudos já anexados aparecem no perfil após salvar o vínculo.
- Em **Pacientes → Ver perfil → Exames**, o histórico inclui os laudos enviados nas pendências vinculadas. Os exames ficam agrupados pela data do exame ou, se não foi informada, pela data de envio.
- Use **Marcar como lido** em cada laudo. **Lido** indica que alguém da equipe viu o exame. **Conferido** continua dependendo da conferência dos resultados no original.
- No resumo clínico, **Excluir paciente** arquiva o cadastro, tira suas pendências das listas ativas e mantém o histórico. Para reativar, abra **Pacientes → Arquivados → Ver perfil → Restaurar cadastro**.

## Teste desta atualização

- Abra no VS Code a pasta interna `moov-clinic`, que contém `package.json` e `package-lock.json`. Preserve o seu `.env.local` e o projeto Supabase já configurado. Aplique a migração desta atualização antes de testar.
- Rode `npm ci` e depois `npm run dev`. Na tela **Pacientes**, digite parte do nome para testar a busca imediata.
- Crie uma pendência vinculada a um paciente fictício. Abra a pendência e use **Anexar laudo** com `exemplos/Laudo_ficticio.pdf`. O mesmo exame aparece na aba **Exames** do perfil. Em **Observações da equipe**, salve um texto de exemplo e confira o nome da pessoa e a data. O botão **WhatsApp** abre a conversa para envio manual.

Painel de atendimento inspirado na navegação por perfis do MOOV Gestar. O projeto usa o banco do MOOV Clinic. A evolução acrescenta pacientes, exames e pendências vinculadas. O painel tem menu lateral, dashboard, cartões de pacientes e abas no perfil. O painel de pendências gerais continua disponível. A atualização de exames acrescenta a data de realização no Supabase.

## Publicar no Netlify

1. Use o projeto Supabase já configurado. Em **Authentication → Users**, confira as contas de Dra. Mayara e Beatriz. Em `public.clinic_members`, confirme que os IDs dessas contas estão autorizados. Mantenha o cadastro público desativado.
2. Conecte o repositório do aplicativo ao Netlify. A pasta base deve ser a que contém `package.json` e `netlify.toml`. O arquivo configura a compilação, a pasta `dist` e as funções de IA. Inclua os arquivos do projeto no repositório e mantenha o `.env.local` privado.
3. Nas variáveis de ambiente do Netlify, adicione os valores reais abaixo. Para testar apenas login e fluxo clínico, use as duas primeiras linhas. As variáveis de IA são opcionais.

   | Variáveis | Onde ficam disponíveis |
   |---|---|
   | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Builds e Functions |
   | `VITE_MOOV_GEMINI_PILOT=true` | Builds, conforme o recurso desejado |
   | `OPENAI_API_KEY`, `MOOV_ENABLE_CLINICAL_AI=true` | Functions, para leitura assistida de laudos |
   | `GEMINI_API_KEY`, `MOOV_ENABLE_GEMINI_PILOT=true` | Functions, para leitura de PDFs |

4. Publique. Em **Supabase → Authentication → URL Configuration**, use o endereço HTTPS publicado como **Site URL** e adicione o mesmo endereço em **Redirect URLs** para recuperação de senha. Inclua também o endereço local exato se for testar a recuperação no computador.
5. Abra a URL publicada em uma janela anônima e teste o login das duas contas, a recuperação de senha e o fluxo de laudo com dados fictícios antes de usar em atendimento.

## Atualizar quem já tem o MOOV Clinic

1. Abra **SQL Editor** no projeto **MOOV Clinic**. Se a evolução clínica ainda não estiver instalada, execute `supabase/evolucao.sql` uma vez. Em seguida, execute `supabase/exames_historico.sql` para adicionar a data de realização dos exames e `supabase/pendencias_exames.sql` para habilitar a modalidade e o vínculo de pendências existentes. Depois execute `supabase/arquivar_laudos.sql` para arquivar e restaurar laudos. Em seguida, execute `supabase/acesso_equipe.sql`. Quem já aplicou `arquivar_laudos.sql` precisa executar apenas `acesso_equipe.sql`. A migração acrescenta tabelas e permissões. Use o projeto que já contém as tabelas e contas do MOOV Clinic.
2. Descompacte o ZIP e abra a pasta interna `moov-clinic` no VS Code. Copie o seu `.env.local` já preenchido para essa pasta, ao lado de `package.json`. Se precisar criar o arquivo, copie `.env.example` para `.env.local` e preencha os dois valores reais do seu projeto.
3. Com Node.js 22.13 ou superior, rode `npm ci` e depois `npm run dev`. Abra o endereço do terminal.

Para uma instalação nova, execute `supabase/setup.sql` antes de `supabase/evolucao.sql`, `supabase/exames_historico.sql` e `supabase/pendencias_exames.sql` e `supabase/arquivar_laudos.sql` e `supabase/acesso_equipe.sql`, nessa ordem. Crie os dois usuários em Authentication, desative o cadastro público e vincule os UUIDs em `public.clinic_members`, com os nomes `Bia` (ou `Beatriz`) e `Dra. Mayara`.

## Fluxo de trabalho e acesso

- **Navegação:** menu lateral fixo no computador e recolhível pelo botão **Menu** em tablets e celulares.

- **Dashboard:** pendências abertas, prioridade alta e laudos a conferir para a médica. Os indicadores abrem as listas correspondentes.
- **Pendência:** a médica pode escolher um paciente ao criar ou editar uma pendência geral. Ao vincular, a pendência e os anexos passam ao acesso clínico. O vínculo de um registro clínico já criado é protegido contra troca ou remoção. Em **Pendências → Abrir → Exames → Incluir exame**, escolha Laboratorial ou Ultrassom, informe a data e anexe o laudo. Ele aparece também na aba Exames do perfil do paciente.
- **Ultrassom:** a leitura local tenta extrair trechos identificados como achados, conclusão ou impressão. Frases inequívocas como “Exame normal” ou “Exame alterado” podem receber etiqueta automática. Os demais trechos ficam para revisão manual. A seção **Principais pontos da conclusão** organiza o texto identificado em tópicos extraídos, sem acrescentar interpretações. Se a conclusão não for reconhecida, confira o original. Abra o original, confira os trechos e ajuste a classificação antes de salvar. A leitura é textual e o original fica disponível. Laudos anteriores ficam com modalidade laboratorial por padrão.

- **Bia e Dra. Mayara:** mesmo acesso a cadastros, pendências, prontuários, exames, arquivos e recursos de IA quando habilitados. Cada pessoa entra com sua própria conta.
- **Exame:** ao anexar um PDF ou imagem, o app extrai texto localmente e tenta OCR para imagens. Ao salvar, cria uma pendência para conferência. O laudo original abre ao lado do resultado editável. Os resultados aparecem em lista, agrupados quando o hemograma é identificado, com etiquetas verdes, rosas ou cinzas à direita. A data da realização pode ser informada no upload ou corrigida ao abrir o laudo. Sem data preenchida, a leitura tenta localizar uma data única de coleta ou realização. O histórico fica em **Exames antigos**. Laudos anteriores sem data ficam sem data até conferência manual. Compare os dados e as faixas no original antes de confirmar. A leitura local suporta até 30 páginas e tenta OCR em até seis páginas digitalizadas. Formatos não reconhecidos exigem preenchimento manual.

O app abre na tela de login. Se faltar a configuração do Supabase, o formulário fica bloqueado com uma mensagem de configuração. Há um laudo de teste em `exemplos/Laudo_ficticio.pdf`. A demonstração só funciona no servidor de desenvolvimento, sem Supabase, se você definir `VITE_MOOV_DEMO=true` explicitamente.

## Revisar exames e usar áudio

- Os laudos ficam em linhas compactas. **Ver resultados** expande a leitura. **Editar** permite revisar os resultados e a data. **Reler PDF ou imagem** substitui a extração de um laudo ainda pendente de conferência, mantendo a data já informada.
- A leitura laboratorial descarta cabeçalhos e referências por faixa etária. Quando a referência aplicável for ambígua, a linha fica em revisão manual. Confira os valores extraídos contra o original.
- **Excluir** remove o laudo do histórico e solicita a exclusão do original no Storage.

## Validação antes de usar em atendimento

1. Confirme o projeto no Supabase e mantenha uma cópia do banco e uma cópia separada dos arquivos do bucket privado. O ZIP contém o aplicativo, sem dados de pacientes.
2. Com um paciente fictício, registre uma pendência, anexe um PDF e confira o laudo. Reabra o app para conferir que os registros persistem.
3. Exclua um laudo fictício da lista, recarregue a página, abra o original em **Lixeira e arquivados** e restaure. Confira o histórico e as pendências.
4. Entre com Bia e confirme que ela tem os mesmos acessos clínicos da Dra. Mayara. Teste separadamente a gravação no microfone do computador.

## Criar uma nova senha para uma conta existente

Em **Authentication → URL Configuration** do Supabase, inclua em **Redirect URLs** o endereço exato usado para abrir o app, por exemplo `http://127.0.0.1:3000/` ou o endereço publicado. Na tela de login do MOOV Clinic, preencha o e-mail e clique em **Esqueci minha senha**. Abra o link recebido no e-mail, defina a nova senha e entre novamente.

## Habilitar a OpenAI

A extração local de exames funciona sem chave. A leitura assistida usa a função `netlify/functions/clinical-ai.mjs`, exige sessão da equipe e confirmação antes de enviar o texto extraído.

Para testar a função no VS Code, use **Netlify Dev**. Configure também, no ambiente do processo, os mesmos valores de `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` do frontend e as variáveis `OPENAI_API_KEY` e `MOOV_ENABLE_CLINICAL_AI=true`. Depois execute `npx netlify-cli dev` e abra o endereço informado pelo Netlify Dev. Use dados fictícios nessa validação.

Para publicação, mantenha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` disponíveis no build e no ambiente das funções. Configure `OPENAI_API_KEY` e `MOOV_ENABLE_CLINICAL_AI` no ambiente das funções. A chave da OpenAI deve ficar no servidor, sem prefixo `VITE_`. A configuração de build já está em `netlify.toml`.

Antes de habilitar o envio de dados reais, verifique as condições de tratamento e retenção da conta OpenAI da clínica, a autorização aplicável e os acessos das duas contas.

## Piloto Gemini para laudos anonimizados

O piloto fica desativado por padrão. Use PDFs fictícios ou previamente anonimizados, de até 4 MB. O sistema não anonimiza o arquivo automaticamente. Com o piloto habilitado, o Gemini é selecionado automaticamente para PDFs de até 4 MB. Antes do envio, o app pede confirmação de que o PDF foi anonimizado. Cancelar usa apenas a leitura local. Para dados reais, avalie previamente as condições de tratamento e retenção do serviço.

No Netlify, configure `VITE_MOOV_GEMINI_PILOT=true` para o build e, somente no ambiente das funções, `MOOV_ENABLE_GEMINI_PILOT=true` e `GEMINI_API_KEY`. As funções também usam `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Opcionalmente defina `GEMINI_EXAM_MODEL`; o padrão é `gemini-2.5-flash`. Use um modelo habilitado na sua conta que aceite PDF e saída estruturada. Em desenvolvimento, use `npx netlify-cli dev` com as variáveis no ambiente correspondente. Nunca use prefixo `VITE_` para a chave.

Com a sessão da equipe aberta, selecione **Exames → Incluir exame**, escolha Laboratorial ou Ultrassom e clique em **Salvar anexo**. Confirme a anonimização para iniciar a leitura com Gemini. Se o Gemini falhar, o app tenta a leitura local e avisa ao salvar. Imagens e PDFs acima de 4 MB não são enviados ao Gemini. O piloto é aplicado a novos anexos e não reprocessa os já conferidos.

Os resultados sugeridos incluem página, trecho de origem e data da coleta quando identificados. O histórico fica separado. A classificação laboratorial só recebe cor após salvar a conferência e quando o modelo indicar referência aplicável, unidade compatível e coleta atual com fonte identificada. Saídas ambíguas continuam em revisão. Em ultrassom, a IA extrai trechos e a equipe confere a classificação. Compare nome, valor, unidade, data, referência e página com o original. Teste separadamente casos qualitativos, sinais de desigualdade, hemogramas, históricos e PDFs digitalizados. 
