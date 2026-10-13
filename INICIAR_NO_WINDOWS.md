# Abrir o piloto no Windows

Depois de atualizar o código, o servidor que já está aberto precisa ser recarregado. **Atualizar ST1 Academy.cmd** confere o processo exato da pasta na porta 4177 e reinicia somente essa instância. Ele reutiliza `data/academy.sqlite`, `.env` e a chave de autenticação existentes, preserva o modo informado pelo servidor e mantém o mesmo endereço. Não é um instalador nem uma recuperação de senha. A conta e a sessão continuam usando a chave anterior; ao terminar, atualize a aba existente.

Para conferir esse reinício sem executar a troca do processo, use `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Reiniciar-ST1-Academy.ps1 -ValidateOnly`.

Na pasta original da Academy, dê dois cliques em **Abrir ST1 Academy.cmd**. O iniciador confere a configuração privada existente, abre o servidor em segundo plano e só abre o navegador depois de confirmar que a Academy respondeu. Se o mesmo servidor já estiver funcionando, ele é reutilizado.

O computador precisa estar ligado. Depois de reiniciar ou desligar o Windows, abra o mesmo arquivo novamente. O iniciador não registra serviço nem início automático. O endereço local funciona neste computador; para outras pessoas acessarem, a Academy precisa de hospedagem externa.

Para conferir os requisitos sem iniciar o servidor ou modificar arquivos:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Iniciar-ST1-Academy.ps1 -ValidateOnly
```

Para iniciar sem abrir outra aba do navegador:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Iniciar-ST1-Academy.ps1
```

O iniciador usa Node.js 24.15.0 ou posterior e as dependências já instaladas. A configuração vem da `.env` privada deste piloto e precisa corresponder a `http://localhost:4177`, que é o retorno configurado para o Google. Porta, origem, pasta de dados e modo de teste herdados de outro terminal não sobrescrevem essa configuração no processo iniciado. Banco e chave de autenticação precisam existir na pasta configurada. Não são recriados usuários, senhas, convites, certificados ou credenciais Google. Se a porta estiver ocupada por outro programa ou por uma instância não identificada, o iniciador informa o problema e não encerra processos.

Os logs de inicialização e o registro do processo ficam em `logs/`, dentro da pasta privada de dados, que não é incluída no pacote de código. Eles são úteis para diagnóstico e não devem ser publicados. O arquivo de entrada aplica `ExecutionPolicy Bypass` somente ao processo que lê este script local; não altera a política permanente do Windows.

A conferência de saúde usa o endereço IPv4 local `127.0.0.1` para evitar uma demora na tentativa de IPv6 do Windows. O endereço aberto no navegador e o retorno do Google continuam sendo `http://localhost:4177`.

O iniciador remove temporariamente as variáveis operacionais herdadas pelo terminal usando o provedor de ambiente do PowerShell, lê a configuração privada do projeto e restaura as variáveis ao terminar. Esse comportamento foi conferido também no PowerShell 7, que pode conservar valores vazios quando se usa apenas SetEnvironmentVariable.
