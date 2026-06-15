/// <reference path="../../doc/online-streaming-provider.d.ts" />
/// <reference path="../../doc/core.d.ts" />

class Provider {
    api = "https://anikyuu.to"
    headers = { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Referer": this.api,
        "Origin": this.api
    }

    getSettings(): Settings {
        return {
            episodeServers: ["Filemoon", "Strmup", "Byse"],
            supportsDub: true,
        }
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const query = encodeURIComponent(opts.query)
        const req = await fetch(`${this.api}/?s=${query}`, { headers: this.headers })
        const html = await req.text()
        const $ = LoadDoc(html)
        
        const results: SearchResult[] = []
        $("article.bs").each((_, el) => {
            const a = el.find("a")
            const href = a.attr("href") || ""
            let title = a.attr("title") || el.find(".tt h2").text() || el.find(".tt").text() || ""
            
            if (href && title) {
                title = title.replace(/\t|\n/g, " ").replace(/\s+/g, " ").trim()
                const isDub = title.toLowerCase().includes("dublado")
                
                // Remove "Dublado" para o Seanime conseguir dar match exato no nome do anime
                title = title.replace(/dublado/i, "").replace(/\(\s*\)/g, "").replace(/\-\s*$/, "").trim()
                
                results.push({
                    id: href.replace(this.api, ""), // remove domain
                    title: title,
                    url: href,
                    subOrDub: isDub ? "dub" : "sub",
                })
            }
        })
        return results
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        let targetUrl = id
        if (!targetUrl.startsWith("http")) {
            targetUrl = `${this.api}${targetUrl.startsWith("/") ? "" : "/"}${targetUrl}`
        }

        const req = await fetch(targetUrl, { headers: this.headers })
        const html = await req.text()
        const $ = LoadDoc(html)
        
        const results: EpisodeDetails[] = []
        
        $("div.eplister ul li").each((_, el) => {
            const a = el.find("a")
            const href = a.attr("href")
            const epNumText = el.find(".epl-num").text() || ""
            let epTitle = el.find(".epl-title").text() || ""
            
            if (href) {
                const match = epNumText.match(/(\d+(?:\.\d+)?)/)
                const number = match ? parseFloat(match[1]) : 0
                epTitle = epTitle.replace(/\\t|\\n/g, " ").replace(/\\s+/g, " ").trim()
                
                results.push({
                    id: href.replace(this.api, ""),
                    number: number,
                    url: href,
                    title: epTitle || `Episódio ${number}`
                })
            }
        })
        
        results.sort((a, b) => a.number - b.number)
        
        return results
    }

    atobPolyfill(str: string): string {
        const b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
        let o1, o2, o3, h1, h2, h3, h4, bits, i = 0, enc = "";
        str = str.replace(/[^A-Za-z0-9\+\/\=]/g, "");
        do {
            h1 = b64.indexOf(str.charAt(i++));
            h2 = b64.indexOf(str.charAt(i++));
            h3 = b64.indexOf(str.charAt(i++));
            h4 = b64.indexOf(str.charAt(i++));
            bits = h1 << 18 | h2 << 12 | h3 << 6 | h4;
            o1 = bits >> 16 & 0xff;
            o2 = bits >> 8 & 0xff;
            o3 = bits & 0xff;
            if (h3 == 64) enc += String.fromCharCode(o1);
            else if (h4 == 64) enc += String.fromCharCode(o1, o2);
            else enc += String.fromCharCode(o1, o2, o3);
        } while (i < str.length);
        return enc;
    }

    async extractFilemoon(url: string, result: EpisodeServer, quality: string) {
        try {
            const req = await fetch(url, { headers: { "User-Agent": this.headers["User-Agent"] } })
            const body = await req.text()
            
            const match = body.match(/eval\\(function\\(p,a,c,k,e,d\\).+?\\}\\((.+?)\\)\\)/)
            if (match) {
                const argsString = match[1]
                let pMatch = argsString.match(/^'(.*?)',/)
                if (!pMatch) pMatch = argsString.match(/^"(.*?)",/)
                
                if (pMatch) {
                    const p = pMatch[1]
                    const parts = argsString.split(",")
                    const a = parseInt(parts[parts.length - 5])
                    const c = parseInt(parts[parts.length - 4])
                    
                    const kMatch = argsString.match(/\\.split\\(['|"]([^'|"]+)['|"]\\)/)
                    if (kMatch) {
                        const kStr = kMatch[1]
                        const k = kStr.split("|")
                        
                        let unpacked = p
                        for (let i = c - 1; i >= 0; i--) {
                            if (k[i]) {
                                let regexStr = "\\\\b"
                                let radixStr = i.toString(a)
                                regexStr += radixStr + "\\\\b"
                                unpacked = unpacked.replace(new RegExp(regexStr, 'g'), k[i])
                            }
                        }
                        
                        const fileMatch = unpacked.match(/file\\s*:\\s*["']([^"']+\\.m3u8[^"']*)["']/)
                        if (fileMatch) {
                            result.videoSources.push({
                                url: fileMatch[1],
                                quality: quality,
                                type: "m3u8",
                                headers: {}
                            })
                        }
                    }
                }
            }
        } catch (e) {}
    }

