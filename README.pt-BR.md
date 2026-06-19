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

## 🏗️ Estrutura do Repositório

- `src/` - Contém o código-fonte (`.ts`) e os manifestos (`.json`) de todas as extensões desenvolvidas localmente.
- `icon/` - Imagens PNG (ícones) utilizadas pelas extensões no Marketplace.
- `doc/` - Documentação oficial da API do Seanime para ajudar no desenvolvimento de novos provedores.
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
   Um script interativo que monta uma nova extensão do zero. Ele cria a pasta, gera o código TypeScript inicial, monta o JSON do manifesto, e já injeta a extensão automaticamente no `marketplace.json` com a tag "Em Desenvolvimento".
   ```bash
   ./create-provider.sh
   ```

2. **Bump de Versão Local (`./bump.sh`)**
   Sobe a versão de uma extensão, faz o commit, gera a Tag de Release e envia pro GitHub direto do seu terminal, sem precisar abrir o site.
   ```bash
   ./bump.sh <nome_da_pasta> [patch|minor|major]
   # Exemplo: ./bump.sh darkmahou patch
   ```

---

## 📚 Roadmap & Contribuição

Confira o arquivo [ROADMAP.md](./ROADMAP.md) para ver o status de cada provedor, quais extensões estão em desenvolvimento e quais estão bloqueadas/depreciadas.

Sinta-se livre para abrir Pull Requests com melhorias, novos provedores ou correções!
