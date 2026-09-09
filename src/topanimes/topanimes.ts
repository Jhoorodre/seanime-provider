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
                if (opts.dub !== isDub) return;
                
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
            const nameLower = label.toLowerCase();

            // Handle /aviso/ redirects
            if (url.includes("/aviso/")) {
                try {
                    const u = new URL(url.startsWith("http") ? url : this.api + url);
                    url = decodeURIComponent(u.searchParams.get("url") || url);
                } catch(e) {}
            }

            // Known third-party hosts with unresolvable/anti-bot-protected embeds
            // (matches the Kotlin reference's explicit "Unsupported" list) — skip
            // rather than pushing an unplayable embed URL as a fake video source.
            if (url.includes("abyssplayer.com") || nameLower.includes("aniplay")) {
                continue
            }

            if (nameLower.includes("streamtape")) {
                await this.extractStreamTape(url, label, result)
            } else if (nameLower.includes("mixdrop")) {
                await this.extractMixDrop(url, label, result)
            } else if (url.includes("alibabacdn.net") || url.includes("cinedrive.com") || url.includes("cinesky.top")) {
                try {
                    const apiUrl = url + "&mode=api2";
                    const apiReq = await fetch(apiUrl, { headers: { ...this.headers, "Referer": url } });
                    const text = await apiReq.text();

                    let json: any = null;
                    try { json = JSON.parse(text) } catch (e) {}

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
                                type: m.url.includes(".m3u8") ? "m3u8" : "mp4",
                                subtitles: []
                            });
                        }
                    } else {
                        // mode=api2 can also return an HTML page with a JWPlayer
                        // `sources: [{"file":"...","label":"1080p"}]` config instead of JSON.
                        const sourceMatches = [...text.matchAll(/\{"file":"([^"]+)"[^}]*?(?:"label":"([^"]*)")?[^}]*\}/g)];
                        for (const m of sourceMatches) {
                            const videoUrl = m[1].replace(/\\\//g, "/");
                            result.videoSources.push({
                                url: videoUrl,
                                quality: m[2] || label,
                                type: videoUrl.includes(".m3u8") ? "m3u8" : "mp4",
                                subtitles: []
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
                            type: finalUrl.includes(".m3u8") ? "m3u8" : "mp4",
                            subtitles: []
                        });
                    } else if (url.includes(".mp4") && !url.includes("bg.mp4")) {
                        result.videoSources.push({ url, quality: label, type: "mp4", subtitles: [] });
                    } else if (url.includes(".m3u8")) {
                        result.videoSources.push({ url, quality: label, type: "m3u8", subtitles: [] });
                    }
                } catch(e) {}
            } else if (url.includes(".mp4") && !url.includes("bg.mp4")) {
                result.videoSources.push({ url: url, quality: label, type: "mp4", subtitles: [] });
            } else if (url.includes(".m3u8")) {
                result.videoSources.push({ url: url, quality: label, type: "m3u8", subtitles: [] });
            } else {
                // Generic fallback: fetch the embed and look for a JWPlayer-style
                // `var jw = {"file":"..."}` config, same pattern used across other
                // providers in this repo instead of blindly assuming the raw
                // embed URL is directly playable.
                try {
                    const embedReq = await fetch(url.startsWith("http") ? url : this.api + url, { headers: { ...this.headers, Referer: episode.url } })
                    const embedHtml = await embedReq.text()
                    const jwMatch = embedHtml.match(/var\s+jw\s*=\s*\{["']?file["']?\s*:\s*"([^"]+)"/)
                    if (jwMatch) {
                        const videoUrl = jwMatch[1].replace(/\\\//g, "/")
                        result.videoSources.push({
                            url: videoUrl,
                            quality: label,
                            type: videoUrl.includes(".m3u8") ? "m3u8" : "mp4",
                            subtitles: []
                        })
                    }
                } catch (e) {
                    console.error(`Falha ao processar player "${label}"`, e)
                }
            }
        }

        return result;
    }

    async extractStreamTape(url: string, label: string, result: EpisodeServer) {
        try {
            const baseUrl = "https://streamtape.com/e/"
            let newUrl = url
            if (!url.startsWith(baseUrl)) {
                const id = url.split("/")[4]
                if (!id) return
                newUrl = baseUrl + id
            }
            const req = await fetch(newUrl, { headers: { "User-Agent": this.headers["User-Agent"], Referer: this.api } })
            const html = await req.text()

            const marker = "document.getElementById('robotlink')"
            const markerIdx = html.indexOf(marker)
            if (markerIdx === -1) return
            const scriptStart = html.indexOf(".innerHTML = '", markerIdx)
            if (scriptStart === -1) return
            const afterMarker = html.slice(scriptStart + ".innerHTML = '".length)

            const part1 = afterMarker.split("'")[0]
            const xcdIdx = afterMarker.indexOf("+ ('xcd")
            if (xcdIdx === -1) return
            const part2 = afterMarker.slice(xcdIdx + "+ ('xcd".length).split("'")[0]

            const videoUrl = "https:" + part1 + part2
            result.videoSources.push({ url: videoUrl, quality: `${label} - StreamTape`, type: "mp4", subtitles: [] })
        } catch (e) {
            console.error("Falha ao extrair StreamTape", e)
        }
    }

    async extractMixDrop(url: string, label: string, result: EpisodeServer) {
        try {
            const req = await fetch(url, { headers: { "User-Agent": this.headers["User-Agent"], Referer: "https://mixdrop.co/" } })
            const html = await req.text()
            const $ = LoadDoc(html)

            let mdScript = ""
            $("script").each((_, el) => {
                if (mdScript) return
                const t = el.text() || ""
                if (t.includes("eval") && t.includes("MDCore")) mdScript = t
            })
            if (!mdScript) return

            const unpacked = this.unpackJS(mdScript)
            const wurlMatch = unpacked.match(/Core\.wurl="([^"]+)"/)
            if (!wurlMatch) return

            const videoUrl = "https:" + wurlMatch[1]
            result.videoSources.push({ url: videoUrl, quality: `${label} - MixDrop`, type: "mp4", subtitles: [] })
        } catch (e) {
            console.error("Falha ao extrair MixDrop", e)
        }
    }

    // Unpacks Dean Edwards' "eval(function(p,a,c,k,e,d)...)" JS packer format.
    private unpackJS(source: string): string {
        const match = source.match(/\}\('(.*)',\s*(\d+),\s*(\d+),\s*'(.*)'\.split\('\|'\)/s)
        if (!match) return source

        let payload = match[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\")
        const radix = parseInt(match[2], 10)
        const count = parseInt(match[3], 10)
        const words = match[4].split("|")

        const toBaseN = (num: number, base: number): string => {
            const digits = "0123456789abcdefghijklmnopqrstuvwxyz"
            return num < base ? digits[num] : toBaseN(Math.floor(num / base), base) + digits[num % base]
        }

        for (let i = count - 1; i >= 0; i--) {
            if (words[i]) {
                const key = radix <= 36 ? toBaseN(i, radix) : String(i)
                payload = payload.replace(new RegExp(`\\b${key}\\b`, "g"), words[i])
            }
        }
        return payload
    }
}
