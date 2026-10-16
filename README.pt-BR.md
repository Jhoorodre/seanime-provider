[🇺🇸 English](README.md) | [🇧🇷 Português](README.pt-BR.md)

# Seanime Providers (pt-BR) 🇧🇷

Este repositório contém uma coleção oficial de extensões (Providers) Brasileiros e em Português para o aplicativo [Seanime](https://github.com/5rahim/seanime). 

## 📦 Como instalar as extensões no Seanime

Para instalar qualquer uma das extensões deste repositório, basta adicionar o endereço do nosso **Marketplace** nas configurações do seu Seanime:

1. Abra o Seanime.
2. Vá em **Settings** > **Extensions**.
3. Adicione a seguinte URL no campo de repositório de extensões:
   ```text
   https://raw.githubusercontent.com/Jhoorodre/seanime-provider/master/marketplace.json
   ```
4. Navegue pelas extensões disponíveis e clique em instalar!

---

## 🌐 Marketplace da Comunidade

Além deste repositório, a comunidade mantém um marketplace não-oficial com uma interface web para descobrir e instalar extensões de diversas fontes:

- **Site:** [bas1874.github.io/Seanime-Marketplace](https://bas1874.github.io/Seanime-Marketplace/)
- **Repositório:** [github.com/Bas1874/Seanime-Marketplace](https://github.com/Bas1874/Seanime-Marketplace)

---

## 🏗️ Estrutura do Repositório

- `src/` - Contém o código-fonte (`.ts`) e os manifestos (`.json`) de todas as extensões desenvolvidas localmente.
- `icon/` - Imagens PNG (ícones) utilizadas pelas extensões no Marketplace.
- `doc/` - Documentação oficial da API do Seanime para ajudar no desenvolvimento de novos provedores.
- `playground/` - Cliente que roda os providers no Playground real do Seanime (mais um simulador local e os IDs do AniList usados nos testes).
- `external_sources/` - Cópias somente leitura (`src/all` e `src/pt`) de repositórios de extensões Tachiyomi/Aniyomi de terceiros, usadas só como referência da lógica dos sites.
- `.github/workflows/` - Automações de CI/CD (Testes, Validação e Deploy).
- `marketplace.json` - O registro global de extensões. Toda extensão presente em `src/` **deve** estar registrada aqui, além de provedores externos da comunidade.

---

## 🤖 CI/CD e Automações (GitHub Actions)

Este repositório possui uma infraestrutura completa de Integração Contínua para facilitar o desenvolvimento:

1. **Validação Automática (`deploy.yml`)**
   Sempre que um `git push` ou `Pull Request` for criado, o GitHub Actions irá validar automaticamente todas as extensões dentro de `src/`. Ele verifica a estrutura do JSON, garante que a classe do provedor foi exportada no TypeScript e checa se a extensão foi listada no `marketplace.json`. 
   *(Extensões marcadas com `"isDevelopment": true` no manifesto receberão a tag 🚧 In Dev).*

2. **Atualizador Dinâmico de Versões (`version-bump.yml`)**
   Para atualizar a versão de uma extensão, não é necessário editar o JSON manualmente. 
   - Vá na aba **Actions**.
   - Selecione **Auto Version Bump**.
   - Digite o nome da pasta da extensão (ex: `darkmahou`) e selecione o tipo de bump (`patch`, `minor` ou `major`). 
   O robô fará o commit, criará uma Tag de Release e fará o push automaticamente.

---

## 🛠️ Ferramentas & Scripts Locais

Para facilitar o desenvolvimento na sua máquina, este repositório conta com scripts locais que automatizam processos chatos:

1. **Criador Automático de Provedor (`./create-provider.sh`)**
   Script interativo com dois modos:
   - **Criar novo provider local** — gera a pasta, o código TypeScript inicial, o JSON do manifesto e registra automaticamente no `marketplace.json` como "Em Desenvolvimento".
   - **Adicionar provider externo** — cole a URL raw do manifesto de um provider de terceiros e ele será buscado, validado e inserido no `marketplace.json` automaticamente, com push imediato para o GitHub.
   ```bash
   ./create-provider.sh
   ```

2. **Bump de Versão e Promoção (`./bump.sh`)**
   Sobe a versão de uma extensão, faz o commit, gera a Tag e envia pro GitHub direto do seu terminal. Além disso, se a extensão estiver "Em Desenvolvimento", o script perguntará de forma interativa se você deseja promovê-la para **Produção** (o que remove as flags de dev dos JSONs e atualiza o seu status no `ROADMAP.md` de forma totalmente automática).
   ```bash
   ./bump.sh <nome_da_pasta> [patch|minor|major]
   # Exemplo: ./bump.sh darkmahou patch
   ```

3. **Testar Providers no Playground real do Seanime (`./playground/run.sh`)**
   Envia o código de cada provider para o **endpoint real do Playground** do seu Seanime em execução
   (`POST /api/v1/extensions/playground/run`), então o motor (goja), o `fetch`, o `LoadDoc`, os dados do
   AniList e a escolha do melhor resultado são exatamente os de `Extensions > Playground`. Ele lê a porta e
   a senha do servidor em `~/.config/Seanime/config.toml` (ou `SEANIME_URL` / `SEANIME_PASSWORD`), roda a
   cadeia inteira por provider (busca → episódios/capítulos → servidor/páginas, ou os métodos de torrent) e
   imprime, para cada função, os `Inputs`, `Logs` e `Value` que o Playground devolveu, seguidos de um
   resumo de uma linha por provider. Requer [bun](https://bun.sh) e um Seanime rodando.
   ```bash
   ./playground/run.sh anime                        # todos os providers de anime (streaming + torrent)
   ./playground/run.sh manga --anilist-id 105398    # todos os providers de manga com um ID do AniList
   ./playground/run.sh animestokyo                  # um provider, ID do playground/anilist-ids.json
   ./playground/run.sh animestokyo goyabu --full    # Value completo (padrão: 40 primeiras linhas)
   ./playground/run.sh goyabu --anilist-id 180136 --method search --args '{"dub":false}'   # uma função só
   ./playground/run.sh anime --jobs 2 --timeout 180 # padrão: 4 providers por vez e 120 s por chamada
   ./playground/run.sh --sim anitube                # simulador local antigo, sem servidor Seanime
   ```
   Resultado por provider: `OK`; `FAIL` (uma função falhou, uma lista veio vazia — `findEpisodes`,
   `findChapters` e `findChapterPages` precisam devolver tudo — ou a própria busca falhou, por exemplo
   timeout/502); `NO_MATCH` (a busca funcionou, mas nada casa com os títulos do AniList: o site não tem a
   obra, ou o provider não expõe os nomes alternativos do site como `synonyms`); `SKIP` (sem ID do AniList
   ou sem credenciais). Só `FAIL` retorna código de saída 1.

   Cada provider precisa de um ID do AniList em `playground/anilist-ids.json` (um título que você já
   confirmou que existe naquele site). A entrada também pode ser `{"anilist": N, "siteId": "..."}` para
   fixar o ID do próprio provider e pular o auto-match.

   Providers que exigem login (kuromangas, mediocrescan, sakuramangas, tomato) são pulados a menos que as
   variáveis `TEST_<SLUG>_<CAMPO>` (ex: `TEST_KUROMANGAS_EMAIL`) estejam definidas, por exemplo em
   `playground/.env` — os nomes dos campos vêm do `userConfig.fields` do manifesto.

---

## 📖 Documentação para Desenvolvedores

Se você está criando novas extensões ou melhorando as que já existem, consulte a documentação oficial da API do Seanime que mantemos na pasta `doc/`:

- [API de Provedor de Anime Torrent](./doc/Anime%20Torrent%20Provider.md)
- [API de Provedor de Mangá](./doc/Manga%20Provider.md)
- [API de Provedor de Streaming Online](./doc/Online%20Streaming%20Provider.md)
- [API de Fonte Customizada](./doc/Custom%20Source.md)
- [Escrever, testar e compartilhar](./doc/Write,%20test,%20share.md)

O que o runtime do Seanime faz diferente de Node/navegador (tudo verificado no Playground real):

- Não existe `setTimeout`/`setInterval`: espere com `await $sleep(ms)`.
- O `fetch` guarda só o primeiro valor de cada header; todos os cookies ficam em `res.cookies` e todos os headers brutos em `res.rawHeaders`. Não há `res.clone()` nem `.catch()` em promises.
- O `number` de um episódio precisa ser inteiro: um único episódio `7.5` derruba a chamada inteira de `findEpisodes`, então descarte os decimais.
- O Seanime chama `search` uma vez por título/sinônimo da mídia, em sequência — espace as requisições se o site limita o ritmo (HTTP 429).

---

## 📚 Roadmap & Contribuição

Confira o arquivo [ROADMAP.md](./ROADMAP.md) para ver o status de cada provedor, quais extensões estão em desenvolvimento e quais estão bloqueadas/depreciadas.

Sinta-se livre para abrir Pull Requests com melhorias, novos provedores ou correções!
