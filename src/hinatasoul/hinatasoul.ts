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

        const targetUrlWithCacheBuster = targetUrl.includes("?") 
            ? `${targetUrl}&_t=${Date.now()}` 
            : `${targetUrl}?_t=${Date.now()}`

        const req = await fetch(targetUrlWithCacheBuster, { headers: this.headers })
        const html = await req.text()

        const result: EpisodeServer = {
            server: "HinataSoul",
            headers: this.headers,
            videoSources: []
        }

        const tokenMatches = [...html.matchAll(/foodiesbrazil\.info\/filez5\.php\?t=([^"'\s]+)/ig)]
        if (tokenMatches.length === 0) return result
        
        // Remove duplicate tokens
        const tokens = [...new Set(tokenMatches.map(m => m[1]))]

        const sources: VideoSource[] = []
        
        for (const token of tokens) {
            try {
                const fetchHeaders = {
                    "referer": "https://www.hinatasoul.com",
                    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                }

                try {
                    await fetch(`https://foodiesbrazil.info/filez5.php?t=${token}`, { headers: fetchHeaders })
                    await fetch(`https://ondeviajar.online/data15.php?token=${token}`, { headers: fetchHeaders })
                } catch (e) {}

                const coemReq = await fetch(`https://www.coempregos.com.br/?token=${token}`, { headers: fetchHeaders })
                const coemHtml = await coemReq.text()
                
                const urlMatch = coemHtml.match(/url=([^&"']+)/i)
                if (!urlMatch) continue
                
                let vidUrl = decodeURIComponent(urlMatch[1])
                
                // Determine quality based on path
                let quality = "Unknown"
                if (vidUrl.includes("/fful/")) quality = "1080p"
                else if (vidUrl.includes("/apphd/") || vidUrl.includes("/f333/")) quality = "720p"
                else if (vidUrl.includes("/appsd/") || vidUrl.includes("/fiphonec/") || vidUrl.includes("/iphonec/")) quality = "480p"
                
                const getApiUrl = `https://ads.animeyabu.net/adblock2.php?token=undefined&url=${encodeURIComponent(vidUrl)}`
                
                const getReq = await fetch(getApiUrl, {
                    headers: { 
                        'referer': 'https://www.anitube22.vip/',
                        'user-agent': fetchHeaders['user-agent']
                    }
                })
                
                const responseText = await getReq.text()
                const getJson = JSON.parse(responseText)
                const signature = getJson[0]?.publicidade
                
                if (signature && signature !== "undefined") {
                    sources.push({
                        url: vidUrl + signature,
                        quality: quality,
                        type: "mp4"
                    } as VideoSource)
                }
            } catch (e) {}
        }
        
        result.videoSources = sources.filter(s => s !== null && s.quality !== "Unknown") as VideoSource[]
        
        // Sort by quality (1080p > 720p > 480p)
        result.videoSources.sort((a, b) => {
            const qA = parseInt(a.quality.replace("p", "")) || 0
            const qB = parseInt(b.quality.replace("p", "")) || 0
            return qB - qA
        })

        return result
    }
}
