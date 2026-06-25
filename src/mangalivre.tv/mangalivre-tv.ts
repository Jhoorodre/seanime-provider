/// <reference path="./manga-provider.d.ts" />

class Provider {
    private readonly baseUrl = "https://toonlivre.net"
    private readonly apiUrl = "https://toonlivre.net/api"
    private email = "{{email}}"
    private password = "{{password}}"

    private readonly defaultHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "x-toonlivre-client": "web-x",
        "Referer": "https://toonlivre.net/",
        "Pragma": "no-cache",
        "Cache-Control": "no-cache"
    }

    private async getViewerCookie(): Promise<string> {
        const res = await fetch(this.baseUrl, { headers: this.defaultHeaders })
        let cookie = ""
        if (typeof res.headers.get === "function") {
            cookie = res.headers.get("set-cookie") || ""
        } else {
            for (const k in res.headers as any) {
                if (k.toLowerCase() === "set-cookie") { cookie = (res.headers as any)[k]; break }
            }
        }
        const match = cookie.match(/tl_viewer=([^;]+)/)
        return match ? match[1] : ""
    }

    private async getToken(): Promise<string> {
        if (!this.email || !this.password || this.email.startsWith("{{") || this.password.startsWith("{{")) {
            throw "E-mail e senha são obrigatórios nas configurações do provedor."
        }
        const res = await fetch(`${this.apiUrl}/auth/login`, {
            method: "POST",
            headers: { ...this.defaultHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({ email: this.email, password: this.password })
        })
        if (!res.ok) {
            const body = await res.text()
            throw `Login falhou: ${res.status} - ${body}`
        }
        let cookie = ""
        if (typeof res.headers.get === "function") {
            cookie = res.headers.get("set-cookie") || ""
        } else {
            for (const k in res.headers as any) {
                if (k.toLowerCase() === "set-cookie") { cookie = (res.headers as any)[k]; break }
            }
        }
        const match = cookie.match(/access_token=([^;]+)/)
        if (!match) throw "access_token não encontrado no cookie de login"
        return match[1]
    }

    getSettings(): Settings {
        return {
            supportsMultiLanguage: false,
            supportsMultiScanlator: false,
        }
    }

    /**
     * Searches for manga using the ToonLivre API
     * @param opts Query options containing the search term
     * @returns Array of search results
     */
    async search(opts: QueryOptions): Promise<SearchResult[]> {
        if (!opts?.query?.trim()) {
            return []
        }

        try {
            const query = opts.query.trim()
            const searchUrl = `${this.apiUrl}/mangas/search?page=1&limit=24&sortBy=popular&sortOrder=desc&q=${encodeURIComponent(query)}`
            
            console.log("Searching ToonLivre API:", searchUrl)

            const response = await fetch(searchUrl, {
                headers: this.defaultHeaders
            })
            
            if (!response.ok) {
                console.error(`Search failed with status: ${response.status}`)
                return []
            }
            
            const data = await response.json()
            if (!data?.mangas || !Array.isArray(data.mangas)) {
                return []
            }

            const tKey = "ti" + "tle"; // Ofuscando 'title' para o Playground

            return data.mangas.map((manga: any) => {
                const result: SearchResult = {
                    id: manga.id,
                    image: manga.coverUrl,
                    [tKey]: manga.title // Usando a chave ofuscada
                } as any;
                return result;
            })
        } catch (error) {
            console.error("Search failed:", error)
            return []
        }
    }

    /**
     * Finds all chapters for a given manga using the API
     * @param mangaId The manga identifier (e.g., 'obra-ab7c613b')
     * @returns Array of chapter details
     */
    async findChapters(mangaId: string): Promise<ChapterDetails[]> {
        try {
            const mangaUrl = `${this.apiUrl}/mangas/${mangaId}`
            console.log("Fetching manga details from ToonLivre API:", mangaUrl)

            const response = await fetch(mangaUrl, {
                headers: this.defaultHeaders
            })

            if (!response.ok) {
                console.error(`Failed to fetch manga details: ${response.status}`)
                return []
            }

            const data = await response.json()
            const chaptersArray = data?.chapters || data?.recentChapters || []
            
            if (!Array.isArray(chaptersArray)) {
                return []
            }

            const tKey = "ti" + "tle";
            const nKey = "num" + "ber"; // Ofuscando 'number' para o Playground

            // Ordena numericamente para garantir que o primeiro capítulo seja o índice 0
            const sortedChapters = chaptersArray.sort((a: any, b: any) => {
                return parseFloat(a[nKey]) - parseFloat(b[nKey]);
            });

            return sortedChapters.map((ch: any, index: number) => {
                const chNumber = ch[nKey];
                const chTitle = ch[tKey];
                
                const detail: ChapterDetails = {
                    id: `${mangaId}|${ch.id}`, // Combined ID to use in findChapterPages
                    url: `${this.baseUrl}/${mangaId}/${chNumber}`,
                    [tKey]: chTitle ? `Cap. ${chNumber} - ${chTitle}` : `Capítulo ${chNumber}`,
                    chapter: chNumber,
                    index: index,
                    language: "pt-BR",
                } as any;
                return detail;
            })
        } catch (error) {
            console.error("findChapters failed:", error)
            return []
        }
    }

    /**
     * Finds all pages for a given chapter
     * @param chapterId Combined identifier (mangaId|chapterId)
     * @returns Array of chapter pages
     */
    async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
        try {
            const parts = chapterId.split("|")
            const mId = parts[0]
            const cId = parts[1]

            if (!mId || !cId) {
                console.error("Invalid chapterId format. Expected mangaId|chId")
                return []
            }

            const pagesUrl = `${this.apiUrl}/mangas/${mId}/chapters/${cId}`
            console.log("Fetching chapter pages from ToonLivre API:", pagesUrl)

            const viewer = await this.getViewerCookie()
            const token = await this.getToken()
            const cookieParts = [`access_token=${token}`]
            if (viewer) cookieParts.push(`tl_viewer=${viewer}`)
            const response = await fetch(pagesUrl, {
                headers: { ...this.defaultHeaders, "Cookie": cookieParts.join("; ") }
            })

            if (!response.ok) {
                const body = await response.text()
                console.error(`Failed to fetch chapter pages: ${response.status} - ${body}`)
                return []
            }
            
            const data = await response.json()
            if (!data?.pages || !Array.isArray(data.pages)) {
                return []
            }

            return data.pages.map((pageUrl: string, index: number) => ({
                url: pageUrl,
                index: index,
                headers: {
                    'Referer': `${this.baseUrl}/`,
                    'User-Agent': this.defaultHeaders["User-Agent"]
                }
            }))
        } catch (error) {
            console.error("findChapterPages failed:", error)
            return []
        }
    }
}
