/// <reference path="../../doc/manga-provider.d.ts" />
/**
 * Pizzaria Scan Provider
 * Desenvolvido por Jhoorodr.
 */
/// <reference path="../../doc/core.d.ts" />
class Provider {
    private api = "https://pizzariacomics.com";
    private headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
    };

    getSettings(): MangaProviderSettings {
        return {
            supportsMultiLanguage: false,
            availableLanguages: ["pt-BR"],
            supportsAdult: true,
        };
    }

    async search(opts: { query: string }): Promise<MangaSearchResult[]> {
        const query = opts.query;
        const req = await fetch(`${this.api}/?s=${encodeURIComponent(query)}`, { headers: this.headers });
        if (!req.ok) return [];
        const html = await req.text();
        const $ = LoadDoc(html);
        const results: MangaSearchResult[] = [];

        $("a[href*='/manga/']").each((_, el) => {
            const url = el.attr("href");
            let title = el.find("h1").text();
            if (title) {
                title = title.trim();
            } else {
                title = el.attr("title");
            }
            let image = el.find("img").attr("src");
            
            if (url && title) {
                const parts = url.split("/manga/");
                let id = "";
                if (parts.length > 1 && parts[1]) {
                    id = parts[1].replace(/\//g, "");
                }

                if (id) {
                    let exists = false;
                    for (let i = 0; i < results.length; i++) {
                        if (results[i].id === id) {
                            exists = true;
                            break;
                        }
                    }
                    if (!exists) {
                        results.push({
                            id: id,
                            title: title,
                            image: image || "",
                        });
                    }
                }
            }
        });

        return results;
    }

    async findChapters(id: string): Promise<MangaChapter[]> {
        const req = await fetch(`${this.api}/manga/${id}/`, { headers: this.headers });
        if (!req.ok) return [];
        const html = await req.text();
        const $ = LoadDoc(html);
        const chapters: MangaChapter[] = [];

        $("#chapter_list a").each((i, el) => {
            const url = el.attr("href");
            
            let title = el.find("span.text-xs").text();
            if (title) {
                title = title.trim();
            } else {
                title = el.text();
                if (title) title = title.trim();
            }
            if (!title) {
                title = "Capítulo";
            }
            
            if (url) {
                let chapterId = url.replace(this.api, "").replace(/\//g, "");
                
                let chapterNum = "0";
                const match = title.match(/(\d+(\.\d+)?)/);
                if (match) {
                    chapterNum = match[1];
                }

                chapters.push({
                    id: chapterId,
                    title: title,
                    url: url,
                    chapter: chapterNum,
                    index: 0,
                });
            }
        });
        
        chapters.reverse();
        chapters.forEach((ch, idx) => { ch.index = idx; });

        return chapters;
    }

    async findChapterPages(id: string): Promise<MangaPage[]> {
        const req = await fetch(`${this.api}/${id}/`, { headers: this.headers });
        if (!req.ok) return [];
        const html = await req.text();
        const $ = LoadDoc(html);
        const pages: MangaPage[] = [];

        $("img#imagech").each((i, el) => {
            const src = el.attr("src") || el.attr("data-src");
            if (src) {
                pages.push({
                    index: i,
                    url: src,
                    headers: {
                        "Referer": `${this.api}/${id}/`
                    }
                });
            }
        });

        return pages;
    }
}
