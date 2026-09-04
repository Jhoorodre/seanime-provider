/// <reference path="../../doc/online-streaming-provider.d.ts" />
/// <reference path="../../doc/core.d.ts" />

class Provider {
    api = "https://animes.tokyo"
    headers = {
        Referer: this.api,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36"
    }

    getSettings(): Settings {
        return {
            episodeServers: ["default"],
            supportsDub: true,
        }
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const body = JSON.stringify({
            keyword: opts.query,
            query: opts.query,
            single: { paged: 1, orderby: "date", meta_key: null, order: "desc" },
            tax: [],
        })
        const req = await fetch(`${this.api}/wp-json/kiranime/v1/anime/advancedsearch?_locale=user&page=1`, {
            method: "POST",
            headers: { ...this.headers, "Content-Type": "application/json" },
            body,
        })
        const data = await req.json() as { data?: string }
        if (!data?.data) return []

        const $ = LoadDoc(data.data)
        const results: SearchResult[] = []
        $("div.w-full:has(div.kira-anime)").each((_, el) => {
            const link = el.find("h3 a")
            const href = link.attr("href")
            const title = link.find("[data-nt-title]").text()
                || link.find("[data-en-title]").text()
                || el.find("img").attr("alt")
                || ""
            const cleanTitle = title.replace(/\s+/g, " ").trim()
            if (!href || !cleanTitle) return

            const badge = el.find(".text-text-accent").text().toUpperCase()
            const hasDub = badge.includes("DUB")
            const hasSub = badge.includes("LEG") || !hasDub
            const subOrDub: SubOrDub = hasDub && hasSub ? "both" : hasDub ? "dub" : "sub"

            results.push({
                id: href.replace(this.api, ""),
                title: cleanTitle,
                url: href,
                subOrDub,
            })
        })
        return results
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        const req = await fetch(`${this.api}${id}`, { headers: this.headers })
        const html = await req.text()
        const $ = LoadDoc(html)

        const results: EpisodeDetails[] = []
        $(".swiper-episode-anime .swiper-slide > a").each((_, el) => {
            const href = el.attr("href")
            if (!href || !href.includes("/assistir/")) return

            let numberText = el.find(".w-percentile").text()
            if (!numberText) {
                const m = el.text().match(/(?:epis[oó]dio|ep)\.?\s*(\d+(?:[,.]\d+)?)/i)
                numberText = m ? m[0] : ""
            }
            const numMatch = numberText.match(/\d+(?:[,.]\d+)?/)
            if (!numMatch) return

            results.push({
                id: href.replace(this.api, ""),
                number: parseFloat(numMatch[0].replace(",", ".")),
                url: href,
                title: numberText.trim() || undefined,
            })
        })

        results.sort((a, b) => a.number - b.number)
        return results
    }

    async findEpisodeServer(episode: EpisodeDetails | any, _server: string): Promise<EpisodeServer> {
        if (Array.isArray(episode) && episode.length > 0) episode = episode[0]

        let targetUrl = episode.url || episode.id || ""
        if (!targetUrl.startsWith("http")) targetUrl = `${this.api}${targetUrl.startsWith("/") ? "" : "/"}${targetUrl}`

        const req = await fetch(targetUrl, { headers: this.headers })
        const html = await req.text()
        const $ = LoadDoc(html)

        const result: EpisodeServer = {
            server: "default",
            headers: { Referer: targetUrl, "User-Agent": this.headers["User-Agent"] },
            videoSources: [],
        }

        const embeds: { label: string, payload: string }[] = []
        $("[data-embed-id]").each((_, el) => {
            const encoded = el.attr("data-embed-id")
            if (!encoded) return
            const sep = encoded.indexOf(":")
            if (sep === -1) return
            const label = this.decodeBase64(encoded.slice(0, sep)) || "Servidor"
            const payload = this.decodeBase64(encoded.slice(sep + 1)) || ""
            embeds.push({ label, payload })
        })

        for (const embed of embeds) {
            const embedUrl = this.extractEmbedUrl(embed.payload)
            if (!embedUrl) continue
            try {
                if (embedUrl.includes("blogger.com/video")) {
                    await this.extractBlogger(embedUrl, embed.label, result)
                } else {
                    await this.extractUniversal(embedUrl, targetUrl, embed.label, result)
                }
            } catch (e) {
                console.error(`Falha ao extrair fonte "${embed.label}"`, e)
            }
        }

        if (result.videoSources.length === 0) {
            throw "Episódio ainda não liberado ou nenhuma fonte de vídeo encontrada."
        }

        return result
    }

