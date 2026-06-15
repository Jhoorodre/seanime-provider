/// <reference path="../../doc/online-streaming-provider.d.ts" />
/// <reference path="../../doc/core.d.ts" />

class Provider {
    api = "https://www.hinatasoul.com"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Referer": this.api
    }

    getSettings(): Settings {
        return {
            episodeServers: ["HinataSoul"]
        }
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const query = encodeURIComponent(opts.query)
        const req = await fetch(`${this.api}/busca?busca=${query}`, {
            headers: this.headers
        })
        const html = await req.text()
        const $ = LoadDoc(html)

        const results: SearchResult[] = []

        // Hinata Soul returns items like:
        // div.ultimosAnimesHomeItem
        //   a href="/animes/slug"
        //     img
        //     div.ultimosAnimesHomeItemInfosNome

        $("div.ultimosAnimesHomeItem a").each((_, el) => {
            const href = el.attr("href")
            const title = el.find(".ultimosAnimesHomeItemInfosNome").text() || el.attr("title")
            
            if (href && title) {
                // Hinata Soul puts the anime URL directly
                const isDub = title.toLowerCase().includes("dublado")
                if (opts.dub && !isDub) return
                if (!opts.dub && isDub) return

                let cleanTitle = title.replace(/ Dublado| Legendado/ig, "").replace(/\-\s*$/, "").trim()

                results.push({
                    id: href,
                    url: href,
                    title: cleanTitle,
                    subOrDub: isDub ? "dub" : "sub"
                })
            }
        })

        return results
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        // id is the url like "https://www.hinatasoul.com/animes/boku-no-hero-academia-dublado"
        let targetUrl = id.startsWith("http") ? id : `${this.api}${id.startsWith("/") ? "" : "/"}${id}`
        
        const req = await fetch(targetUrl, { headers: this.headers })
        const html = await req.text()
        const $ = LoadDoc(html)

        const results: EpisodeDetails[] = []

        // Se houver múltiplas páginas de episódios, o Kotlin faz um do-while com "div.mwidth > a:containsOwn(»)"
        // Por enquanto, faremos o parsing da primeira página (ou de todas se possível iterar).
        
        // As of cursedyomi, episode list selector is "div.aniContainer a"
        $("div.aniContainer a").each((_, el) => {
            const href = el.attr("href")
            let epTitle = el.attr("title") || el.text()

            if (href) {
                // Parse episode number
                // "Boku no Hero Academia - Episódio 1 - FINAL" -> 1
                // "Yomi no Tsugai ep 11" -> 11
                const match = epTitle.match(/(?:Episódio|Ep|Episode)\s*(\d+(?:\.\d+)?)/i)
                const number = match ? parseFloat(match[1]) : 0

                results.push({
                    provider: "hinatasoul",
                    id: href,
                    number: number,
                    url: href,
                    title: epTitle.trim(),
                })
            }
        })

        // Reverse to have episodes in ascending order
        return results.reverse()
    }

    async findEpisodeServer(episode: EpisodeDetails | any, _server: string): Promise<EpisodeServer> {
        if (Array.isArray(episode) && episode.length > 0) {
            episode = episode[0];
        }

        let targetUrl = episode.url || episode.id || "";
        if (!targetUrl.startsWith("http")) {
            targetUrl = `${this.api}${targetUrl.startsWith("/") ? "" : "/"}${targetUrl}`;
        }

        const req = await fetch(targetUrl, { headers: this.headers })
        const html = await req.text()
        const $ = LoadDoc(html)

        const result: EpisodeServer = {
            server: "HinataSoul",
            headers: this.headers,
            videoSources: []
        }

        // Hinata Soul specific extraction:
        // <meta itemprop="contentURL" content="https://cdn1.hinatasoul.com/apphd2/boku-no-hero-academia-7-temporada-episodio-1.mp4">
        const metaUrl = $("meta[itemprop=contentURL]").attr("content")
        
        if (metaUrl) {
            // Replicate the logic from CursedYomi
            const serverUrl = metaUrl.replace("cdn1", "cdn3")
            const parts = serverUrl.split("/")
            // e.g., ["https:", "", "cdn3.hinatasoul.com", "apphd2", "file.mp4"]
            const type = parts[3] || "apphd" 
            
            const hasFHD = html.includes("FULLHD")

            const qualities = []
            const paths = []

            qualities.push("480p")
            paths.push(type.endsWith("2") ? "appsd2" : "appsd")

            qualities.push("720p")
            paths.push(type.endsWith("2") ? "apphd2" : "apphd")

            if (hasFHD) {
                qualities.push("1080p")
                paths.push("appfullhd") // According to Kotlin, FULLHD is "appfullhd"
            }

            for (let i = 0; i < qualities.length; i++) {
                const q = qualities[i]
                const path = paths[i]
                
                // Replace the type part in the url
                const url = serverUrl.replace(`/${type}/`, `/${path}/`)

                result.videoSources.push({
                    url: url,
                    quality: q,
                    type: "mp4" // Direct mp4 files
                })
            }
        }

        // Reverse to have best qualities at the top if desired
        result.videoSources.reverse()

        return result
    }
}
