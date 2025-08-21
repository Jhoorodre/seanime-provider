/// <reference path="./manga-provider.d.ts" />

class Provider {
    private baseUrl = "https://mangalivre.tv"
    
    getSettings(): Settings {
        return {
            supportsMultiLanguage: false,
            supportsMultiScanlator: false,
        }
    }

    async search(opts: QueryOptions): Promise<SearchResult[]> {
        try {
            const query = opts.query
            // Reverting to scraping the search page. The API endpoint is not publicly available (returns 404).
            const searchUrl = `${this.baseUrl}/?s=${encodeURIComponent(query)}&post_type=wp-manga`
            console.log("Searching manga on MangaLivre via HTML scraping:", searchUrl)

            const response = await fetch(searchUrl)
            if (!response.ok) {
                console.error(`HTTP error on search page! status: ${response.status}`)
                return []
            }
            
            const html = await response.text()
            const $ = LoadDoc(html)
            
            const results: SearchResult[] = []
            
            // The selector for each item in the search results list.
            $(".search-lists .manga__item").each((i: number, element: any) => {
                try {
                    const linkElement = element.find("h2 a")
                    if (linkElement.length() === 0) return;

                    // Safely extract href and title, ensuring they are strings.
                    const href = String(linkElement.attr("href") || "").trim()
                    const title = String(linkElement.text() || "").trim()

                    if (!title || !href) {
                        console.warn("Skipping a search result item due to missing title or href.")
                        return;
                    }

                    // The mangaId is the slug from the URL, e.g., "dandadan" from "/manga/dandadan/"
                    const idMatch = href.match(/\/manga\/([^\/]+)\//)
                    const mangaId = idMatch ? idMatch[1] : null
                    if (!mangaId) {
                        console.warn("Skipping a search result item due to invalid manga ID in href:", href)
                        return;
                    }

                    // Safely extract the image URL.
                    let imageUrl: string | undefined = undefined
                    const imgElement = element.find(".manga__thumb img")
                    if (imgElement.length() > 0) {
                        // Prefer 'data-src' for lazy-loaded images, fallback to 'src'.
                        const src = String(imgElement.attr("data-src") || imgElement.attr("src") || "").trim()
                        if (src) {
                            imageUrl = src.startsWith("//") ? "https:" + src : src
                        }
                    }
                    
                    results.push({ id: mangaId, title: title, image: imageUrl })
                } catch (e) {
                    console.error("Error processing a single search result item:", e)
                }
            })
            
            if (results.length === 0) {
                console.log("No valid manga results parsed from the page for query:", query)
                return []
            }

            return results
        } catch (error) {
            console.error("The entire search function failed:", error)
            return []
        }
    }
    
    async findChapters(mangaId: string): Promise<ChapterDetails[]> {
        try {
            if (!/[a-zA-Z-]/.test(mangaId)) {
                console.error(`Invalid mangaId: "${mangaId}". It should be a URL slug (e.g., 'dandadan'), not a number.`);
                return [];
            }

            const mangaUrl = `${this.baseUrl}/manga/${mangaId}/`;
            console.log("Finding chapters for:", mangaUrl);

            // 1. Busca a página do manga (opcional, só para garantir que o slug existe)
            const response = await fetch(mangaUrl);
            if (!response.ok) {
                console.error(`HTTP error! status: ${response.status}`);
                return [];
            }

            // 2. Faz POST para o endpoint AJAX correto
            const ajaxUrl = `${this.baseUrl}/manga/${mangaId}/ajax/chapters/`;
            const chaptersResponse = await fetch(ajaxUrl, {
                method: "POST",
                headers: {
                    "Referer": mangaUrl,
                    "X-Requested-With": "XMLHttpRequest",
                    "User-Agent": "Mozilla/5.0",
                    "Accept": "*/*",
                }
            });

            if (chaptersResponse.ok) {
                const chaptersHtml = await chaptersResponse.text();
                const $chapters = LoadDoc(chaptersHtml);
                const elements = $chapters(".wp-manga-chapter");
                if (elements.length() > 0) {
                    console.log("Successfully fetched chapters via AJAX.");
                    const chapters = this.parseChapters(elements);
                    return this.sortAndIndexChapters(chapters);
                }
            } else {
                console.error(`AJAX error for chapters! status: ${chaptersResponse.status}. Proceeding to fallback.`);
            }

            // 3. Fallback: scraping direto do HTML
            const html = await response.text();
            const $ = LoadDoc(html);
            const directElements = $(".listing-chapters_wrap .wp-manga-chapter");
            if (directElements.length() > 0) {
                const chapters = this.parseChapters(directElements);
                return this.sortAndIndexChapters(chapters);
            }

            console.error("Failed to find chapters using all available methods.");
            return [];
        } catch (error) {
            console.error("findChapters failed:", error);
            return [];
        }
    }

    private parseChapters(elements: any): ChapterDetails[] {
        const chapters: ChapterDetails[] = []
        elements.each((i: number, element: any) => {
            try {
                const linkElement = element.find("a")
                if (linkElement.length() === 0) return;

                const title = String(linkElement.text() || "").trim()
                const href = String(linkElement.attr("href") || "").trim()

                if (title && href) {
                    const chapterMatch = title.match(/cap[íi]tulo\s*([\d\.,]+)/i) ||
                        href.match(/capitulo-([\d\.,]+)/i)

                    if (chapterMatch && chapterMatch[1]) {
                        const chapterNum = chapterMatch[1]
                        chapters.push({
                            id: href,
                            url: href,
                            title: title,
                            chapter: chapterNum,
                            index: 0, // Will be set after sorting
                                language: "pt-BR",
                        })
                    }
                }
            } catch (elementError) {
                console.error("Error processing a chapter element:", elementError)
            }
        })
        return chapters;
    }

    private sortAndIndexChapters(chapters: ChapterDetails[]): ChapterDetails[] {
        chapters.sort((a, b) => {
            const numA = parseFloat(a.chapter.replace(',', '.'))
            const numB = parseFloat(b.chapter.replace(',', '.'))
            return numA - numB
        })

        return chapters.map((chapter, index) => ({
            ...chapter,
            index: index,
        }));
    }
    
    async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
        try {
            // Adiciona uma verificação para garantir que o chapterId é uma URL válida.
            // O erro "unsupported protocol scheme" acontece se um ID inválido (como "1") for passado.
            if (!chapterId.startsWith("http")) {
                console.error(`Invalid chapterId: "${chapterId}". It must be a full URL.`)
                return []
            }
            const chapterUrl = chapterId
            console.log("Finding pages for:", chapterUrl)
            
            const response = await fetch(chapterUrl)
            if (!response.ok) {
                console.error(`HTTP error! status: ${response.status}`)
                return []
            }
            
            const html = await response.text()
            const $ = LoadDoc(html)

            let elements = $(".reading-content img")
            if (elements.length() === 0) {
                elements = $(".manga-reading img")
            }
            if (elements.length() === 0) {
                elements = $(".manga-page img")
            }

            const count = elements.length()
            if (count === 0) {
                return []
            }

            const results: ChapterPage[] = []

            elements.each((i: number, element: any) => {
                try {
                    // Safely extract the image URL, preferring 'data-src' for lazy-loaded images.
                    // The 'element' is already a selection, no need to wrap it with $().
                    const src = String(element.attr("data-src") || element.attr("src") || "").trim();
                    if (src) {
                        results.push({
                            url: src,
                            index: i,
                            headers: {
                                'Referer': chapterUrl,
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            },
                        })
                    }
                } catch (elementError) {
                    console.error("Error processing a page element:", elementError)
                }
            })

            return results
        } catch (error) {
            console.error("findChapterPages failed:", error)
            return []
        }
    }
}