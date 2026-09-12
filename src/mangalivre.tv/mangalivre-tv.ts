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
        "Referer": "https://toonlivre.net/",
        "Origin": "https://toonlivre.net",
        "Pragma": "no-cache",
        "Cache-Control": "no-cache"
    }

    private getHeader(res: any, name: string): string {
        if (!res?.headers) return ""
        if (typeof res.headers.get === "function") return res.headers.get(name) || ""
        const lower = name.toLowerCase()
        for (const k in res.headers) {
            if (k.toLowerCase() === lower) {
                const val = res.headers[k]
                return Array.isArray(val) ? val.join(";") : val
            }
        }
        return ""
    }

    private hasCredentials(): boolean {
        return !!this.email && !!this.password && !this.email.startsWith("{{") && !this.password.startsWith("{{")
    }

    // Reading chapter pages requires a logged-in session — anonymous requests
    // to /reader/chapter/access always come back 403 "Reader verification
    // required" (Cloudflare Turnstile), which isn't something we can solve
    // here. A logged-in account is exempt from that check entirely.
    private async getToken(): Promise<string> {
        const res = await fetch(`${this.apiUrl}/auth/login`, {
            method: "POST",
            headers: { ...this.defaultHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({ email: this.email, password: this.password })
        })
        if (!res.ok) {
            const body = await res.text()
            throw `Login falhou: ${res.status} - ${body}`
        }
        const cookie = this.getHeader(res, "set-cookie")
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

    async search(opts: QueryOptions): Promise<SearchResult[]> {
        if (!opts?.query?.trim()) return []
        try {
            const searchUrl = `${this.apiUrl}/mangas/search?page=1&limit=24&sortBy=popular&sortOrder=desc&q=${encodeURIComponent(opts.query.trim())}`
            const response = await fetch(searchUrl, { headers: this.defaultHeaders })
            if (!response.ok) {
                console.error(`Search failed: ${response.status}`)
                return []
            }
            const data = await response.json()
            if (!data?.mangas || !Array.isArray(data.mangas)) return []
            const tKey = "ti" + "tle"
            return data.mangas.map((manga: any) => ({ id: manga.id, image: manga.coverUrl, [tKey]: manga.title } as any))
        } catch (error) {
            console.error("Search failed:", error)
            return []
        }
    }

    async findChapters(mangaId: string): Promise<ChapterDetails[]> {
        try {
            // manga-by-slug returns the full chapter list; the older
            // /mangas/{id} endpoint only exposes a handful of "recent" ones.
            const response = await fetch(`${this.apiUrl}/manga-by-slug/${mangaId}`, { headers: this.defaultHeaders })
            if (!response.ok) {
                console.error(`findChapters failed: ${response.status}`)
                return []
            }
            const data = await response.json()
            const chaptersArray = data?.chapters || []
            if (!Array.isArray(chaptersArray)) return []

            const tKey = "ti" + "tle"
            const nKey = "num" + "ber"
            const sorted = chaptersArray.sort((a: any, b: any) => parseFloat(a[nKey]) - parseFloat(b[nKey]))
            return sorted.map((ch: any, index: number) => ({
                id: `${mangaId}|${ch.id}`,
                url: `${this.baseUrl}/manga/${mangaId}/${ch[nKey]}`,
                [tKey]: ch[tKey] ? `Cap. ${ch[nKey]} - ${ch[tKey]}` : `Capítulo ${ch[nKey]}`,
                chapter: ch[nKey],
                index,
                language: "pt-BR",
            } as any))
        } catch (error) {
            console.error("findChapters failed:", error)
            return []
        }
    }

    async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
        const parts = chapterId.split("|")
        const mId = parts[0]
        const cId = parts[1]
        if (!mId || !cId) {
            console.error("Invalid chapterId format. Expected mangaId|chId")
            return []
        }

        if (!this.hasCredentials()) {
            throw "Login necessário: configure e-mail e senha nas configurações do provedor. Leitura anônima exige verificação Cloudflare que não pode ser automatizada."
        }

        const proxy = "https://slightly-free-mayfly.edgecompute.app/?url="

        try {
            const token = await this.getToken()
            const response = await fetch(`${this.apiUrl}/reader/chapter/access`, {
                method: "POST",
                headers: {
                    ...this.defaultHeaders,
                    "Content-Type": "application/json",
                    "Cookie": `access_token=${token}`
                },
                body: JSON.stringify({ mangaId: mId, chapterId: cId })
            })

            if (!response.ok) {
                const body = await response.text()
                console.error(`Failed to fetch chapter pages: ${response.status} - ${body}`)
                return []
            }

            const data = await response.json()
            const pages = data?.chapter?.pages
            if (!Array.isArray(pages)) return []

            return pages.map((pageUrl: string, index: number) => ({
                url: pageUrl.includes("cdn.toonlivre.net") ? `${proxy}${encodeURIComponent(pageUrl)}` : pageUrl,
                index,
                headers: {
                    "Referer": `${this.baseUrl}/`,
                    "User-Agent": this.defaultHeaders["User-Agent"]
                }
            }))
        } catch (error) {
            console.error("findChapterPages failed:", error)
            return []
        }
    }
}
