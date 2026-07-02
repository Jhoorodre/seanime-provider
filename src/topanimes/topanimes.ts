/// <reference path="../../doc/online-streaming-provider.d.ts" />
/// <reference path="../../doc/core.d.ts" />

class Provider {
    api = "https://topanimes.net"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Referer": this.api
    }

    getSettings(): Settings {
        return {
            episodeServers: ["TopAnimes"],
            supportsDub: true,
        };
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const query = encodeURIComponent(opts.query);
        const req = await fetch(`${this.api}/?s=${query}`, { headers: this.headers });
        const html = await req.text();
        const $ = LoadDoc(html);
        
        const results: SearchResult[] = [];
        
        $("div.result-item article").each((_, el) => {
            const a = el.find("div.thumbnail > a");
            const url = a.attr("href");
            const img = a.find("img").attr("src") || "";
            const title = a.find("img").attr("alt") || "";
            
            if (url && title && url.includes("/animes/")) {
                const isDub = title.toLowerCase().includes("dublado");
                
                results.push({
                    id: url,
                    title: title.replace(/(Assistir | Dublado| Legendado| Online)/ig, "").trim(),
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
        let html = await req.text();
        let $ = LoadDoc(html);
        
        // Handle DooPlay episode pagination (Real Anime Doc)
        const pagEp = $("div.pag_episodes div.item > a:has(i.fa-th)");
        if (pagEp.length > 0) {
            const realUrl = pagEp.attr("href");
            if (realUrl) {
                const realReq = await fetch(realUrl, { headers: this.headers });
                html = await realReq.text();
                $ = LoadDoc(html);
            }
        }
        
        const episodes: EpisodeDetails[] = [];
        
        $("ul.episodios > li").each((_, el) => {
            const a = el.find("a");
            const url = a.attr("href");
            let title = a.text() || a.attr("title") || "";
            const numText = el.find("div.epnumber").text();
            
            if (url) {
                let epNum = numText;
                if (!epNum) {
                    const match = title.match(/Epis[óo]dio (\d+)/i);
                    epNum = match ? match[1] : (episodes.length + 1).toString();
                }
                
                episodes.push({
                    id: url,
                    number: parseFloat(epNum),
                    title: title.trim(),
                    url: url
                });
            }
        });
        
        return episodes.sort((a, b) => b.number - a.number);
    }

    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        const req = await fetch(episode.url, { headers: this.headers });
        const html = await req.text();
        const $ = LoadDoc(html);
        
        const result: EpisodeServer = {
            server: "TopAnimes",
            headers: this.headers,
            videoSources: []
        };
        
        const servers: {url: string, label: string}[] = [];
        
        // Match standard DooPlay iframes mapped by player tabs
        $("ul#playeroptionsul li").each((_, el) => {
            const nume = el.attr("data-nume");
            let label = el.find("span.title").text().trim();
            if (!label) label = "auto";
            
            if (nume) {
                const iframeUrl = $(`#source-player-${nume} iframe`).attr("src");
                if (iframeUrl) {
                    servers.push({ url: iframeUrl, label });
                }
            }
        });
        
        // Fallback: if no tabs found, just grab all iframes
        if (servers.length === 0) {
            const genericIframes = [...html.matchAll(/<iframe[^>]+src=["']([^"']+)["']/ig)];
            for (const match of genericIframes) {
                servers.push({ url: match[1], label: "auto" });
            }
        }
        
        for (const s of servers) {
            let url = s.url;
            const label = s.label;
            
            // Handle /aviso/ redirects
            if (url.includes("/aviso/")) {
                try {
                    const u = new URL(url.startsWith("http") ? url : this.api + url);
                    url = decodeURIComponent(u.searchParams.get("url") || url);
                } catch(e) {}
            }

            if (url.includes("sk-api.alibabacdn.net") || url.includes("cinedrive.com") || url.includes("cinesky.top")) {
                try {
                    const apiUrl = url + "&mode=api2";
                    const apiReq = await fetch(apiUrl, { headers: { ...this.headers, "Referer": url } });
                    const json = await apiReq.json();
                    
                    if (json && json.status === "success" && json.midias) {
                        for (const m of json.midias) {
                            let rawLabel = m.qualidade ? m.qualidade.toUpperCase() : 'AUTO';
                            let finalLabel = rawLabel;

                            if (rawLabel === 'SD') finalLabel = '1080p';
                            else if (rawLabel === 'LD') finalLabel = '720p';
                            else if (rawLabel === 'FD') finalLabel = '360p';
                            else if (rawLabel.includes('1080')) finalLabel = '1080p';
                            else if (rawLabel.includes('720')) finalLabel = '720p';
                            else finalLabel = label; // Use tab label if quality is generic
                            
                            result.videoSources.push({
                                url: m.url,
                                quality: finalLabel,
                                type: m.url.includes(".m3u8") ? "m3u8" : "mp4"
                            });
                        }
                    }
                } catch (e) {}
            } else if (url.includes("/antivirus") || url.includes("topanimes.net")) {
                try {
                    const fetchUrl = (url.startsWith("http") ? url : this.api + url).replace(/ /g, "%20");
                    const reqHtml = await fetch(fetchUrl, { headers: this.headers });
                    const text = await reqHtml.text();
                    
                    const m = text.match(/(?:file|url|source|src)["']?\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
                    let finalUrl = "";
                    
                    if (m && m[1]) {
                        finalUrl = m[1];
                    } else {
                        const b = text.match(/atob\(['"]([^'"]+)['"]\)/i);
                        if (b && b[1]) {
                            try {
                                finalUrl = atob(b[1]);
                            } catch(e) {}
                        }
                    }
                    
                    if (finalUrl) {
                        result.videoSources.push({
                            url: finalUrl,
                            quality: label,
                            type: finalUrl.includes(".m3u8") ? "m3u8" : "mp4"
                        });
                    } else if (url.includes(".mp4") && !url.includes("bg.mp4")) {
                        result.videoSources.push({ url, quality: label, type: "mp4" });
                    } else if (url.includes(".m3u8")) {
                        result.videoSources.push({ url, quality: label, type: "m3u8" });
                    }
                } catch(e) {}
            } else if (url.includes(".mp4") && !url.includes("bg.mp4")) {
                result.videoSources.push({ url: url, quality: label, type: "mp4" });
            } else if (url.includes(".m3u8")) {
                result.videoSources.push({ url: url, quality: label, type: "m3u8" });
            } else {
                result.videoSources.push({ url: url, quality: label, type: "unknown" });
            }
        }
        
        return result;
    }
}
