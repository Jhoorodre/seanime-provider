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
            episodeServers: ["HinataSoul"],
            supportsDub: true
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

        // Seanime expects episodes in ascending order — sort explicitly rather
        // than assuming DOM order (which was actually already descending).
        return results.sort((a, b) => a.number - b.number)
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

        // Same backend as animeyabu.org (identical episode IDs, same Disqus
        // shortname). Each quality tab (SD/HD/FULLHD) links its own
        // fatshark.xyz token. The ad-gate chain rotates both the entry
        // filename (anf.php, filez5.php, ...) and the intermediate hop names
        // (data3.php, data5.php, data15.php, ...) frequently, so instead of
        // hardcoding hop names we follow <meta http-equiv="refresh"> chains
        // generically until we land on the page whose <iframe> query string
        // embeds the raw R2 video url — mirroring the real Anitube Kotlin
        // extractor's fetchPlayerInfo() recursion.
        //   fatshark.xyz/*.php?t=TOKEN -> ...meta-refresh hops... -> page with
        //   <iframe src="...?url=<raw R2 url>">
        //   -> ads.animeyabu.net/adblock2.php?url=<raw R2 url> -> {publicidade: "?...signed params"}
        //   final video URL = raw R2 url + publicidade
        const tokenMatches = [...html.matchAll(/https:\/\/fatshark\.xyz\/[a-z0-9_]+\.php\?t=[^"'\s]+/ig)]
        if (tokenMatches.length === 0) return result

        const startUrls = [...new Set(tokenMatches.map(m => m[0]))]
        const sources: VideoSource[] = []

        for (const startUrl of startUrls) {
            try {
                const fetchHeaders = {
                    "referer": "https://www.hinatasoul.com",
                    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                }

                const finalHtml = await this.resolveMetaRefreshChain(startUrl, fetchHeaders)

                const rawUrlMatch = finalHtml.match(/url=(https:\/\/[^"'&\s]+\.r2\.cloudflarestorage\.com[^"'&\s]+)/i)
                if (!rawUrlMatch) continue
                const rawVidUrl = decodeURIComponent(rawUrlMatch[1])

                let quality = "auto"
                if (rawVidUrl.includes("ful/")) quality = "1080p"
                else if (rawVidUrl.includes("/apphd/") || rawVidUrl.includes("333/")) quality = "720p"
                else if (rawVidUrl.includes("/appsd/") || rawVidUrl.includes("iphonec/")) quality = "480p"

                const sigReq = await this.fetchWithRetry(`https://ads.animeyabu.net/adblock2.php?token=undefined&url=${encodeURIComponent(rawVidUrl)}`, {
                    headers: { "referer": "https://www.anitube.vip/", "user-agent": fetchHeaders["user-agent"] }
                })
                const sigJson = await sigReq.json()
                const signature = sigJson?.[0]?.publicidade
                if (!signature || signature === "undefined") continue

                const finalUrl = rawVidUrl + signature
                sources.push({
                    url: finalUrl,
                    quality,
                    type: finalUrl.includes(".m3u8") ? "m3u8" : "mp4",
                    subtitles: []
                } as VideoSource)
            } catch (e) {
                console.error("Falha ao extrair player HinataSoul", e)
            }
        }

        result.videoSources = sources

        const qualityMap: Record<string, number> = { "1080p": 1080, "720p": 720, "480p": 480, "auto": 0 }
        result.videoSources.sort((a, b) => (qualityMap[b.quality] ?? 0) - (qualityMap[a.quality] ?? 0))

        return result
    }

    // Follows <meta http-equiv="refresh" content="0; url=..."> redirects
    // (used by the fatshark.xyz/rs12fbv.lol/coempregos.com.br ad-gate chain)
    // until it lands on a page with no further meta-refresh, returning that
    // page's HTML. Bounded to avoid infinite loops if the chain ever cycles.
    private async resolveMetaRefreshChain(startUrl: string, headers: Record<string, string>, maxHops: number = 5): Promise<string> {
        let currentUrl = startUrl
        let referer = headers["referer"]
        for (let i = 0; i < maxHops; i++) {
            const resp = await this.fetchWithRetry(currentUrl, { headers: { ...headers, referer } })
            const body = await resp.text()
            const meta = body.match(/<meta\s+http-equiv=["']refresh["']\s+content=["']0;\s*url=([^"']+)["']/i)
            if (!meta) return body
            referer = currentUrl
            currentUrl = meta[1]
        }
        throw "Muitos redirecionamentos ao resolver o player"
    }

    // The ad-redirect domains (fatshark.xyz, rs12fbv.lol, dattebayo-br.com) are
    // disposable ad-tech infrastructure that rotates/drops connections
    // intermittently for everyone, not just this sandbox — confirmed via
    // real Seanime logs showing the same "no route to host" on a residential
    // network. A short retry gives it a chance to recover.
    private async fetchWithRetry(url: string, init: any, retries: number = 2): Promise<Response> {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await fetch(url, init)
            } catch (e) {
                if (attempt === retries) throw e
                await new Promise(resolve => setTimeout(resolve, 1500))
            }
        }
        throw new Error("unreachable")
    }
}
