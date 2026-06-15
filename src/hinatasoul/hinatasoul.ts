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

        const match = html.match(/foodiesbrazil\.info\/filez5\.php\?t=([^"'\s]+)/i)
        if (!match) return result
        
        const token = match[1]
        console.log("HinataSoul token:", token.substring(0, 20) + "...")
        const coemReq = await fetch(`https://www.coempregos.com.br/?token=${token}`, { headers: this.headers })
        const coemHtml = await coemReq.text()
        console.log("coempregos HTML length:", coemHtml.length)
        
        const urlMatch = coemHtml.match(/url=([^&"']+)/i)
        if (!urlMatch) {
            console.log("Failed to match URL in coempregos HTML. Snippet:", coemHtml.substring(0, 200))
            return result
        }
        
        let baseR2Url = decodeURIComponent(urlMatch[1])
        console.log("Base R2 URL:", baseR2Url)
        
        const qualities = ["appsd", "apphd", "fful"]
        const labels = ["480p", "720p", "1080p"]
        
        const sources = await Promise.all(qualities.map(async (q, i) => {
            try {
                const vidUrl = baseR2Url.replace(/\/(fiphonec|appsd|apphd|fful|iphonec)\//i, `/${q}/`)
                const getApiUrl = `https://ads.animeyabu.net/adblock2.php?token=undefined&url=${encodeURIComponent(vidUrl)}`
                
                console.log(`Fetching signature for ${q}...`)
                const getReq = await fetch(getApiUrl, {
                    headers: { 
                        'Referer': 'https://www.anitube22.vip/',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                    }
                })
                
                const responseText = await getReq.text()
                console.log(`AnimeYabu response for ${q}:`, responseText.substring(0, 100))
                
                const getJson = JSON.parse(responseText)
                const signature = getJson[0]?.publicidade
                
                if (signature && signature !== "undefined") {
                    console.log(`Successfully obtained signature for ${q}`)
                    return {
                        url: vidUrl + signature,
                        quality: labels[i],
                        type: "mp4"
                    }
                }
            } catch (e) {
                console.log(`Error processing ${q}:`, e)
            }
            return null
        }))
        
        result.videoSources = sources.filter(s => s !== null) as VideoSource[]
        result.videoSources.reverse()

        return result
    }
}
