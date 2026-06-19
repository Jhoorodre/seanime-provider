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

- [x] **Dark Mahou** (`src/darkmahou`)

---

## In Development / Planned

- [ ] **Amigos Share Club** (`src/amigosshareclub`)
  - *Type:* Anime Torrent Provider
  - *Status:* In development (Search filter issues)

- [ ] **Brazilian Torrent Aggregator** (`src/ptbr-aggregator`)
  - *Type:* Anime Torrent Provider
  - *Status:* In production, but not yet fully available.

- [ ] **Google Drive**
  - *Type:* Online Streaming Provider
  - *Status:* In development

- [ ] **Google Drive (Index)**
  - *Type:* Online Streaming Provider
  - *Status:* In development
  
- [ ] **Cubari.moe**
  - *Type:* Manga Provider
  - *status:* in development 
  
## Deprecated

- [x] ~~**Sakura Mangas** (`src/sakuramangas`)~~
  - *Type:* Manga Provider
  - *Reference:* `https://sakuramangas.org/`
  - *Status:* ❌ BLOCKED (Cloudflare Under Attack Mode + TLS Fingerprinting makes it impossible to fetch without a real browser engine in Seanime)