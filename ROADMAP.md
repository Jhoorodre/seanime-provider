# Seanime Provider Roadmap

This document outlines the planned extensions and providers to be implemented, as well as the ones already available in the project.

## Manga Providers (pt-BR)

- [x] **Kuro Mangas** (`src/kuromangas`)
- [x] **MangaLivre.tv / ToonLivre** (`src/mangalivre.tv`)
- [x] **Mediocre Scan** (`src/mediocrescan`)
- [x] **Nexus Toons** (`src/nexustoons`)
- [x] **Manhastro** (`src/manhastro`)

## Online Streaming Providers

- [x] **AnimesOnlineCC** (`src/animesonlinecc`)
- [x] **Dattebayo BR** (`src/dattebayobr`)
- [x] **Goyabu** (`src/goyabu`)
- [x] **Hinata Soul** (`src/hinatasoul`)
- [x] **TorrentClaw** (`src/torrentclaw`)

## Anime Torrent Providers

- [x] **Amigos Share Club** (`src/amigosshareclub`)

---

## In Development / Planned

- [ ] **Brazilian Torrent Aggregator**
  - *Type:* Anime Torrent Provider
  - *Status:* In production, but not yet available.
- [ ] **Google Drive**
  - *Type:* Online Streaming Provider
  - *Reference:* `providers_source/tmp-anime-extensions/src/all/googledrive`
- [ ] **Google Drive (Index)**
  - *Type:* Online Streaming Provider
  - *Reference:* `providers_source/tmp-anime-extensions/src/all/googledriveindex`
- [ ] **Cubari.moe**
  - *Type:* Manga Provider
  
## Deprecated

- [x] ~~**Sakura Mangas** (`src/sakuramangas`)~~
  - *Type:* Manga Provider
  - *Reference:* `https://sakuramangas.org/`
  - *Status:* ❌ BLOCKED (Cloudflare Under Attack Mode + TLS Fingerprinting makes it impossible to fetch without a real browser engine in Seanime)
- [x] ~~**Dark Mahou** (`src/darkmahou`)~~
  - *Type:* Online Streaming Provider & Anime Torrent Provider