    private extractEmbedUrl(payload: string): string | null {
        const trimmed = payload.trim()
        if (!trimmed) return null
        const iframeMatch = trimmed.match(/<iframe[^>]+src=["']([^"']+)["']/i)
        if (iframeMatch) return this.normalizeUrl(iframeMatch[1])
        if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("//")) return this.normalizeUrl(trimmed)
        return null
    }

    private normalizeUrl(url: string): string {
        return url.startsWith("//") ? `https:${url}` : url
    }

    private decodeBase64(str: string): string {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="
        let output = ""
        str = String(str).replace(/=+$/, "")
        for (let bc = 0, bs = 0, buffer, idx = 0;
             buffer = str.charAt(idx++);
             ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer,
                 bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0
        ) {
            buffer = chars.indexOf(buffer)
        }
        return output
    }

    async extractUniversal(url: string, referer: string, label: string, result: EpisodeServer) {
        const req = await fetch(url, { headers: { Referer: referer } })
        const html = await req.text()

        const match = html.match(/var\s+jw\s*=\s*\{["']?file["']?\s*:\s*"([^"]+)"/)
        if (!match) return
        const videoUrl = match[1].replace(/\\\//g, "/")

        let type: VideoSourceType = "unknown"
        if (videoUrl.includes(".m3u8")) type = "m3u8"
        else if (videoUrl.includes(".mp4")) type = "mp4"

        result.videoSources.push({
            url: videoUrl,
            type,
            quality: label,
            subtitles: [],
            headers: { Referer: url },
        } as VideoSource)
    }

    async extractBlogger(url: string, label: string, result: EpisodeServer) {
        try {
            const req = await fetch(url, { headers: { Referer: this.api } })
            const body = await req.text()

            const configMatch = body.match(/var VIDEO_CONFIG = ({.*?});/s)
            if (configMatch) {
                const config = JSON.parse(configMatch[1])
                if (config.streams && Array.isArray(config.streams)) {
                    for (const stream of config.streams) {
                        if (stream.play_url) {
                            result.videoSources.push({
                                url: stream.play_url,
                                type: "mp4",
                                quality: `${label} - ${this.itagQuality(stream.play_url)}`,
                                subtitles: [],
                            } as VideoSource)
                        }
                    }
                }
                return
            }

            const tokenMatch = url.match(/token=([^&]+)/)
            if (!tokenMatch) return
            const token = tokenMatch[1]

            const sidMatch = body.match(/FdrFJe":"(.*?)"/)
            const blogIdMatch = body.match(/cfb2h":"(.*?)"/)
            if (!sidMatch || !blogIdMatch) return
            const formSessionId = sidMatch[1]
            const blogId = blogIdMatch[1]
            const requestId = (Math.floor(Date.now() / 1000) % 86400).toString()

            const rpcUrl = `https://www.blogger.com/_/BloggerVideoPlayerUi/data/batchexecute?rpcids=WcwnYd&source-path=/video.g&f.sid=${formSessionId}&bl=${blogId}&hl=en-US&_reqid=${requestId}&rt=c`
            const rpcBody = `f.req=${encodeURIComponent(`[[["WcwnYd","[\\"${token}\\",\\"\\",0]",null,"generic"]]]`)}&`

            const rpcReq = await fetch(rpcUrl, {
                method: "POST",
                body: rpcBody,
                headers: {
                    "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
                    "Referer": "https://www.blogger.com/",
                    "User-Agent": this.headers["User-Agent"],
                },
            })
            const rpcString = await rpcReq.text()

            const addedUrls = new Set<string>()
            const parts = rpcString.split("https://")
            for (let i = 1; i < parts.length; i++) {
                const endMatch = parts[i].search(/\\?"/)
                if (endMatch === -1) continue

                let videoUrl = "https://" + parts[i].substring(0, endMatch)
                videoUrl = videoUrl.replace(/\\/g, "")
                videoUrl = videoUrl.replace(/u0026/g, "&").replace(/u003d/g, "=")

                if (videoUrl.includes("googlevideo.com") && videoUrl.includes("itag") && !addedUrls.has(videoUrl)) {
                    addedUrls.add(videoUrl)
                    result.videoSources.push({
                        url: videoUrl + "#.mp4",
                        type: "mp4",
                        quality: `${label} - ${this.itagQuality(videoUrl)}`,
                        subtitles: [],
                        headers: {
                            "Referer": "https://www.blogger.com/",
                            "User-Agent": this.headers["User-Agent"],
                        },
                    } as VideoSource)
                }
            }
        } catch (e) {
            console.error("Falha ao extrair vídeos do Blogger", e)
        }
    }

    private itagQuality(url: string): string {
        const resMatch = url.match(/itag=(\d+)/)
        if (!resMatch) return "Unknown"
        const itag = parseInt(resMatch[1])
        if (itag === 22) return "720p"
        if (itag === 18) return "360p"
        if (itag === 37) return "1080p"
        if (itag === 7) return "240p"
        return "Unknown"
    }
}
