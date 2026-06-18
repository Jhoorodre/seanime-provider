/// <reference path="../anime-torrent-provider.d.ts" />

class Provider {
    private url = "https://cliente.amigos-share.club";
    // This will be replaced by the user config value "cookie" if set.
    private cookie = "pass=ba6e199608c098d50314de026b212ec4b5cb66e8; uid=3472769; PHPSESSID=cufe1iap5duj61rnqnq6ioiug5;";

    getSettings(): AnimeProviderSettings {
        return {
            canSmartSearch: false,
            smartSearchFilters: [],
            supportsAdult: false,
            type: "main",
        };
    }

    async search(opts: AnimeSearchOptions): Promise<AnimeTorrent[]> {
        return this.fetchTorrents(opts.query);
    }

    async smartSearch(opts: AnimeSmartSearchOptions): Promise<AnimeTorrent[]> {
        // Smart search not supported, but we can fallback to normal search
        return this.fetchTorrents(opts.query || opts.media.englishTitle || opts.media.romajiTitle || "");
    }

    async getTorrentInfoHash(torrent: AnimeTorrent): Promise<string> {
        return torrent.infoHash || "";
    }

    async getTorrentMagnetLink(torrent: AnimeTorrent): Promise<string> {
        return torrent.magnetLink || "";
    }

    async getLatest(): Promise<AnimeTorrent[]> {
        return this.fetchTorrents("");
    }

    private async fetchTorrents(query: string): Promise<AnimeTorrent[]> {
        const q = encodeURIComponent(query);
        // c69=1 is the category for anime based on the Amigos Share Club mapping
        const searchUrl = `${this.url}/torrents-search.php?search=${q}&c69=1`;
        
        let torrents: AnimeTorrent[] = [];
        for (let page = 0; page < 3; page++) {
            const pageUrl = page > 0 ? `${searchUrl}&page=${page}` : searchUrl;
            try {
                const res = await fetch(pageUrl, {
                    headers: {
                        "Cookie": this.cookie,
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
                    }
                });
                
                if (!res.ok) {
                    break;
                }

                const html = await res.text();
                
                const items = html.match(/<li class="list-group-item[^>]*>([\s\S]*?)<\/li>/gi);
                if (!items) break;

                for (const item of items) {
                    const titleMatch = item.match(/<a[^>]*href=["']([^"']*torrents-details\.php\?id=[^"']+)["'][^>]*>(.*?)<\/a>/i);
                    const dlMatch = item.match(/<a[^>]*href=["'](download\.php\?id=[^"']+)["']/i);
                    const sizeMatch = item.match(/([\d\.]+\s*[KMGTP]B)/i);
                    const controlsMatch = item.match(/class="list-group-item-controls"([\s\S]*?)<\/div>/i);
                    
                    let name = "";
                    let link = "";
                    let dlLink = "";
                    let sizeStr = "";
                    let seeders = 0;
                    let leechers = 0;

                    if (titleMatch) {
                        link = titleMatch[1].startsWith('http') ? titleMatch[1] : `${this.url}/${titleMatch[1]}`;
                        name = titleMatch[2].replace(/<[^>]+>/g, '').trim();
                    }
                    if (dlMatch) {
                        dlLink = dlMatch[1].startsWith('http') ? dlMatch[1] : `${this.url}/${dlMatch[1]}`;
                    }
                    if (sizeMatch) {
                        sizeStr = sizeMatch[1];
                    }
                    
                    if (controlsMatch) {
                        const nums = Array.from(controlsMatch[1].matchAll(/<br>\s*(\d+)\s*<\/a>/gi));
                        if (nums.length >= 2) {
                            seeders = parseInt(nums[0][1] || "0");
                            leechers = parseInt(nums[1][1] || "0");
                        }
                    } else {
                        const nums = Array.from(item.matchAll(/>\s*(\d+)\s*</g));
                        if (nums.length >= 2) {
                            seeders = parseInt(nums[nums.length - 2][1] || "0");
                            leechers = parseInt(nums[nums.length - 1][1] || "0");
                        }
                    }

                    if (name && dlLink) {
                        torrents.push({
                            name: name,
                            date: new Date().toISOString(),
                            size: this.parseSize(sizeStr),
                            formattedSize: sizeStr,
                            seeders: seeders,
                            leechers: leechers,
                            downloadCount: 0,
                            link: link,
                            downloadUrl: dlLink,
                            magnetLink: "",
                            infoHash: "",
                            resolution: "",
                            isBatch: false,
                            episodeNumber: -1,
                            isBestRelease: false,
                            confirmed: false,
                        });
                    }
                }
            } catch (e) {
                break;
            }
        }
        return torrents;
    }

    private parseSize(sizeStr: string): number {
        const match = sizeStr.match(/([\d\.]+)\s*([KMGTP]B)/i);
        if (!match) return 0;
        const val = parseFloat(match[1]);
        const unit = match[2].toUpperCase();
        if (unit === 'KB') return Math.floor(val * 1024);
        if (unit === 'MB') return Math.floor(val * 1024 * 1024);
        if (unit === 'GB') return Math.floor(val * 1024 * 1024 * 1024);
        if (unit === 'TB') return Math.floor(val * 1024 * 1024 * 1024 * 1024);
        return Math.floor(val);
    }
}