    async extractTurbovid(url: string, result: EpisodeServer, quality: string) {
        try {
            const req = await fetch(url, { headers: { "Referer": this.api, "User-Agent": this.headers["User-Agent"] } })
            const body = await req.text()
            const match = body.match(/var\s+urlPlay\s*=\s*['"]([^'"]+)['"]/)
            if (match) {
                result.videoSources.push({
                    url: match[1],
                    quality: quality,
                    type: "m3u8",
                    headers: {}
                })
                return true
            }
        } catch (e) {}
        // Fallback
        result.videoSources.push({ url: url, quality: quality, type: "mp4", headers: this.headers })
        return false
    }

    async extractStrmup(url: string, result: EpisodeServer, quality: string) {
        try {
            const parts = url.split("/")
            const id = parts[parts.length - 1]
            const req = await fetch(`https://strmup.to/ajax/stream?filecode=${id}`, { headers: { "Referer": this.api, "User-Agent": this.headers["User-Agent"] } })
            const body = await req.text()
            
            const match = body.match(/"streaming_url"\s*:\s*"([^"]+)"/)
            if (match) {
                const streamUrl = match[1].replace(/\\/g, "")
                result.videoSources.push({
                    url: streamUrl,
                    quality: quality,
                    type: "m3u8",
                    headers: {}
                })
                return true
            }
        } catch (e) {}
        // Fallback
        result.videoSources.push({ url: url, quality: quality, type: "mp4", headers: this.headers })
        return false
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
            server: "Anikyuu",
            headers: this.headers,
            videoSources: []
        }

        const options = $("select.mirror option")
        
        const extractPromises = []
        for (let i = 0; i < options.length(); i++) {
            const el = options.eq(i)
            const b64 = el.attr("value")
            if (b64) {
                try {
                    let decoded = ""
                    try { decoded = atob(b64) } catch(e) { decoded = this.atobPolyfill(b64) }
                    
                    const srcMatch = decoded.match(/src="([^"]+)"/)
                    if (srcMatch) {
                        const iframeUrl = srcMatch[1]
                        let quality = "HD"
                        const name = el.text().trim().toLowerCase()
                        if (name.includes("fhd") || name.includes("1080")) quality = "1080p"
                        else if (name.includes("sd") || name.includes("480")) quality = "480p"
                        
                        if (iframeUrl.includes("filemoon")) {
                            extractPromises.push(this.extractFilemoon(iframeUrl, result, quality))
                        } else if (iframeUrl.includes("turbovidhls.com") || iframeUrl.includes("turbovid")) {
                            extractPromises.push(this.extractTurbovid(iframeUrl, result, quality))
                        } else if (iframeUrl.includes("strmup.to")) {
                            extractPromises.push(this.extractStrmup(iframeUrl, result, quality))
                        } else {
                            result.videoSources.push({
                                url: iframeUrl,
                                quality: quality,
                                type: "mp4",
                                headers: this.headers
                            })
                        }
                    }
                } catch(e) {}
            }
        }

        
        await Promise.all(extractPromises)

        // If no options, look for direct embed
        if (result.videoSources.length === 0) {
            const embeds = $("div.player-embed iframe")
            const embedPromises = []
            for (let i = 0; i < embeds.length(); i++) {
                const el = embeds.eq(i)
                const src = el.attr("src")
                if (src && src.includes("filemoon")) {
                    embedPromises.push(this.extractFilemoon(src, result, "HD"))
                }
            }
            await Promise.all(embedPromises)
        }
        
        const qualityMap: Record<string, number> = {
            "1080p": 1080,
            "HD": 720,
            "720p": 720,
            "SD": 480,
            "480p": 480,
            "SQ": 360,
            "360p": 360
        };
        
        result.videoSources.sort((a, b) => {
            const aq = qualityMap[a.quality] || 0;
            const bq = qualityMap[b.quality] || 0;
            return bq - aq;
        });

        return result
    }
}
