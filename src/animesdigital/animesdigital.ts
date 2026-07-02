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

        $("ul.tabs_videos li").each((_, el) => {
            const dataTab = el.attr("data-tab");
            if (!dataTab) return;
            
            let label = (el.text() || "").trim().replace("Player ", "");
            if (label === "FHD") label = "1080p";
            else if (label === "HD") label = "720p";
            else if (label === "SD") label = "480p";
            else if (!label) label = "auto";
            
            const iframe = $(dataTab).find("iframe").attr("src");
            if (iframe) {
                // Check if it's the anivideo endpoint with direct m3u8/mp4
                let match = iframe.match(/d=([^"']+\.m3u8)/);
                if (match) {
                    result.videoSources.push({
                        url: decodeURIComponent(match[1]),
                        quality: label,
                        type: "m3u8"
                    });
                }
                match = iframe.match(/d=([^"']+\.mp4)/);
                if (match) {
                    result.videoSources.push({
                        url: decodeURIComponent(match[1]),
                        quality: label,
                        type: "mp4"
                    });
                }
                
                // Fallback for direct MP4 in other iframes (ignoring their bg.mp4 protector)
                if (iframe.includes(".mp4") && !iframe.includes("bg.mp4") && !iframe.includes("d=")) {
                    result.videoSources.push({
                        url: iframe,
                        quality: label,
                        type: "mp4"
                    });
                }
            }
        });

        // If no sources found yet, try generic iframe extraction (fallback)
        if (result.videoSources.length === 0) {
            const genericIframes = [...html.matchAll(/<iframe[^>]+src=["']([^"']+)["']/ig)];
            for (const match of genericIframes) {
                const url = match[1];
                if (url.includes(".mp4") && !url.includes("bg.mp4")) {
                    result.videoSources.push({
                        url: url,
                        quality: "auto",
                        type: "mp4"
                    });
                } else if (url.includes(".m3u8")) {
                    result.videoSources.push({
                        url: url,
                        quality: "auto",
                        type: "m3u8"
                    });
                }
            }
        }
        
        return result;
    }
}
