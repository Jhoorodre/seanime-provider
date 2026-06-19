/// <reference path="../../doc/manga-provider.d.ts" />
/**
 * Cubari Provider
 * Desenvolvido por Jhoorodr.
 * 
 * Este provedor nao possui catalogo proprio. Ele converte links do Imgur, Reddit,
 * ImgChest, Catbox e Gist para ler perfeitamente via API do Cubari.moe.
 */

let globalRsCache: any[] | null = null;
let globalRsCacheTime = 0;

class Provider {
    private readonly baseUrl = "https://cubari.moe";
    private readonly headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Origin": "https://cubari.moe",
        "Referer": "https://cubari.moe/",
        "Cookie": ""
    };

    getSettings(): MangaProviderSettings {
        return {
            supportsMultiLanguage: true,
            availableLanguages: ["pt-BR", "en", "es"],
            supportsAdult: true, // Many imgur/reddit links might be adult
        };
    }

    private extractSourceAndSlug(query: string): { source: string, slug: string } | null {
        query = query.trim();
        
        if (query.startsWith("cubari:")) {
            const parts = query.substring(7).split("/");
            if (parts.length >= 2) return { source: parts[0], slug: parts[1] };
            return null;
        }

        if (!query.startsWith("http://") && !query.startsWith("https://")) {
            return null;
        }

        try {
            const url = new URL(query);
            const host = url.hostname;
            const pathSegments = url.pathname.split("/").filter(s => s.length > 0);

            if (host.endsWith("imgur.com") && pathSegments.length >= 2 && (pathSegments[0] === "a" || pathSegments[0] === "gallery")) {
                return { source: "imgur", slug: pathSegments[1] };
            } else if (host.endsWith("reddit.com") && pathSegments.length >= 2) {
                if (pathSegments[0] === "gallery") {
                    return { source: "reddit", slug: pathSegments[1] };
                } else if (pathSegments.includes("comments")) {
                    const idx = pathSegments.indexOf("comments");
                    if (idx + 1 < pathSegments.length) {
                        return { source: "reddit", slug: pathSegments[idx + 1] };
                    }
                }
            } else if ((host === "imgchest.com" || host.endsWith(".imgchest.com")) && pathSegments.length >= 2 && pathSegments[0] === "p") {
                return { source: "imgchest", slug: pathSegments[1] };
            } else if (host.endsWith("catbox.moe") && pathSegments.length >= 2 && pathSegments[0] === "c") {
                return { source: "catbox", slug: pathSegments[1] };
            } else if (host.endsWith("cubari.moe") && pathSegments.length >= 2 && pathSegments[0] === "read") {
                return { source: pathSegments[1], slug: pathSegments[2] };
            } else if (host.endsWith(".githubusercontent.com")) {
                const src = host.split(".")[0];
                const path = url.pathname;
                const encoded = btoa(`${src}${path}`).replace(/=/g, "");
                return { source: "gist", slug: encoded };
            } else if (host === "gist.github.com" && pathSegments.length >= 2) {
                // Direct gist url fallback
                const src = pathSegments[0];
                const path = `/${pathSegments[0]}/${pathSegments[1]}/raw`;
                const encoded = btoa(`${src}${path}`).replace(/=/g, "");
                return { source: "gist", slug: encoded };
            }
        } catch (e) {
            return null;
        }

        return null;
    }

    async search(opts: any): Promise<any[]> {
        const query = (typeof opts === "string" ? opts : opts.query) || "";
        
        try {
            // Suporte para o banco de dados remoto do usuario configurado nas Settings da Extensao
            const remoteStorageUrl: string = "{{remoteStorageUrl}}";
            const rsHref: string = "{{rsHref}}";
            const rsToken: string = "{{rsToken}}";
            
            const currentHeaders: Record<string, string> = { ...this.headers };

            let dbList: any[] = [];

            // 1. Gist/Raw estatico
            if (remoteStorageUrl && remoteStorageUrl.startsWith("http")) {
                try {
                    const res = await fetch(remoteStorageUrl, { headers: currentHeaders });
                    if (res.ok) {
                        const data = await res.json();
                        let list: any[] = [];
                        
                        if (data.mangas && typeof data.mangas === "object") {
                            // Formato 2: Hub Index JSON
                            const mangasArray = Object.values(data.mangas);
                            for (const m of mangasArray) {
                                const chap = (m as any).chapters && (m as any).chapters[0] ? (m as any).chapters[0] : {};
                                list.push({
                                    title: (m as any).title || chap.title,
                                    url: chap.url ? chap.url.replace("https://cubari.moe", "") : "",
                                    coverUrl: chap.cover_url || chap.cover
                                });
                            }
                        } else if (data.title && data.chapters) {
                            // Formato 1: Single Manga JSON
                            let url = "";
                            if (typeof btoa === "function") {
                                let rawPath = remoteStorageUrl;
                                if (rawPath.startsWith("https://raw.githubusercontent.com/")) {
                                    rawPath = rawPath.replace("https://raw.githubusercontent.com/", "raw/");
                                } else if (rawPath.startsWith("https://gist.githubusercontent.com/")) {
                                    rawPath = rawPath.replace("https://gist.githubusercontent.com/", "");
                                }
                                url = `/read/gist/${btoa(rawPath)}/`;
                            }
                            
                            list.push({
                                title: data.title,
                                url: url,
                                coverUrl: data.cover || data.coverUrl || "https://cubari.moe/static/favicon.png"
                            });
                        } else {
                            // Formato fallback (Array genérico)
                            list = Array.isArray(data) ? data : (data.data || Object.values(data) || []);
                        }
                        
                        dbList.push(...list);
                    }
                } catch (e) {
                    // Ignore error
                }
            }

            // 2. RemoteStorage dinamico (Via Token)
            if (rsHref && rsToken && rsHref.startsWith("http")) {
                if (globalRsCache && (Date.now() - globalRsCacheTime < 3600000)) {
                    // Usa cache de 1 hora
                    dbList.push(...globalRsCache);
                } else {
                    try {
                        const baseUrl = rsHref.endsWith("/") ? rsHref : rsHref + "/";
                        const folderUrl = `${baseUrl}cubari/series/`;
                        
                        const res = await fetch(folderUrl, {
                            headers: { ...currentHeaders, "Authorization": `Bearer ${rsToken}` }
                        });
                        
                        if (res.ok) {
                            const data = await res.json();
                            const items = data.items || {};
                            const fileKeys = Object.keys(items);
                            
                            const results: any[] = [];
                            for (const key of fileKeys) {
                                try {
                                    const fileRes = await fetch(`${folderUrl}${key}`, {
                                        headers: { ...currentHeaders, "Authorization": `Bearer ${rsToken}` }
                                    });
                                    if (fileRes.ok) {
                                        results.push(await fileRes.json());
                                    }
                                } catch(e) {}
                            }
                            
                            globalRsCache = results;
                            globalRsCacheTime = Date.now();
                            dbList.push(...results);
                        }
                    } catch(e) {
                        // Ignora
                    }
                }
            }

            if (dbList.length > 0) {
                const filtered = dbList.filter((m: any) => m.title && m.title.toLowerCase().includes(query.toLowerCase()));
                
                if (filtered.length > 0) {
                    return filtered.map((m: any) => ({
                        id: m.url, // "/read/imgur/xyz/"
                        title: m.title || "Unknown Title",
                        image: m.coverUrl || m.cover || "https://cubari.moe/static/favicon.png",
                    }));
                }
            }

            const target = this.extractSourceAndSlug(query);
            
            if (!target) {
                return [];
            }

            // Fetch do json da API
            const apiUrl = `${this.baseUrl}/read/api/${target.source}/series/${target.slug}/`;
            const apiRes = await fetch(apiUrl, { headers: this.headers });
            if (!apiRes.ok) {
                return [];
            }

            const apiData = await apiRes.json();
            
            return [
                {
                    id: `/read/${target.source}/${target.slug}/`, // Guardamos o path completo como ID
                    title: apiData.title || "Unknown Title",
                    image: apiData.coverUrl || apiData.cover || "https://cubari.moe/static/favicon.png",
                }
            ];
        } catch (globalError) {
            // Em caso de qualquer pane catastrofica (como limits de memoria ou falha de JSON), retorna array vazio
            return [];
        }
    }

    async findChapters(id: string): Promise<MangaChapter[]> {
        if (id === "error") return [];

        let source = "";
        let slug = "";

        // Tenta extrair da URL direto (caso o usuario cole a URL direto no campo de ID para testar)
        const target = this.extractSourceAndSlug(id);
        if (target) {
            source = target.source;
            slug = target.slug;
        } else {
            // id padrao eh no formato `/read/source/slug/`
            const parts = id.split("/").filter(s => s.length > 0);
            if (parts.length >= 3 && parts[0] === "read") {
                source = parts[1];
                slug = parts[2];
            } else {
                return [];
            }
        }

        const apiUrl = `${this.baseUrl}/read/api/${source}/series/${slug}/`;
        const res = await fetch(apiUrl, { headers: this.headers });
        
        if (!res.ok) {
            return [];
        }

        const data = await res.json();
        const groups = data.groups || {};
        const chaptersData = data.chapters || {};

        const chapters: MangaChapter[] = [];

        for (const [chapterNum, chapterObj] of Object.entries(chaptersData) as any) {
            const chapGroups = chapterObj.groups || {};
            const volume = chapterObj.volume && chapterObj.volume !== "Uncategorized" && chapterObj.volume !== "null" ? chapterObj.volume : null;
            const title = chapterObj.title || "";
            
            for (const [groupNum, groupData] of Object.entries(chapGroups) as any) {
                const releaseDateObj = chapterObj.release_date || {};
                const releaseDate = releaseDateObj[groupNum] ? new Date(releaseDateObj[groupNum] * 1000).toISOString() : new Date().toISOString();
                
                const groupName = groups[groupNum] || "Scanlator";
                
                let name = "";
                if (volume) name += `Vol.${volume} `;
                name += `Ch.${chapterNum}`;
                if (title) name += ` - ${title}`;

                // Se groupData for um array, as paginas estao direto nele e a url seria `/read/source/slug/chapterNum/groupNum`
                // Sendo que para o findChapterPages nós podemos simplesmente retornar isso como ID para dar match no backend
                let chapId = "";
                if (Array.isArray(groupData)) {
                    chapId = `/read/${source}/${slug}/${chapterNum}/${groupNum}`;
                } else {
                    // Eh uma string URL direto
                    chapId = groupData;
                }

                chapters.push({
                    id: chapId,
                    providerId: "cubari",
                    title: name,
                    number: parseFloat(chapterNum) || 0,
                    url: `${this.baseUrl}/read/${source}/${slug}/${chapterNum}/${groupNum}`,
                    scanlator: groupName,
                    updatedAt: releaseDate,
                });
            }
        }

        // Ordenar decrecente por numero do capitulo
        chapters.sort((a, b) => b.number - a.number);

        return chapters;
    }

    async findChapterPages(id: string): Promise<MangaPage[]> {
        // Se a ID comeca com HTTP, eh um arquivo direto (pode acontecer, mas nao nesse caso do JSON)
        if (id.startsWith("http")) {
            // Em cubari isso ocorre se ele mandar as paginas numa url externa (nao mt comum)
            const res = await fetch(id, { headers: this.headers });
            if (!res.ok) return [];
            const data = await res.json();
            if (Array.isArray(data)) {
                return data.map((item, i) => ({
                    index: i,
                    url: typeof item === "string" ? item : (item.src || item.url || ""),
                    headers: this.headers
                }));
            }
            return [];
        }

        // Senao, a id eh `/read/source/slug/chapterNum/groupNum`
        const parts = id.split("/").filter(s => s.length > 0);
        if (parts.length < 5) return [];

        const source = parts[1];
        const slug = parts[2];
        const chapterNum = parts[3];
        const groupNum = parts[4];

        const apiUrl = `${this.baseUrl}/read/api/${source}/series/${slug}/`;
        const res = await fetch(apiUrl, { headers: this.headers });
        
        if (!res.ok) return [];

        const data = await res.json();
        const chaptersData = data.chapters || {};
        
        let chapterObj = chaptersData[chapterNum];
        // Workaround caso o chapterNum na API esteja como inteiro sem decimais (ex: 84 ao invez de 084)
        if (!chapterObj) {
            const stripped = chapterNum.replace(/^0+(?!\.|$)/, "");
            chapterObj = chaptersData[stripped];
        }
        
        if (!chapterObj) return [];

        const chapGroups = chapterObj.groups || {};
        const groupData = chapGroups[groupNum];

        if (!groupData || !Array.isArray(groupData)) return [];

        return groupData.map((item, i) => {
            const url = typeof item === "string" ? item : (item.src || item.url || "");
            return {
                index: i,
                url: url,
                headers: this.headers
            };
        });
    }
}
