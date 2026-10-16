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

- [x] **Tomato** ([`src/tomato`](./src/tomato))

- [x] **Anitube (PT-BR)** ([`src/anitube`](./src/anitube))

- [x] **Animes Tokyo** ([`src/animestokyo`](./src/animestokyo))

- [x] **Top Animes** ([`src/topanimes`](./src/topanimes))

- [x] **Animes Digital** ([`src/animesdigital`](./src/animesdigital))

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
  - *Status:* In development. On 2026-10-16 `getLatest` failed in Seanime's Playground (`downloadCount` arrives as a string, Seanime expects an int).

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

## Known Issues

Checked with `./playground/run.sh` against Seanime 3.10.4 on 2026-10-16. These come from the sites, not from a divergence from the reference extensions, and were seen from a single server/IP, so they may not reproduce elsewhere.

- **Goyabu** ([`src/goyabu`](./src/goyabu)) — `goyabu.io` answers HTTP 403 with a Cloudflare challenge ("Just a moment...") when called from the Seanime server, so searches return nothing. The code is identical to the Awerkori reference.
- **Animes Tokyo** ([`src/animestokyo`](./src/animestokyo)) — `animes.tokyo` answered HTTP 522 (origin not responding) on all requests.
- **Nexus Toons** ([`src/nexustoons`](./src/nexustoons)) — works, but a title the site lists with 0 chapters (e.g. Solo Leveling) returns an empty list, and a very large catalog is slow (3862 chapters took about 112 s).
- **Mediocre Scan** ([`src/mediocrescan`](./src/mediocrescan)) — the site rate-limits (HTTP 429) while Seanime fires one search per title; spacing between calls and a retry on 429 shipped in v1.0.9. Some titles are only on the site under a different edition (e.g. Solo Leveling matches a 111-chapter entry while AniList lists 201 chapters).
