# Seanime Providers

Este repositório contém uma coleção de provedores (extensões) do Seanime para vários sites brasileiros de anime e mangá. Estes provedores são escritos em TypeScript puro e seguem a arquitetura de extensão do Seanime.

> **Importante:** Comunique-se com o usuário **apenas em Português (PT-BR)**.

## Status do MCP
O MCP das Extensões do Seanime foi configurado e conectado com sucesso usando o transporte HTTP:
`✓ seanime-mcp: https://seanime.gitbook.io/seanime-extensions/~gitbook/mcp (http) - Conectado`

**Próximo passo para você:**
Como minha sessão atual foi iniciada antes deste MCP ser adicionado, eu ainda não tenho as novas ferramentas no meu contexto. Para habilitá-las:
1. Digite `/mcp reload` neste chat.
2. Se isso não funcionar, **reinicie a sessão**.

Uma vez recarregado, poderei usar as ferramentas do MCP Seanime para te ajudar com os provedores!

## Project Overview

The project serves as a host for multiple Seanime providers, categorized by media type:
- **Torrents**: DarkMahou (`src/darkmahou`)
- **Online Streaming**: AnimesROLL (`src/animesroll`), Q1N (`src/q1n`)
- **Manga**: MangaLivre (`src/mangalivre.tv`)

Each provider consists of:
1.  **Logic File**: A `.ts` file containing the `Provider` class implementation.
2.  **Manifest File**: A `.json` file containing metadata and configuration.

### Technologies
- **TypeScript**: Used for provider logic. Note that these files are intended to be executed in a Seanime-compatible environment and are not compiled within this repository.
- **JSON**: Used for extension manifests.
- **GitHub Actions**: Handles validation and automated deployment/testing.

---

## Building and Running

### Development & Testing
Since there is no build system or package manager, testing is primarily done manually or via CI.

#### Manual Site Testing
Use `curl` to verify site connectivity and search functionality:
```bash
# Test site connectivity
curl -s -I "https://darkmahou.org"

# Test search functionality
curl -s "https://darkmahou.org/?s=one+piece"
```

#### Manifest Validation
Validate the JSON manifest syntax using `jq`:
```bash
jq empty src/darkmahou/darkmahou-provider.json
```

### Deployment
Deployment is automated via GitHub Actions.
- **Push to `master`**: Triggers validation and "deployment" (making files accessible via GitHub raw URLs).
- **Version Bumping**: Triggered via `workflow_dispatch` on `version-bump.yml`.

---

## Development Conventions

### Provider Structure
Each provider must reside in its own subdirectory under `src/`.
- `src/<provider-name>/<provider-name>-provider.ts`
- `src/<provider-name>/<provider-name>-provider.json`

### Required Methods
The methods required depend on the provider type (defined in the manifest's `type` field).

#### Torrent Provider (`anime-torrent-provider`)
- `getSettings()`
- `search(opts)`
- `smartSearch(opts)`
- `getTorrentInfoHash(torrent)`
- `getTorrentMagnetLink(torrent)`
- `getLatest()`

#### Online Streaming Provider (`anime-online-streaming-provider`)
- `getSettings()`
- `search(opts)`
- `getEpisodes(id)`
- `getVideoSources(episodeId)`
- `getLatest()`

#### Manga Provider (`manga-provider`)
- `getSettings()`
- `search(opts)`
- `getChapters(id)`
- `getPages(chapterId)`
- `getLatest()`

### Implementation Details
- **Portuguese Localization**: Many providers include logic to convert English terms to Portuguese (e.g., "Season" -> "Temporada") to match Brazilian site search engines.
- **Parsing Strategy**: Use a dual approach where possible—structured DOM parsing (e.g., `LoadDoc`) as primary, and Regex as a fallback.
- **Error Handling**: Methods should return empty arrays or nulls gracefully instead of throwing unhandled exceptions.

---

## Usage in Seanime
To add a provider to Seanime, use the raw GitHub URL of its manifest file. For example:
`https://raw.githubusercontent.com/Jhoorodre/seanime-provider/master/src/darkmahou/darkmahou-provider.json`
