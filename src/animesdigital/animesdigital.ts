/// <reference path="../../doc/online-streaming-provider.d.ts" />
/// <reference path="../../doc/core.d.ts" />

class Provider {
    api = "https://animesdigital.org"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Referer": this.api
    }

    getSettings(): Settings {
        return {
            episodeServers: ["AnimesDigital"],
            supportsDub: true,
        };
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const query = encodeURIComponent(opts.query);
        const req = await fetch(`${this.api}/?s=${query}`, { headers: this.headers });
        const html = await req.text();
        const $ = LoadDoc(html);
        
        const results: SearchResult[] = [];
        
        $("div.itemA a").each((_, el) => {
            const url = el.attr("href");
            const title = el.attr("title") || el.attr("alt") || "";
            const img = el.find("div.thumb img").attr("src") || "";
            
            if (url && title && url.includes("/anime/a/")) {
                const isDub = title.toLowerCase().includes("dublado");
                if (opts.dub !== isDub) return;
                
                results.push({
                    id: url,
                    title: title.replace(/(Assistir | Dublado Online em HD| Legendado Online em HD| Online em HD)/ig, "").trim(),
                    url: url,
                    image: img,
                    subOrDub: isDub ? "dub" : "sub"
                });
            }
        });
        
        return results;
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        const req = await fetch(id, { headers: this.headers });
        const html = await req.text();
        const $ = LoadDoc(html);
        
        const episodes: EpisodeDetails[] = [];
        
        const extractEpisodes = (doc: any) => {
            doc("div.item_ep a.b_flex").each((_, el) => {
                const url = el.attr("href");
                const title = el.find("div.title_anime").text() || el.attr("title") || "";
                
                if (url) {
                    const match = title.match(/Epis[óo]dio (\d+)/i);
                    const epNum = match ? match[1] : (episodes.length + 1).toString();
                    
                    episodes.push({
                        id: url,
                        number: parseFloat(epNum),
                        title: title.trim(),
                        url: url
                    });
                }
            });
        };
        
        extractEpisodes($);
        
        // Handle pagination
        const lastPageEl = $("ul.content-pagination > li:nth-last-child(2) > a");
        if (lastPageEl.length > 0) {
            const lastPage = parseInt(lastPageEl.text());
            if (!isNaN(lastPage) && lastPage > 1) {
                // Fetch all remaining pages in parallel
                const promises = [];
                for (let i = 2; i <= lastPage; i++) {
                    promises.push(fetch(`${id}/page/${i}`, { headers: this.headers }).then(r => r.text()));
                }
                const pagesHtml = await Promise.all(promises);
                for (const pageHtml of pagesHtml) {
                    extractEpisodes(LoadDoc(pageHtml));
                }
            }
        }
        
        return episodes.sort((a, b) => b.number - a.number);
    }

    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        const req = await fetch(episode.url, { headers: this.headers });
        const html = await req.text();
        
        const result: EpisodeServer = {
            server: "AnimesDigital",
            headers: this.headers,
            videoSources: []
        };
        
        const $ = LoadDoc(html);

        const players: { url: string, label: string }[] = []
        $("ul.tabs_videos li").each((_, el) => {
            const dataTab = el.attr("data-tab");
            if (!dataTab) return;

            let label = (el.text() || "").trim().replace("Player ", "");
            if (label === "FHD") label = "1080p";
            else if (label === "HD") label = "720p";
            else if (label === "SD") label = "480p";
            else if (!label) label = "auto";

            const iframe = $(dataTab).find("iframe").attr("src");
            if (iframe) players.push({ url: iframe, label })
        });

        for (const player of players) {
            // Check if it's the anivideo endpoint with direct m3u8/mp4
            let match = player.url.match(/d=([^"']+\.m3u8)/);
            if (match) {
                result.videoSources.push({
                    url: decodeURIComponent(match[1]),
                    quality: player.label,
                    type: "m3u8",
                    subtitles: []
                });
                continue
            }
            match = player.url.match(/d=([^"']+\.mp4)/);
            if (match) {
                result.videoSources.push({
                    url: decodeURIComponent(match[1]),
                    quality: player.label,
                    type: "mp4",
                    subtitles: []
                });
                continue
            }

            if (player.url.includes("blogger.com")) {
                await this.extractBlogger(player.url, player.label, result)
                continue
            }

            // Direct MP4 in other iframes (ignoring their bg.mp4 protector wrapper)
            if (player.url.includes(".mp4") && !player.url.includes("bg.mp4")) {
                result.videoSources.push({
                    url: player.url,
                    quality: player.label,
                    type: "mp4",
                    subtitles: []
                });
                continue
            }

            // Generic fallback for wrapper/protector pages (e.g. "bg.mp4"): fetch and
            // look for a nested iframe, mirroring the Kotlin reference's recursive strategy.
            try {
                const nestedReq = await fetch(player.url, { headers: { ...this.headers, Referer: episode.url } })
                const nestedHtml = await nestedReq.text()
                const nestedMatch = nestedHtml.match(/<iframe[^>]+src=["']([^"']+)["']/i)
                if (!nestedMatch) continue
                const nestedUrl = nestedMatch[1]
                if (nestedUrl.includes("blogger.com")) {
                    await this.extractBlogger(nestedUrl, player.label, result)
                } else if (nestedUrl.includes(".m3u8")) {
                    result.videoSources.push({ url: nestedUrl, quality: player.label, type: "m3u8", subtitles: [] })
                } else if (nestedUrl.includes(".mp4")) {
                    result.videoSources.push({ url: nestedUrl, quality: player.label, type: "mp4", subtitles: [] })
                }
            } catch (e) {
                console.error(`Falha ao processar player "${player.label}"`, e)
            }
        }

        return result;
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
                            })
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
                    })
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
