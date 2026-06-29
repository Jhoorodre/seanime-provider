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

## 🏗️ Repository Structure

- `src/` - Contains the source code (`.ts`) and manifests (`.json`) for all locally developed extensions.
- `icon/` - PNG images (icons) used by the extensions in the Marketplace.
- `doc/` - Official Seanime API documentation to help with the development of new providers.
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

---

## 📖 Developer Documentation

If you are developing new extensions or improving existing ones, refer to the official Seanime API documentation available in the `doc/` folder:

- [Anime Torrent Provider API](./doc/Anime%20Torrent%20Provider.md)
- [Manga Provider API](./doc/Manga%20Provider.md)
- [Online Streaming Provider API](./doc/Online%20Streaming%20Provider.md)
- [Custom Source API](./doc/Custom%20Source.md)
- [Write, test, share](./doc/Write,%20test,%20share.md)

---

## 📚 Roadmap & Contributing

Check the [ROADMAP.md](./ROADMAP.md) file to see the status of each provider, which extensions are in development, and which are blocked/deprecated.

Feel free to open Pull Requests with improvements, new providers, or bug fixes!
