/// <reference path="../../doc/anime-torrent-provider.d.ts" />

class Provider {
    private terms = ["pt", "ptbr", "pt-br", "por-br", "portuguese", "brazilian", "legendado", "dublado", "multi-sub", "multisub"];

    getSettings(): AnimeProviderSettings {
        return {
            canSmartSearch: true,
            smartSearchFilters: ["batch", "episodeNumber", "resolution"],
            supportsAdult: false,
            type: "main",
        }
    }

    async search(opts: AnimeSearchOptions): Promise<AnimeTorrent[]> {
        const query = opts.query || "";
        const promises = [
            this.searchNyaa(query).catch(e => []),
            this.searchAnimeTosho(query).catch(e => []),
            this.searchTokyoToshokan(query).catch(e => []),
            this.searchSubsPlease(query).catch(e => []),
            this.searchAniRena(query).catch(e => []),
            this.searchAcgRip(query).catch(e => []),
            this.searchNekoBT(query).catch(e => []),
            this.searchTorrentClaw(query).catch(e => [])
        ];

        const results = await Promise.all(promises);

        // Apenas usamos \b (word boundary) nas siglas curtas para evitar o bug do "raPTa"
        // Para o resto, deixamos solto para pegar variações como "Multi-Subs"
        const termRegex = new RegExp(`(?:\\bpt\\b|\\bptbr\\b|\\bpt-br\\b|por-br|portuguese|brazilian|legendado|dublado|multi-subs?)`, "i");
        
        let torrents: AnimeTorrent[] = [];
        for (const res of results) {
            if (res && Array.isArray(res)) {
                for (const t of res) {
                    // Filter down to only those that match one of our terms
                    // Some providers (like Nyaa) already filter this at the API level,
                    // but for AnimeTosho and TorrentClaw we MUST filter here.
                    if (termRegex.test(t.name) || termRegex.test(t.releaseGroup || "")) {
                        torrents.push(t);
                    }
                }
            }
        }

        return torrents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    async smartSearch(opts: AnimeSmartSearchOptions): Promise<AnimeTorrent[]> {
        const queriesToTry: string[] = [];
        if (opts.query && queriesToTry.indexOf(opts.query) === -1) queriesToTry.push(opts.query);
        if (opts.media && opts.media.romajiTitle && queriesToTry.indexOf(opts.media.romajiTitle) === -1) queriesToTry.push(opts.media.romajiTitle);
        if (opts.media && opts.media.englishTitle && queriesToTry.indexOf(opts.media.englishTitle) === -1) queriesToTry.push(opts.media.englishTitle);
        if (queriesToTry.length === 0) queriesToTry.push("");

        const searchPromises = [];
        for (const baseQ of queriesToTry) {
            let q = baseQ;
            if (!opts.batch && opts.episodeNumber > 0) {
                const epStr = opts.episodeNumber < 10 ? `0${opts.episodeNumber}` : `${opts.episodeNumber}`;
                q += ` ${epStr}`;
            }
            if (opts.resolution) {
                q += ` ${opts.resolution}`;
            }
            searchPromises.push(this.search({ media: opts.media, query: q }).catch(e => []));
        }

        const resArrays = await Promise.all(searchPromises);
        let allResults: AnimeTorrent[] = [];
        for (const arr of resArrays) {
            if (arr && Array.isArray(arr)) {
                allResults = allResults.concat(arr);
            }
        }

        // Deduplicar resultados com objeto simples (para evitar bugs de Set/Map em engines JS antigas como Goja)
        const results: AnimeTorrent[] = [];
        const seen: { [key: string]: boolean } = {};
        for (const r of allResults) {
            const key = r.link || r.infoHash || r.name;
            if (!seen[key]) {
                seen[key] = true;
                results.push(r);
            }
        }
        
        // Se nossa extensão declara que suporta "episodeNumber" no smartSearchFilters,
        // nós somos obrigados a não retornar lixo que sabemos ser de outro episódio.
        if (opts.batch) {
            // Se for busca de batch (temporada completa)
            return results.filter(t => {
                const name = t.name.toLowerCase();
                // Palavras-chave óbvias
                if (name.includes("batch") || name.includes("completa") || name.includes("complete")) return true;
                
                // Procura por ranges de episódios como 01-12, 01~24, EP01-12
                if (/(?:^|[\[\(\s_])(?:e|ep)?\d{2,3}\s*(?:-|~)\s*(?:e|ep)?\d{2,3}(?:[\]\)\s_]|$)/.test(name) && !name.includes("x264") && !name.includes("h264")) return true;

                // Procura por indicadores de episódio único
                // (ex: "- 05", "E05", "EP05", "Episode 5", "S02E05", "[05]", " 05 ")
                const hasSingleEpisode = /(?:\b(?:e|ep|episode)\s*\d{1,3}\b|\bs\d{1,2}e\d{1,3}\b|\B-\s*\d{1,3}\b|\s\d{2,3}\s*(?:\[|\(|$|\.mkv|\.mp4))/i.test(name);
                
                // Tem a palavra Season ou S01
                const hasSeason = /\b(?:s\d{1,2}|season\s*\d{1,2})\b/i.test(name);

                // Se tem a tag de temporada e não tem um número de episódio isolado, é um batch
                if (hasSeason && !hasSingleEpisode) return true;

                // Se não tem indicador de episódio, podemos considerar batch dependendo do anime
                if (!hasSingleEpisode && opts.media.format !== "MOVIE" && opts.media.episodeCount !== 1) return true;

                return false;
            }).map(t => {
                t.isBatch = true;
                return t;
            });
        }
        
        if (!opts.batch && opts.episodeNumber > 0) {
            const epNum = opts.episodeNumber;

            return results.filter(t => {
                if (t.episodeNumber === epNum) return true;
                if (t.episodeNumber !== -1 && t.episodeNumber !== epNum) return false;

                const name = t.name.toLowerCase();

                // Checa casos como S02E05 ou S2 - 05
                const sMatch = name.match(/\bs(\d{1,2})\s*(?:e|ep|episode|-)\s*0*(\d{1,3})\b/i);
                if (sMatch) {
                    const ep = parseInt(sMatch[2], 10);
                    if (ep !== epNum) return false; // Se o episódio não bate, rejeita
                    return true; // Deixa passar! O Seanime faz o mapeamento de temporada absoluto/relativo.
                }
                
                // Se o provedor não soube o episódio (-1), aplicamos um filtro super rígido de texto:
                // Só passa se tiver "05", "E05", "- 05", etc no título.
                // Note que isso PODE pegar S02E05, e tudo bem! O Seanime faz o mapeamento absoluto/relativo depois.
                const regex = new RegExp(`(?:\\b(?:E|Ep|Episode)\\s*0?${epNum}\\b|(?:^|\\s)-\\s*0?${epNum}\\b|\\s0?${epNum}\\s*(?:\\[|\\(|\\.mkv|\\.mp4|$))`, "i");
                return regex.test(name);
            });
        }
        
        return results;
    }

    async getTorrentInfoHash(torrent: AnimeTorrent): Promise<string> { return torrent.infoHash || ""; }
    async getTorrentMagnetLink(torrent: AnimeTorrent): Promise<string> { return torrent.magnetLink || ""; }

    async getLatest(): Promise<AnimeTorrent[]> {
        const query = "pt-br";
        const promises = [
            this.searchNyaa(query).catch(e => []),
            this.searchAnimeTosho(query).catch(e => []),
            this.searchTokyoToshokan(query).catch(e => []),
            this.searchSubsPlease(query).catch(e => []),
            this.searchAniRena(query).catch(e => []),
            this.searchAcgRip(query).catch(e => []),
            this.searchNekoBT(query).catch(e => []),
            this.searchTorrentClaw(query).catch(e => [])
        ];
        
        const results = await Promise.all(promises);
        let torrents: AnimeTorrent[] = [];
        for (const res of results) {
            if (res && Array.isArray(res)) torrents = torrents.concat(res);
        }
        return torrents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    // --- Fontes Internas ---

    private async searchNyaa(query: string): Promise<AnimeTorrent[]> {
        try {
            const termQuery = this.terms.join("|");
            const q = encodeURIComponent(`${query} (${termQuery})`);
            const url = `https://nyaa.si/?page=rss&q=${q}&c=1_0&f=0`; 
            
            const res = await fetch(url);
            const text = await res.text();
            
            const torrents: AnimeTorrent[] = [];
            const items = text.match(/<item>([\s\S]*?)<\/item>/g) || [];
            for (const item of items) {
                const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/);
                const linkMatch = item.match(/<link>(.*?)<\/link>/);
                if (titleMatch && linkMatch) {
                    torrents.push({
                        name: "[Nyaa] " + titleMatch[1],
                        date: new Date().toISOString(),
                        size: 0,
                        formattedSize: "",
                        seeders: 0,
                        leechers: 0,
                        downloadCount: 0,
                        link: linkMatch[1],
                        infoHash: "",
                        episodeNumber: -1,
                        isBestRelease: false,
                        confirmed: false,
                        resolution: "",
                        isBatch: false
                    });
                }
            }
            return torrents;
        } catch (e) { return []; }
    }

    private async searchAnimeTosho(query: string): Promise<AnimeTorrent[]> {
        try {
            const q = encodeURIComponent(query); 
            const url = `https://feed.animetosho.org/json?q=${q}`;
            const res = await fetch(url);
            const data = await res.json();
            if (!Array.isArray(data)) return [];
            
            return data.map((t: any) => ({
                name: "[AnimeTosho] " + t.title,
                date: new Date(t.timestamp * 1000).toISOString(),
                size: t.total_size,
                formattedSize: "",
                seeders: t.seeders > 30000 ? 0 : t.seeders,
                leechers: t.leechers > 30000 ? 0 : t.leechers,
                downloadCount: t.torrent_download_count,
                link: t.link,
                downloadUrl: t.torrent_url,
                magnetLink: t.magnet_uri,
                infoHash: t.info_hash,
                resolution: "",
                isBatch: false,
                episodeNumber: -1,
                isBestRelease: false,
                confirmed: false
            }));
        } catch (e) { return []; }
    }

    private async searchTokyoToshokan(query: string): Promise<AnimeTorrent[]> {
        try {
            const q = encodeURIComponent(query);
            const url = `https://www.tokyotoshokan.info/rss.php?terms=${q}&type=1&searchName=true`;
            const res = await fetch(url);
            const text = await res.text();
            
            const torrents: AnimeTorrent[] = [];
            const items = text.match(/<item>([\s\S]*?)<\/item>/g) || [];
            for (const item of items) {
                const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/);
                const linkMatch = item.match(/<link>(.*?)<\/link>/);
                if (titleMatch && linkMatch) {
                    torrents.push({
                        name: "[TokyoToshokan] " + titleMatch[1],
                        date: new Date().toISOString(),
                        size: 0,
                        formattedSize: "",
                        seeders: 0,
                        leechers: 0,
                        downloadCount: 0,
                        link: linkMatch[1],
                        infoHash: "",
                        episodeNumber: -1,
                        isBestRelease: false,
                        confirmed: false,
                        resolution: "",
                        isBatch: false
                    });
                }
            }
            return torrents;
        } catch (e) { return []; }
    }



    private async searchSubsPlease(query: string): Promise<AnimeTorrent[]> {
        try {
            const q = encodeURIComponent(query);
            const searchUrl = `https://subsplease.org/api/?f=search&tz=UTC&s=${q}`;
            const response = await fetch(searchUrl);
            const data = await response.json();
            const torrents: AnimeTorrent[] = [];
            if (data && typeof data === 'object') {
                for (const key in data) {
                    const release = data[key];
                    if (release.episode !== "Batch") {
                        for (const download of release.downloads) {
                            torrents.push({
                                name: `[SubsPlease] ${release.show} - ${release.episode} (${download.res}p)`,
                                date: new Date(release.release_date).toISOString(),
                                size: 0,
                                formattedSize: "",
                                seeders: 0,
                                leechers: 0,
                                downloadCount: 0,
                                link: `https://subsplease.org/shows/${release.page}/`,
                                magnetLink: download.magnet,
                                infoHash: "",
                                episodeNumber: parseInt(release.episode),
                                isBestRelease: false,
                                confirmed: false,
                                resolution: download.res + "p",
                                isBatch: false
                            });
                        }
                    }
                }
            }
            return torrents;
        } catch(e) { return []; }
    }

    private async searchAniRena(query: string): Promise<AnimeTorrent[]> {
        try {
            const q = encodeURIComponent(query);
            const url = `https://www.anirena.com/?q=${q}`;
            const res = await fetch(url);
            const html = await res.text();
            const $ = LoadDoc(html);
            const torrents: AnimeTorrent[] = [];
            $("tr[data-torrent-id]").each((_, row) => {
                const titleEl = row.find(".tl-torrent-name").first();
                const title = titleEl.text().trim();
                if (!title) return;
                const linkHref = titleEl.attr("href") || "";
                const magnetHref = row.find("a[href$='/magnet']").first().attr("href") || "";
                torrents.push({
                    name: "[AniRena] " + title,
                    date: new Date().toISOString(),
                    size: 0,
                    formattedSize: "",
                    seeders: 0,
                    leechers: 0,
                    downloadCount: 0,
                    link: "https://www.anirena.com" + linkHref,
                    magnetLink: magnetHref ? (magnetHref.startsWith("http") ? magnetHref : "https://www.anirena.com" + magnetHref) : "",
                    infoHash: "",
                    episodeNumber: -1,
                    isBestRelease: false,
                    confirmed: false,
                    resolution: "",
                    isBatch: false
                });
            });
            return torrents;
        } catch (e) { return []; }
    }

    private async searchAcgRip(query: string): Promise<AnimeTorrent[]> {
        try {
            const q = encodeURIComponent(query);
            const searchUrl = `https://acg.rip/?term=${q}`;
            const response = await fetch(searchUrl);
            const html = await response.text();
            const $ = LoadDoc(html);
            const torrents: AnimeTorrent[] = [];
            $("table.post-index > tbody > tr").each((i, el) => {
                const titleElement = el.find("td.title > span.title > a");
                const name = titleElement.text().trim();
                if (!name) return;
                const link = "https://acg.rip" + titleElement.attr("href");
                const downloadUrl = "https://acg.rip" + el.find("td.action > a").attr("href");
                torrents.push({
                    name: "[ACG.RIP] " + name,
                    date: new Date().toISOString(),
                    size: 0,
                    formattedSize: "",
                    seeders: 0,
                    leechers: 0,
                    downloadCount: 0,
                    link: link,
                    downloadUrl: downloadUrl,
                    magnetLink: "",
                    infoHash: "",
                    episodeNumber: -1,
                    isBestRelease: false,
                    confirmed: false,
                    resolution: "",
                    isBatch: false
                });
            });
            return torrents;
        } catch (e) { return []; }
    }

    private async searchNekoBT(query: string): Promise<AnimeTorrent[]> {
        try {
            const q = encodeURIComponent(query);
            const url = `https://nekobt.to/api/v1/torrents/search?query=${q}&sort_by=best&limit=50`;
            const response = await fetch(url);
            const json = await response.json();
            if (!json || !json.data || !Array.isArray(json.data.results)) return [];
            return json.data.results.map((t: any) => ({
                name: "[NekoBT] " + (t.title || "Unknown"),
                date: new Date(t.uploaded_at || Date.now()).toISOString(),
                size: t.filesize || 0,
                formattedSize: "",
                seeders: t.seeders || 0,
                leechers: t.leechers || 0,
                downloadCount: t.completed || 0,
                link: t.id ? `https://nekobt.to/torrents/${t.id}` : "",
                magnetLink: t.magnet || "",
                infoHash: t.infohash || "",
                episodeNumber: -1,
                isBestRelease: false,
                confirmed: false,
                resolution: "",
                isBatch: !!t.batch
            }));
        } catch (e) { return []; }
    }

    private async searchTorrentClaw(query: string): Promise<AnimeTorrent[]> {
        try {
            const q = encodeURIComponent(query);
            const url = `https://torrentclaw.com/api/v1/search?q=${q}&limit=50&genre=Animation`;
            const response = await fetch(url);
            const data = await response.json();
            if (!data.results) return [];
            const torrents: AnimeTorrent[] = [];
            for (const result of data.results) {
                if (result.torrents && Array.isArray(result.torrents)) {
                    for (const t of result.torrents) {
                        const magnet = t.magnetUrl || (t.infoHash ? `magnet:?xt=urn:btih:${t.infoHash}` : "");
                        let tUrl = t.torrentUrl || "";
                        if (tUrl && !tUrl.startsWith("http")) {
                            tUrl = `https://torrentclaw.com${tUrl.startsWith("/") ? "" : "/"}${tUrl}`;
                        }
                        let ep = -1;
                        if (t.episode !== undefined && t.episode !== null) {
                            ep = t.episode;
                        }
                        torrents.push({
                            name: "[TorrentClaw] " + (t.rawTitle || "Unknown"),
                            date: t.uploadedAt || new Date().toISOString(),
                            size: t.sizeBytes ? parseInt(t.sizeBytes, 10) : 0,
                            formattedSize: "",
                            seeders: t.seeders || 0,
                            leechers: t.leechers || 0,
                            downloadCount: 0,
                            link: tUrl || magnet || "",
                            downloadUrl: tUrl,
                            magnetLink: magnet,
                            infoHash: t.infoHash || "",
                            episodeNumber: ep,
                            resolution: t.quality || "",
                            isBatch: false,
                            isBestRelease: false,
                            confirmed: false,
                            releaseGroup: t.releaseGroup || ""
                        });
                    }
                }
            }
            return torrents;
        } catch (e) { return []; }
    }
}
