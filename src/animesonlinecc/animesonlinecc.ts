/// <reference path="../../doc/online-streaming-provider.d.ts" />
/// <reference path="../../doc/core.d.ts" />

class Provider {
    api = "https://animesonlinecc.to"
    headers = { 
        Referer: this.api, 
        Origin: this.api,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36"
    }

    getSettings(): Settings {
        return {
            episodeServers: ["Blogger"],
            supportsDub: true,
        }
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const query = encodeURIComponent(opts.query)
        const req = await fetch(`${this.api}/?s=${query}`, {
            headers: this.headers,
        })
        const html = await req.text()
        const $ = LoadDoc(html)
        
        const results: SearchResult[] = []
        $("div#archive-content article.item, article.w_item_b").each((_, el) => {
            const a = el.find("a")
            const href = a.attr("href")
            const img = el.find("img")
            const title = img.attr("alt") || el.find("h3").text() || ""
            
            if (href && title && href.includes("/anime/")) {
                results.push({
                    id: href.replace(this.api, ""), // remove domain
                    title: title.trim(),
                    url: href,
                    subOrDub: "both",
                })
            }
        })
        return results
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        const req = await fetch(`${this.api}${id}`, {
            headers: this.headers
        })
        const html = await req.text()
        const $ = LoadDoc(html)
        
        const results: EpisodeDetails[] = []
        
        $("ul.episodios > li").each((_, el) => {
            const epNumText = el.find("div.numerando").text() || ""
            const a = el.find("a")
            const href = a.attr("href")
            const episodeName = a.text() || ""
            
            const match = epNumText.match(/(\d+)$/)
            const number = match ? parseFloat(match[1]) : 0
            
            if (href) {
                results.push({
                    id: href.replace(this.api, ""),
                    number: number,
                    url: href,
                    title: `Episódio ${number}` + (episodeName ? ` - ${episodeName}` : "")
                })
            }
        })
        
        // Ensure episodes are sorted ascending
        results.sort((a, b) => a.number - b.number)
        
        return results
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
            server: "Blogger",
            headers: {
                "Referer": "https://www.blogger.com/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36"
            },
            videoSources: []
        }

        const iframe = $("#playex iframe").attr("src")
        if (iframe && iframe.includes("blogger.com")) {
            await this.extractBlogger(iframe, result)
        }

        return result
    }

    async extractBlogger(url: string, result: EpisodeServer) {
        try {
            const req = await fetch(url, { headers: { Referer: this.api } })
            const body = await req.text()
            
            // Fallback to old VIDEO_CONFIG extraction
            const configMatch = body.match(/var VIDEO_CONFIG = ({.*?});/s);
            if (configMatch) {
                const config = JSON.parse(configMatch[1]);
                if (config.streams && Array.isArray(config.streams)) {
                    for (const stream of config.streams) {
                        if (stream.play_url) {
                            let quality = "Unknown"
                            const resMatch = stream.play_url.match(/itag=(\d+)/)
                            if (resMatch) {
                                const itag = parseInt(resMatch[1])
                                if (itag === 22) quality = "720p"
                                else if (itag === 18) quality = "360p"
                                else if (itag === 37) quality = "1080p"
                                else if (itag === 7) quality = "240p"
                            }
                            result.videoSources.push({ url: stream.play_url, type: "mp4", quality: quality, subtitles: [] })
                        }
                    }
                }
                return;
            }

            // Batchexecute RPC extraction
            const tokenMatch = url.match(/token=([^&]+)/);
            if (!tokenMatch) return;
            const token = tokenMatch[1];
            
            const sidMatch = body.match(/FdrFJe":"(.*?)"/);
            const blogIdMatch = body.match(/cfb2h":"(.*?)"/);
            
            if (!sidMatch || !blogIdMatch) return;
            const formSessionId = sidMatch[1];
            const blogId = blogIdMatch[1];
            const requestId = (Math.floor(Date.now() / 1000) % 86400).toString();
            
            const rpcUrl = `https://www.blogger.com/_/BloggerVideoPlayerUi/data/batchexecute?rpcids=WcwnYd&source-path=/video.g&f.sid=${formSessionId}&bl=${blogId}&hl=en-US&_reqid=${requestId}&rt=c`;
            const rpcBody = `f.req=${encodeURIComponent(`[[["WcwnYd","[\\"${token}\\",\\"\\",0]",null,"generic"]]]`)}&`;
            
            const rpcReq = await fetch(rpcUrl, {
                method: "POST",
                body: rpcBody,
                headers: {
                    "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
                    "Referer": "https://www.blogger.com/",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36"
                }
            });
            const rpcString = await rpcReq.text();
            
            // Bypass Goja RegExp limitations by splitting the string directly
            const addedUrls = new Set<string>();
            const parts = rpcString.split("https://");
            for (let i = 1; i < parts.length; i++) {
                const endMatch = parts[i].search(/\\?"/);
                if (endMatch === -1) continue;
                
                let videoUrl = "https://" + parts[i].substring(0, endMatch);
                videoUrl = videoUrl.replace(/\\/g, "");
                videoUrl = videoUrl.replace(/u0026/g, "&").replace(/u003d/g, "=");
                
                if (videoUrl.includes("googlevideo.com") && videoUrl.includes("itag") && !addedUrls.has(videoUrl)) {
                    addedUrls.add(videoUrl);
                    
                    let quality = "Unknown";
                    const resMatch = videoUrl.match(/itag=(\d+)/);
                    if (resMatch) {
                        const itag = parseInt(resMatch[1]);
                        if (itag === 22) quality = "720p";
                        else if (itag === 18) quality = "360p";
                        else if (itag === 37) quality = "1080p";
                        else if (itag === 7) quality = "240p";
                    }
                    
                    result.videoSources.push({
                        url: videoUrl + "#.mp4",
                        type: "mp4",
                        quality: quality,
                        subtitles: [],
                        headers: {
                            "Referer": "https://www.blogger.com/",
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36"
                        }
                    });
                }
            }

            // Filter to only keep 1080p and 720p
            result.videoSources = result.videoSources.filter(v => v.quality === "1080p" || v.quality === "720p");

            const qualityMap: Record<string, number> = {
                "1080p": 1080,
                "720p": 720,
                "360p": 360,
                "240p": 240,
                "Unknown": 0
            };
            result.videoSources.sort((a, b) => qualityMap[b.quality] - qualityMap[a.quality]);
        } catch (e) {
            console.error("Failed to extract videos from blogger", e)
        }
    }
}
