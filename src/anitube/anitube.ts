/// <reference path="../../doc/online-streaming-provider.d.ts" />
/// <reference path="../../doc/core.d.ts" />

class Provider {
    api = "https://www.anitube.vip"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Referer": this.api
    }

    getSettings(): Settings {
        return {
            episodeServers: ["Anitube"],
            supportsDub: true
        }
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const query = encodeURIComponent(opts.query)
        const req = await fetch(`${this.api}/busca.php?s=${query}&submit=Buscar`, {
            headers: this.headers
        })
        const html = await req.text()
        const $ = LoadDoc(html)

        const results: SearchResult[] = []

        $("div.ani_loop_item").each((_, el) => {
            const href = el.find(".ani_loop_item_img > a").attr("href")
            const title = el.find(".ani_loop_item_infos_nome").text()

            if (href && title) {
                const isDub = title.toLowerCase().includes("dublado")
                if (opts.dub && !isDub) return
                if (!opts.dub && isDub) return

                const cleanTitle = title.replace(/\s*-\s*Dublado\s*$/i, "").trim()

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
        // Anitube aliases "/anime/slug" and "/anime/slug/page/1" to the same
        // content, so tracking visited page URLs doesn't prevent re-processing
        // the first page under a different URL. Dedupe by episode href instead,
        // and stop paginating once a fetch yields no new episodes.
        let targetUrl = id.startsWith("http") ? id : `${this.api}${id.startsWith("/") ? "" : "/"}${id}`
        const results: EpisodeDetails[] = []
        const seenHrefs = new Set<string>()

        for (let page = 0; page < 50; page++) {
            const req = await fetch(targetUrl, { headers: this.headers })
            const html = await req.text()
            const $ = LoadDoc(html)

            const sizeBefore = seenHrefs.size
            $("div.animepag_episodios_item > a").each((_, el) => {
                const href = el.attr("href")
                const label = el.find(".animepag_episodios_item_views").text().trim()
                if (href && label && !seenHrefs.has(href)) {
                    seenHrefs.add(href)
                    const number = parseFloat(label.split(" ").pop() || "0") || 0
                    results.push({
                        provider: "anitube",
                        id: href,
                        number,
                        url: href,
                        title: label
                    })
                }
            })

            if (seenHrefs.size === sizeBefore) break

            const nextHref = $("div.pagination a:contains(Próximo)").attr("href")
            if (!nextHref) break
            targetUrl = nextHref.startsWith("http") ? nextHref : `${this.api}${nextHref.startsWith("/") ? "" : "/"}${nextHref}`
        }

        return results.sort((a, b) => a.number - b.number)
    }

    async findEpisodeServer(episode: EpisodeDetails | any, _server: string): Promise<EpisodeServer> {
        if (Array.isArray(episode) && episode.length > 0) episode = episode[0]

        let targetUrl = episode.url || episode.id || ""
        if (!targetUrl.startsWith("http")) {
            targetUrl = `${this.api}${targetUrl.startsWith("/") ? "" : "/"}${targetUrl}`
        }

        const req = await fetch(targetUrl, { headers: this.headers })
        const html = await req.text()

        const result: EpisodeServer = {
            server: "Anitube",
            headers: this.headers,
            videoSources: []
        }

        // Same backend as animeyabu.org / hinatasoul.com (identical episode IDs).
        // The video page lists one fatshark.xyz token per player block
        // (div.vp_vc.video_container), in fixed order: SD, HD, FULLHD.
        // Same ad-gate chain: fatshark.xyz/*.php?t=TOKEN -> ...meta-refresh
        // hops... -> page with <iframe src="...?url=<raw R2 url>">
        // -> ads.animeyabu.net/adblock2.php?url=<raw R2 url> -> {publicidade: "?...signed params"}
        const orderedQualities = ["480p", "720p", "1080p"]
        const startUrls = [...new Set([...html.matchAll(/https:\/\/fatshark\.xyz\/[a-z0-9_]+\.php\?t=[^"'\s]+/ig)].map(m => m[0]))]
        if (startUrls.length === 0) return result

        const sources: VideoSource[] = []

        for (let i = 0; i < startUrls.length; i++) {
            try {
                const fetchHeaders = {
                    "referer": this.api,
                    "user-agent": this.headers["User-Agent"]
                }

                const finalHtml = await this.resolveMetaRefreshChain(startUrls[i], fetchHeaders)

                const rawUrlMatch = finalHtml.match(/url=(https:\/\/[^"'&\s]+\.r2\.cloudflarestorage\.com[^"'&\s]+)/i)
                if (!rawUrlMatch) continue
                const rawVidUrl = decodeURIComponent(rawUrlMatch[1])

                let quality = orderedQualities[i] || "auto"
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
                console.error("Falha ao extrair player Anitube", e)
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
    // intermittently for everyone, not just this sandbox. A short retry gives
    // it a chance to recover.
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
