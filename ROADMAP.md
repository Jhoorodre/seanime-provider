# Seanime Provider Roadmap

This document outlines the planned extensions and providers to be implemented, as well as the ones already available in the project.

## Manga Providers (pt-BR)

- [x] **Cubari** ([`src/cubari`](./src/cubari))

- [x] **Pizzaria Scan** ([`src/pizzariascan`](./src/pizzariascan))

- [x] **Kuro Mangas** ([`src/kuromangas`](./src/kuromangas))
- [x] **MangaLivre.tv / ToonLivre** ([`src/mangalivre.tv`](./src/mangalivre.tv))
- [x] **Mediocre Scan** ([`src/mediocrescan`](./src/mediocrescan))
- [x] **Nexus Toons** ([`src/nexustoons`](./src/nexustoons))
- [x] **Manhastro** ([`src/manhastro`](./src/manhastro))

## Online Streaming Providers

- [x] **Anime Yabu** ([`src/animeyabu`](./src/animeyabu))

- [x] **AnimesOnlineCC** ([`src/animesonlinecc`](./src/animesonlinecc))
- [x] **Dattebayo BR** ([`src/dattebayobr`](./src/dattebayobr))
- [x] **Goyabu** ([`src/goyabu`](./src/goyabu))
- [x] **Hinata Soul** ([`src/hinatasoul`](./src/hinatasoul))
- [x] **TorrentClaw** ([`src/torrentclaw`](./src/torrentclaw))

## Anime Torrent Providers

- [x] **Dark Mahou** ([`src/darkmahou`](./src/darkmahou))

---

## In Development / Planned

- [ ] **Amigos Share Club** ([`src/amigosshareclub`](./src/amigosshareclub))
  - *Type:* Anime Torrent Provider
  - *Status:* In development (Search filter issues)

- [ ] **Brazilian Torrent Aggregator** ([`src/ptbr-aggregator`](./src/ptbr-aggregator))
  - *Type:* Anime Torrent Provider
  - *Status:* In production, but not yet fully available.

- [ ] **Google Drive**
  - *Type:* Online Streaming Provider
  - *Status:* In development

- [ ] **Google Drive (Index)**
  - *Type:* Online Streaming Provider
  - *Status:* In development
  
## Deprecated

- [x] ~~**Sakura Mangas** ([`src/sakuramangas`](./src/sakuramangas))~~
  - *Type:* Manga Provider
  - *Reference:* `https://sakuramangas.org/`
  - *Status:* ❌ BLOCKED (Cloudflare Under Attack Mode + TLS Fingerprinting makes it impossible to fetch without a real browser engine in Seanime)
