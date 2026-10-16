[🇺🇸 English](README.md) | [🇧🇷 Português](README.pt-BR.md)

# Seanime Providers (pt-BR) 🇧🇷

This repository contains an official collection of Brazilian and Portuguese extensions (Providers) for the [Seanime](https://github.com/5rahim/seanime) application.

## 📦 How to install extensions in Seanime

To install any of the extensions from this repository, simply add our **Marketplace** URL in your Seanime settings:

1. Open Seanime.
2. Go to **Settings** > **Extensions**.
3. Add the following URL to the extension repository field:
   ```text
   https://raw.githubusercontent.com/Jhoorodre/seanime-provider/master/marketplace.json
   ```
4. Browse the available extensions and click install!

---

## 🌐 Community Marketplace

Beyond this repository, the community maintains an unofficial marketplace with a web interface to discover and install extensions from multiple sources:

- **Site:** [bas1874.github.io/Seanime-Marketplace](https://bas1874.github.io/Seanime-Marketplace/)
- **Repository:** [github.com/Bas1874/Seanime-Marketplace](https://github.com/Bas1874/Seanime-Marketplace)

---

## 🏗️ Repository Structure

- `src/` - Contains the source code (`.ts`) and manifests (`.json`) for all locally developed extensions.
- `icon/` - PNG images (icons) used by the extensions in the Marketplace.
- `doc/` - Official Seanime API documentation to help with the development of new providers.
- `playground/` - Client that runs the providers through Seanime's real Playground (plus a local simulator and the AniList IDs used by the tests).
- `external_sources/` - Read-only snapshots (`src/all` and `src/pt`) of third-party Tachiyomi/Aniyomi extension repos, used only as reference for site logic.
- `.github/workflows/` - CI/CD Automations (Testing, Validation, and Deployment).
- `marketplace.json` - The global extension registry. Every extension present in `src/` **must** be registered here, alongside external community providers.

---

## 🤖 CI/CD and Automations (GitHub Actions)

This repository features a complete Continuous Integration infrastructure to streamline development:

1. **Automatic Validation (`deploy.yml`)**
   Whenever a `git push` or `Pull Request` is created, GitHub Actions will automatically validate all extensions inside `src/`. It checks the JSON structure, ensures the provider class is exported in TypeScript, and cross-references the extension with `marketplace.json`.
   *(Extensions marked with `"isDevelopment": true` in the manifest will receive a 🚧 In Dev tag).*

2. **Dynamic Version Updater (`version-bump.yml`)**
   To update an extension's version, you do not need to edit the JSON manually.
   - Go to the **Actions** tab.
   - Select **Auto Version Bump**.
   - Type the extension's folder name (e.g., `darkmahou`) and select the bump type (`patch`, `minor`, or `major`).
   The bot will automatically commit, create a Release Tag, and push the changes.

---

## 🛠️ Local Tools & Scripts

To make development easier, this repository includes local scripts to automate repetitive tasks directly from your terminal:

1. **Create New Provider (`./create-provider.sh`)**
   Interactive script with two modes:
   - **Create local provider** — scaffolds the folder, TypeScript boilerplate, JSON manifest, and registers it in `marketplace.json` as "In Development".
   - **Add external provider** — paste the raw URL of a third-party manifest and it will be fetched, validated, and inserted into `marketplace.json` with an immediate push to GitHub.
   ```bash
   ./create-provider.sh
   ```

2. **Local Version Bump & Promotion (`./bump.sh`)**
   Quickly bump an extension's version, commit, tag, and push directly from your terminal. If the extension is marked as "In Development", the script will interactively ask if you want to promote it to **Production** (which automatically cleans up development flags from the manifests and updates the `ROADMAP.md` status).
   ```bash
   ./bump.sh <folder_name> [patch|minor|major]
   # Example: ./bump.sh darkmahou patch
   ```

3. **Test Providers in Seanime's real Playground (`./playground/run.sh`)**
   Sends each provider's code to the **real Playground endpoint** of your running Seanime server
   (`POST /api/v1/extensions/playground/run`), so the engine (goja), `fetch`, `LoadDoc`, AniList data
   and best-match selection are exactly what `Extensions > Playground` produces. It reads the server
   port and password from `~/.config/Seanime/config.toml` (or `SEANIME_URL` / `SEANIME_PASSWORD`),
   runs the whole chain per provider (search → episodes/chapters → server/pages, or the torrent
   methods) and prints, for every function, the `Inputs`, `Logs` and `Value` the Playground returned,
   followed by a one-line-per-provider summary. Requires [bun](https://bun.sh) and a running Seanime.
   ```bash
   ./playground/run.sh anime                        # every anime provider (onlinestream + torrent)
   ./playground/run.sh manga --anilist-id 105398    # every manga provider with one AniList ID
   ./playground/run.sh animestokyo                  # one provider, AniList ID from playground/anilist-ids.json
   ./playground/run.sh animestokyo goyabu --full    # print whole Values (default: first 40 lines)
   ./playground/run.sh goyabu --anilist-id 180136 --method search --args '{"dub":false}'   # a single function
   ./playground/run.sh anime --jobs 2 --timeout 180 # 4 providers at a time and 120 s per call by default
   ./playground/run.sh --sim anitube                # older local simulator, no Seanime server needed
   ```
   Results per provider: `OK`; `FAIL` (a function threw, a list came back empty — `findEpisodes`,
   `findChapters` or `findChapterPages` must return everything — or the search itself failed, e.g.
   timeout/502); `NO_MATCH` (the search worked but nothing matches the AniList titles: the site lacks the
   title, or the provider doesn't expose the site's alternative names as `synonyms`); `SKIP` (no AniList ID
   or missing credentials). Exits 1 only on `FAIL`.

   Each provider needs a known-good AniList ID in `playground/anilist-ids.json` (a title you've confirmed
   exists on that site). An entry can also be `{"anilist": N, "siteId": "..."}` to pin the provider's own ID
   and skip the auto-match.

   Login-gated providers (kuromangas, mediocrescan, sakuramangas, tomato) are skipped unless
   `TEST_<SLUG>_<FIELD>` env vars (e.g. `TEST_KUROMANGAS_EMAIL`) are set, for instance in `playground/.env`
   — field names come from the provider's manifest `userConfig.fields`.

---

## 📖 Developer Documentation

If you are developing new extensions or improving existing ones, refer to the official Seanime API documentation available in the `doc/` folder:

- [Anime Torrent Provider API](./doc/Anime%20Torrent%20Provider.md)
- [Manga Provider API](./doc/Manga%20Provider.md)
- [Online Streaming Provider API](./doc/Online%20Streaming%20Provider.md)
- [Custom Source API](./doc/Custom%20Source.md)
- [Write, test, share](./doc/Write,%20test,%20share.md)

Things the Seanime runtime does that differ from Node/browser (all verified in the real Playground):

- No `setTimeout`/`setInterval`: wait with `await $sleep(ms)`.
- `fetch` responses keep only the first value of each header; all cookies are in `res.cookies` and all raw headers in `res.rawHeaders`. There is no `res.clone()` and no `.catch()` on promises.
- An episode `number` must be an integer: a single `7.5` episode makes the whole `findEpisodes` call fail, so drop decimals.
- Seanime calls `search` once per title/synonym of the media, back to back — space the requests out if the site rate-limits (HTTP 429).

---

## 📚 Roadmap & Contributing

Check the [ROADMAP.md](./ROADMAP.md) file to see the status of each provider, which extensions are in development, and which are blocked/deprecated.

Feel free to open Pull Requests with improvements, new providers, or bug fixes!
