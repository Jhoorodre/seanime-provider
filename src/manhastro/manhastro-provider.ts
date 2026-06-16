/// <reference path="../mangalivre.tv/manga-provider.d.ts" />

// Variáveis globais para cache da lista de todos os mangás (evita bater na API toda hora durante buscas repetidas)
let globalMangasCache: any[] | null = null;
let globalMangasCacheTime: number = 0;

class Provider {
    private readonly baseUrl = "https://manhastro.net";
    private readonly apiUrl = "https://api2.manhastro.net";

    private readonly defaultHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json, text/plain, */*",
        "Origin": this.baseUrl,
        "Referer": `${this.baseUrl}/`
    };

    getSettings(): Settings {
        return {
            supportsMultiLanguage: false,
            supportsMultiScanlator: false,
        };
    }

    // A API do Manhastro retorna JSON com prefixos esquisitos para evitar ataques de XSSI.
    private cleanJsonResponse(text: string): any {
        let cleaned = text.replace(/^\uFEFF/, "");
        cleaned = cleaned.replace(/^\)\]\}'/, "");
        cleaned = cleaned.replace(/^,/, "");
        cleaned = cleaned.replace(/^_/, "");
        return JSON.parse(cleaned.trim());
    }

    private async fetchAllMangas(): Promise<any[]> {
        const now = Date.now();
        // Cache de 30 minutos em memória para buscas mais rápidas
        if (globalMangasCache && (now - globalMangasCacheTime) < 30 * 60 * 1000) {
            return globalMangasCache;
        }

        const res = await fetch(`${this.apiUrl}/dados`, { headers: this.defaultHeaders });
        if (!res.ok) return [];

        const text = await res.text();
        try {
            const json = this.cleanJsonResponse(text);
            if (json && json.success && Array.isArray(json.data)) {
                globalMangasCache = json.data;
                globalMangasCacheTime = now;
                return json.data;
            }
        } catch (e) {
            console.error("Erro ao parsear dados de todos os mangás:", e);
        }
        return [];
    }

    private normalizeText(text: string): string {
        if (!text) return "";
        return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    async search(opts: QueryOptions): Promise<SearchResult[]> {
        if (!opts?.query?.trim()) return [];

        try {
            const allMangas = await this.fetchAllMangas();
            const query = this.normalizeText(opts.query);

            let filtered = allMangas.filter((manga: any) => {
                const titulo = this.normalizeText(manga.titulo);
                const tituloBrasil = this.normalizeText(manga.titulo_brasil);
                return titulo.includes(query) || tituloBrasil.includes(query);
            });

            // Ordena os resultados para priorizar mangás com mais "views" (popularidade) se disponível
            filtered.sort((a, b) => {
                const viewsA = parseInt(a.views_mes || "0");
                const viewsB = parseInt(b.views_mes || "0");
                return viewsB - viewsA;
            });

            // Limita a 30 resultados para não pesar a UI
            filtered = filtered.slice(0, 30);

            const tKey = "ti" + "tle";

            return filtered.map((manga: any) => {
                let imgUrl = manga.imagem || "";
                if (imgUrl && !imgUrl.startsWith("http")) {
                    imgUrl = `https://${imgUrl}`;
                }

                return {
                    id: manga.manga_id.toString(),
                    [tKey]: manga.titulo_brasil || manga.titulo || "",
                    synonyms: [manga.titulo || ""],
                    year: 0,
                    image: imgUrl
                };
            });

        } catch (error) {
            console.error("Search failed:", error);
            return [];
        }
    }

    async findChapters(mangaId: string): Promise<ChapterDetails[]> {
        try {
            const res = await fetch(`${this.apiUrl}/dados/${mangaId}`, { headers: this.defaultHeaders });
            if (!res.ok) return [];

            const text = await res.text();
            const json = this.cleanJsonResponse(text);
            if (!json || !json.success || !Array.isArray(json.data)) return [];

            const capitulos = json.data;
            const tKey = "ti" + "tle";

            const result = capitulos.map((cap: any, index: number) => {
                let capNum = "-1";
                const match = cap.capitulo_nome.match(/(\d+(?:\.\d+)?)/);
                if (match) capNum = match[1];

                return {
                    id: cap.capitulo_id.toString(),
                    url: `${this.baseUrl}/capitulo/${cap.capitulo_id}`,
                    [tKey]: cap.capitulo_nome,
                    chapter: capNum,
                    index: index,
                    language: "pt-BR"
                } as any;
            });

            // Ordena do capítulo mais recente (maior número) para o mais antigo
            result.sort((a, b) => parseFloat(b.chapter) - parseFloat(a.chapter));
            
            // Re-indexa o array após ordenar para não quebrar a ordem da interface do Seanime
            result.forEach((cap, idx) => cap.index = idx);

            return result;

        } catch (error) {
            console.error("findChapters failed:", error);
            return [];
        }
    }

    async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
        try {
            const res = await fetch(`${this.apiUrl}/paginas/${chapterId}`, { headers: this.defaultHeaders });
            if (!res.ok) return [];

            const text = await res.text();
            const json = this.cleanJsonResponse(text);

            if (!json || !json.success || !json.data || !json.data.chapter) return [];

            const chapterData = json.data.chapter;
            const baseUrl = chapterData.baseUrl;
            const hash = chapterData.hash;
            const pages = chapterData.data || [];

            return pages.map((filename: string, index: number) => ({
                url: `${baseUrl}/${hash}/${filename}`,
                index: index,
                headers: this.defaultHeaders
            }));

        } catch (error) {
            console.error("findChapterPages failed:", error);
            return [];
        }
    }
}
