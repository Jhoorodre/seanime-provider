/// <reference path="../anime-torrent-provider.d.ts" />

class Provider {
    private apiUrl = "https://torrentclaw.com/api/v1"
    
    // User-defined configuration from Seanime
    private apiKey = "{{apiKey}}"
    private audioLang = "{{audioLang}}"
    private subsLang = "{{subsLang}}"
    private verifiedOnly = "{{verifiedOnly}}" === "true"

    getSettings(): AnimeProviderSettings {
        return {
            canSmartSearch: true,
            smartSearchFilters: ["resolution", "query", "bestReleases"],
            supportsAdult: false,
            type: "main",
        }
    }

    async search(opts: AnimeSearchOptions): Promise<AnimeTorrent[]> {
        const title = opts.query || opts.media.romajiTitle || opts.media.englishTitle
        if (!title) return []

        let query = `/search?q=${encodeURIComponent(title)}&limit=50`
        if (opts.media.format === "MOVIE") {
            query += `&type=movie`
        } else if (opts.media.format?.startsWith("TV") || opts.media.format === "OVA" || opts.media.format === "ONA") {
            query += `&type=show`
        }

        return this.fetchTorrents(query)
    }

    async smartSearch(opts: AnimeSmartSearchOptions): Promise<AnimeTorrent[]> {
        const title = opts.query || opts.media.romajiTitle || opts.media.englishTitle
        if (!title) return []

        let query = `/search?q=${encodeURIComponent(title)}&limit=50`

        if (opts.media.format === "MOVIE") {
            query += `&type=movie`
        } else if (opts.media.format?.startsWith("TV") || opts.media.format === "OVA" || opts.media.format === "ONA") {
            query += `&type=show`
        }

        if (opts.resolution) {
            query += `&quality=${encodeURIComponent(this.formatQuality(opts.resolution))}`
        }

        let torrents = await this.fetchTorrents(query)

        if (opts.batch) {
            torrents = torrents.filter(t => t.episodeNumber === -1 || t.isBatch)
        } else if (opts.episodeNumber > 0) {
            torrents = torrents.filter(t => t.episodeNumber === opts.episodeNumber || t.episodeNumber === -1)
        }

        // Ordenar os resultados por Seeders de forma decrescente para facilitar
        torrents.sort((a, b) => b.seeders - a.seeders)

        if (opts.bestReleases) {
            // Procura o torrent com mais seeders correspondente ao episódio exato
            const bestSingle = torrents.find(t => t.episodeNumber === opts.episodeNumber)
            if (bestSingle) {
                bestSingle.isBestRelease = true
            } else if (torrents.length > 0) {
                // Se não achar o episódio exato, marca a melhor temporada completa (batch)
                torrents[0].isBestRelease = true
            }
        }

        return torrents
    }

    async getTorrentInfoHash(torrent: AnimeTorrent): Promise<string> {
        return torrent.infoHash || ""
    }

    async getTorrentMagnetLink(torrent: AnimeTorrent): Promise<string> {
        return torrent.magnetLink || ""
    }

    async getLatest(): Promise<AnimeTorrent[]> {
        // O TorrentClaw é focado em buscas. O método getLatest() é opcional 
        // e costuma ser usado para feeds estilo Nyaa (Página Inicial do Seanime).
        return []
    }

    private async fetchTorrents(url: string): Promise<AnimeTorrent[]> {
        let furl = `${this.apiUrl}${url}`

        // Appending user config parameters manually
        if (this.apiKey && !this.apiKey.startsWith("{{")) {
            furl += `&api_key=${encodeURIComponent(this.apiKey)}`
        }
        if (this.audioLang && !this.audioLang.startsWith("{{")) {
            furl += `&lang=${encodeURIComponent(this.audioLang)}`
        }
        if (this.subsLang && !this.subsLang.startsWith("{{")) {
            furl += `&subs=${encodeURIComponent(this.subsLang)}`
        }
        if (this.verifiedOnly) {
            furl += `&verified=true`
        }

        // Forçar para que traga apenas Animes/Animações (evita live-actions americanos ou novelas)
        furl += `&genre=Animation`

        try {
            const response = await fetch(furl)

            if (!response.ok) {
                throw new Error(`Failed to fetch torrents, status: ${response.status}`)
            }

            const data = await response.json()
            if (!data.results) return []

            const animeTorrents: AnimeTorrent[] = []

            for (const result of data.results) {
                if (result.torrents && Array.isArray(result.torrents)) {
                    for (const t of result.torrents) {
                        animeTorrents.push(this.toAnimeTorrent(t))
                    }
                }
            }

            return animeTorrents
        }
        catch (error) {
            throw new Error(`Error fetching torrents: ${error}`)
        }
    }

    private formatQuality(quality: string): string {
        const q = quality.replace(/p$/, "")
        if (["480", "720", "1080", "2160"].includes(q)) {
            return q + "p"
        }
        return ""
    }

    private toAnimeTorrent(torrent: any): AnimeTorrent {
        let size = 0
        if (torrent.sizeBytes) {
            size = parseInt(torrent.sizeBytes, 10)
        }

        return {
            name: torrent.rawTitle,
            date: torrent.uploadedAt || new Date().toISOString(),
            size: size,
            formattedSize: "",
            seeders: torrent.seeders || 0,
            leechers: torrent.leechers || 0,
            downloadCount: 0,
            link: torrent.torrentUrl || "",
            downloadUrl: torrent.torrentUrl || "",
            magnetLink: torrent.magnetUrl || "",
            infoHash: torrent.infoHash || "",
            resolution: torrent.quality || "",
            isBatch: false,
            episodeNumber: torrent.episode !== undefined && torrent.episode !== null ? torrent.episode : -1,
            releaseGroup: torrent.releaseGroup || "",
            isBestRelease: false,
            confirmed: true,
        }
    }
}
