/// <reference path="../../doc/online-streaming-provider.d.ts" />
/// <reference path="../../doc/core.d.ts" />

// Tomato's official app requires login through an email/password + captcha
// flow before it hands out a Bearer token. Automating that (solving the
// captcha) is out of scope, so this provider expects the user to paste an
// already-valid Bearer token obtained from a logged-in session (e.g. from
// the official app or from the "Manual Token" field of the Kotlin
// extension), configured via the "token" userConfig field below.
class Provider {
    private token = "{{token}}"
    private baseUrl = "https://prod-api.tomatoanimes.com"

    getSettings(): Settings {
        return {
            episodeServers: ["Tomato"],
            supportsDub: true
        }
    }

    private requireToken(): string {
        if (!this.token || this.token.startsWith("{{")) {
            throw "Configure o token de autenticação da Tomato nas configurações da extensão."
        }
        return this.token
    }

    private authHeaders(token: string): Record<string, string> {
        return {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/json"
        }
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const token = this.requireToken()

        const req = await fetch("https://edge.betomato.com/v2/content/search", {
            method: "POST",
            headers: {
                ...this.authHeaders(token),
                "Content-Type": "application/json",
                "Accept": "application/json, text/plain, */*",
                "User-Agent": "okhttp/4.11.0",
                "Accept-Encoding": "gzip, deflate",
                "request-time": String(Date.now())
            },
            // The "tags" field must be omitted entirely when there's no genre
            // filter (matches the Kotlin client, which never serializes it at
            // its null default) — sending it as [] or null makes the API
            // silently return an empty result set instead of an error.
            body: JSON.stringify({
                token,
                search: opts.query,
                content_type: "anime",
                page: 0
            })
        })

        if (!req.ok) {
            throw "Falha ao buscar na Tomato (HTTP " + req.status + "). O token pode estar expirado."
        }

        const json = await req.json()
        const results: SearchResult[] = []

        for (const item of json?.result || []) {
            if (!item?.id || !item?.name) continue
            results.push({
                id: String(item.id),
                url: String(item.id),
                title: item.name,
                subOrDub: "both"
            })
        }

        return results
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        const token = this.requireToken()

        const detailsReq = await fetch(`${this.baseUrl}/v2/anime/${id}`, {
            headers: {
                ...this.authHeaders(token),
                "User-Agent": "okhttp/4.11.0",
                "Accept-Encoding": "gzip, deflate",
                "request-time": String(Date.now())
            }
        })

        if (!detailsReq.ok) {
            throw "Falha ao buscar detalhes do anime na Tomato (HTTP " + detailsReq.status + ")."
        }

        const details = await detailsReq.json()
        const seasons = (details?.anime_seasons || []).slice().sort((a: any, b: any) => (a.season_number ?? 1) - (b.season_number ?? 1))

        const results: EpisodeDetails[] = []

        for (const season of seasons) {
            const seasonNumber = season.season_number ?? 1
            const isDubbedSeason = season.season_dubbed === 1
            let page = 0

            while (true) {
                const epReq = await fetch(`${this.baseUrl}/season/${season.season_id}/episodes`, {
                    method: "POST",
                    headers: { ...this.authHeaders(token), "Content-Type": "application/json" },
                    body: JSON.stringify({ token, page, order: "ASC" })
                })
                if (!epReq.ok) break
                const epJson = await epReq.json()
                const episodes = epJson?.data || []
                if (episodes.length === 0) break

                for (const ep of episodes) {
                    const isDubbed = ep.dubbed === true || isDubbedSeason
                    const lang = isDubbed ? "Dublado" : "Legendado"
                    results.push({
                        provider: "tomato",
                        id: String(ep.ep_id),
                        number: ep.ep_number ?? 0,
                        url: String(ep.ep_id),
                        title: `T${seasonNumber} - Ep ${ep.ep_number} (${lang}) - ${ep.ep_name || ""}`.trim()
                    })
                }

                const totalCount = epJson?.episodes ?? 0
                const loadedCount = (page * 25) + episodes.length
                if (episodes.length < 25 || (totalCount > 0 && loadedCount >= totalCount)) break
                page++
            }
        }

        return results.sort((a, b) => a.number - b.number)
    }

    async findEpisodeServer(episode: EpisodeDetails | any, _server: string): Promise<EpisodeServer> {
        if (Array.isArray(episode) && episode.length > 0) episode = episode[0]
        const token = this.requireToken()

        const epId = episode.url || episode.id
        const req = await fetch(`${this.baseUrl}/v2/anime/episode/${epId}/stream`, {
            headers: this.authHeaders(token)
        })

        if (!req.ok) {
            throw "Falha ao obter o vídeo na Tomato (HTTP " + req.status + ")."
        }

        const info = await req.json()
        const streams = info?.streams || {}

        const sources: VideoSource[] = []
        const pairs: [string | undefined, string][] = [
            [streams.fhd, "1080p"],
            [streams.mhd, "720p"],
            [streams.shd, "480p"]
        ]

        for (const [url, quality] of pairs) {
            if (!url) continue
            sources.push({
                url,
                quality,
                type: url.includes(".m3u8") ? "m3u8" : "mp4",
                subtitles: []
            } as VideoSource)
        }

        return {
            server: "Tomato",
            headers: this.authHeaders(token),
            videoSources: sources
        }
    }
}
