/// <reference path="../../doc/online-streaming-provider.d.ts" />
/// <reference path="../../doc/core.d.ts" />

class Provider {
    api = "https://www.dattebayo-br.com"
    headers = { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": this.api,
        "Origin": this.api
    }

    getSettings(): Settings {
        return {
            episodeServers: ["Dattebayo"],
            supportsDub: true,
        }
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const query = encodeURIComponent(opts.query)
        const req = await fetch(`${this.api}/busca?busca=${query}&page=1`, {
            headers: this.headers,
        })
        const html = await req.text()
        const $ = LoadDoc(html)
        
        const results: SearchResult[] = []
        $("div.ultimosAnimesHomeItem").each((_, el) => {
            const a = el.find("a")
            let href = a.attr("href") || ""
            const img = el.find(".ultimosAnimesHomeItemImg img")
            let title = el.find(".ultimosAnimesHomeItemInfosNome").text() || ""
            
            if (href) {
                if (!href.startsWith("http")) href = `${this.api}${href.startsWith("/") ? "" : "/"}${href}`
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
        let targetUrl = id
        if (!targetUrl.startsWith("http")) {
            targetUrl = `${this.api}${targetUrl.startsWith("/") ? "" : "/"}${targetUrl}`
        }

        const baseAnimeUrl = targetUrl.split("/page/")[0].replace(/\/$/, "");

        const episodesMap = new Map<string, EpisodeDetails>();
        let currentPage = 1;

        while (true) {
            const pageUrl = currentPage === 1 ? baseAnimeUrl : `${baseAnimeUrl}/page/${currentPage}`;
            const req = await fetch(pageUrl, { headers: this.headers });
            if (req.status !== 200) break;
            
            const html = await req.text();
            const $ = LoadDoc(html);

            const pageEpisodes = $("div.ultimosEpisodiosHomeItem");
            if (pageEpisodes.length() === 0) break;

            let addedAny = false;

            pageEpisodes.each((_, el) => {
                const a = el.find("a");
                const href = a.attr("href");
                if (!href) return;

                let fullHref = href;
                if (!fullHref.startsWith("http")) fullHref = `${this.api}${fullHref.startsWith("/") ? "" : "/"}${fullHref}`;

                if (episodesMap.has(fullHref)) return;

                const epNumText = el.find(".ultimosEpisodiosHomeItemInfosNum").text().replace("Episódio", "").trim() || "";
                const episodeNumber = parseFloat(epNumText.replace(",", ".")) || 0;
                
                let episodeName = el.find(".ultimosEpisodiosHomeItemInfosNome").text().trim() || "";
                if (!episodeName) episodeName = `Episódio ${epNumText}`;

                episodesMap.set(fullHref, {
                    id: fullHref.replace(this.api, ""),
                    number: episodeNumber,
                    url: fullHref,
                    title: episodeName
                });
                addedAny = true;
            });

            if (!addedAny) break;
            currentPage++;
        }
        
        let results = Array.from(episodesMap.values());
        
        // Ensure episodes are sorted ascending
        results.sort((a, b) => a.number - b.number);
        
        // Fix zero numbers if present
        results.forEach((ep, index) => {
            if (ep.number <= 0) {
                ep.number = index + 1;
            }
        });

        return results;
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
            server: "Dattebayo",
            headers: this.headers,
            videoSources: []
        }

        const activeAbas = $("div.AbasBox div.Aba")
        
        for (let i = 0; i < activeAbas.length(); i++) {
            const aba = activeAbas.eq(i);
            const abaType = aba.attr("aba-type");
            const qualityName = aba.text() || "HD";
            
            if (!abaType) continue;

            const container = $(`#${abaType}`);
            if (!container || container.length() === 0) continue;

            const scriptData = container.find("script").text() || "";
            const vidMatch = scriptData.match(/var vid\s*=\s*['"](.*?)['"]/);
            if (!vidMatch) continue;

            const urlQualidade = vidMatch[1];
            if (!urlQualidade) continue;

            const encodedUrl = encodeURIComponent(urlQualidade);
            const adUrl = `https://ads.animeyabu.net?url=${encodedUrl}`;

            const adHeaders = {
                "User-Agent": this.headers["User-Agent"],
                "Referer": targetUrl,
                "Origin": this.api
            };

            try {
                const adReq = await fetch(adUrl, { headers: adHeaders });
                const adBody = await adReq.text();

                if (adBody.includes("publicidade")) {
                    const jsonArray = JSON.parse(adBody);
                    if (Array.isArray(jsonArray) && jsonArray.length > 0) {
                        const assinatura = jsonArray[0].publicidade || "";
                        if (assinatura) {
                            const urlFinal = urlQualidade + assinatura;
                            result.videoSources.push({
                                url: urlFinal,
                                quality: qualityName,
                                type: "mp4",
                                headers: adHeaders
                            });
                        }
                    }
                }
            } catch (e) {
                console.error("AnimeYabu Ad error:", e);
            }
        }
        
        // Map common quality names to numbers for sorting
        const qualityMap: Record<string, number> = {
            "FULLHD": 1080,
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
