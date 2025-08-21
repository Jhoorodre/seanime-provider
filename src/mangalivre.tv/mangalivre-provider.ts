/// <reference path="./manga-provider.d.ts" />

/**
 * MangaLivre Provider for manga search and chapter retrieval
 * Supports both AJAX and HTML scraping methods
 */
class Provider {
    private readonly baseUrl = "https://mangalivre.tv"
    
    // CSS Selectors
    private readonly selectors = {
        search: {
            container: ".search-lists .manga__item",
            title: "h2 a",
            image: ".manga__thumb img"
        },
        chapters: {
            list: ".wp-manga-chapter",
            listingWrap: ".listing-chapters_wrap .wp-manga-chapter",
            link: "a"
        },
        pages: {
            content: ".reading-content img",
            reading: ".manga-reading img",
            page: ".manga-page img"
        }
    }
    
    // HTTP Headers
    private readonly defaultHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
    }
    
    // Regex Patterns
    private readonly patterns = {
        mangaId: /\/manga\/([^\/]+)\//,
        chapter: /cap[íi]tulo\s*([\d\.,]+)/i,
        chapterUrl: /capitulo-([\d\.,]+)/i
    }
    
    /**
     * Returns provider configuration settings
     */
    getSettings(): Settings {
        return {
            supportsMultiLanguage: false,
            supportsMultiScanlator: false,
        }
    }

    /**
     * Searches for manga using the provided query
     * @param opts Query options containing the search term
     * @returns Array of search results
     */
    async search(opts: QueryOptions): Promise<SearchResult[]> {
        if (!opts?.query?.trim()) {
            console.warn("Empty or invalid search query provided")
            return []
        }

        try {
            const query = opts.query.trim()
            const searchUrl = this.buildSearchUrl(query)
            console.log("Searching manga on MangaLivre via HTML scraping:", searchUrl)

            const response = await this.fetchWithRetry(searchUrl)
            if (!response) return []
            
            const html = await response.text()
            const $ = LoadDoc(html)
            
            return this.parseSearchResults($)
        } catch (error) {
            console.error("Search function failed:", error)
            return []
        }
    }
    
    /**
     * Builds the search URL for a given query
     * @param query The search term
     * @returns Formatted search URL
     */
    private buildSearchUrl(query: string): string {
        return `${this.baseUrl}/?s=${encodeURIComponent(query)}&post_type=wp-manga`
    }

    /**
     * Fetches a URL with basic retry logic and error handling
     * @param url The URL to fetch
     * @param retries Number of retry attempts (default: 1)
     * @returns Response object or null if failed
     */
    private async fetchWithRetry(url: string, retries: number = 1): Promise<Response | null> {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const response = await fetch(url, {
                    headers: this.defaultHeaders
                })
                
                if (!response.ok) {
                    console.error(`HTTP error! status: ${response.status} on attempt ${attempt + 1}`)
                    if (attempt === retries) return null
                    continue
                }
                
                return response
            } catch (error) {
                console.error(`Fetch attempt ${attempt + 1} failed:`, error)
                if (attempt === retries) return null
            }
        }
        return null
    }

    /**
     * Parses search results from HTML
     * @param $ jQuery-like document object
     * @returns Array of parsed search results
     */
    private parseSearchResults($: any): SearchResult[] {
        const results: SearchResult[] = []
        
        $(this.selectors.search.container).each((_: number, element: any) => {
            try {
                const searchResult = this.parseSearchResultItem(element)
                if (searchResult) {
                    results.push(searchResult)
                }
            } catch (error) {
                console.error("Error processing search result item:", error)
            }
        })
        
        if (results.length === 0) {
            console.log("No valid manga results found")
        }
        
        return results
    }

    /**
     * Parses a single search result item
     * @param element The HTML element to parse
     * @returns Parsed search result or null if invalid
     */
    private parseSearchResultItem(element: any): SearchResult | null {
        const linkElement = element.find(this.selectors.search.title)
        if (linkElement.length() === 0) return null

        const href = String(linkElement.attr("href") || "").trim()
        const title = String(linkElement.text() || "").trim()

        if (!title || !href) {
            console.warn("Skipping search result: missing title or href")
            return null
        }

        const mangaId = this.extractMangaId(href)
        if (!mangaId) {
            console.warn("Skipping search result: invalid manga ID in href:", href)
            return null
        }

        const imageUrl = this.extractImageUrl(element)
        
        return { id: mangaId, title: title, image: imageUrl }
    }

    /**
     * Extracts manga ID from URL
     * @param href The URL to extract from
     * @returns Manga ID or null if not found
     */
    private extractMangaId(href: string): string | null {
        const idMatch = href.match(this.patterns.mangaId)
        return idMatch ? idMatch[1] : null
    }

    /**
     * Extracts image URL from element
     * @param element The HTML element containing the image
     * @returns Image URL or undefined if not found
     */
    private extractImageUrl(element: any): string | undefined {
        const imgElement = element.find(this.selectors.search.image)
        if (imgElement.length() === 0) return undefined

        const src = String(imgElement.attr("data-src") || imgElement.attr("src") || "").trim()
        if (!src) return undefined

        return src.startsWith("//") ? "https:" + src : src
    }
    
    /**
     * Finds all chapters for a given manga
     * @param mangaId The manga identifier (URL slug)
     * @returns Array of chapter details
     */
    async findChapters(mangaId: string): Promise<ChapterDetails[]> {
        if (!this.isValidMangaId(mangaId)) {
            console.error(`Invalid mangaId: "${mangaId}". It should be a URL slug (e.g., 'dandadan'), not a number.`)
            return []
        }

        try {
            const mangaUrl = `${this.baseUrl}/manga/${mangaId}/`
            console.log("Finding chapters for:", mangaUrl)

            const response = await this.fetchWithRetry(mangaUrl)
            if (!response) return []

            // Try AJAX method first
            const ajaxChapters = await this.fetchChaptersViaAjax(mangaId, mangaUrl)
            if (ajaxChapters.length > 0) {
                return this.sortAndIndexChapters(ajaxChapters)
            }

            // Fallback to HTML scraping
            const html = await response.text()
            const $ = LoadDoc(html)
            const directElements = $(this.selectors.chapters.listingWrap)
            
            if (directElements.length() > 0) {
                const chapters = this.parseChapters(directElements)
                return this.sortAndIndexChapters(chapters)
            }

            console.error("Failed to find chapters using all available methods")
            return []
        } catch (error) {
            console.error("findChapters failed:", error)
            return []
        }
    }

    /**
     * Validates manga ID format
     * @param mangaId The manga ID to validate
     * @returns True if valid, false otherwise
     */
    private isValidMangaId(mangaId: string): boolean {
        return /[a-zA-Z-]/.test(mangaId)
    }

    /**
     * Attempts to fetch chapters via AJAX endpoint
     * @param mangaId The manga identifier
     * @param refererUrl The referer URL for the request
     * @returns Array of chapter details
     */
    private async fetchChaptersViaAjax(mangaId: string, refererUrl: string): Promise<ChapterDetails[]> {
        try {
            const ajaxUrl = `${this.baseUrl}/manga/${mangaId}/ajax/chapters/`
            const chaptersResponse = await fetch(ajaxUrl, {
                method: "POST",
                headers: {
                    ...this.defaultHeaders,
                    "Referer": refererUrl,
                    "X-Requested-With": "XMLHttpRequest",
                }
            })

            if (chaptersResponse.ok) {
                const chaptersHtml = await chaptersResponse.text()
                const $chapters = LoadDoc(chaptersHtml)
                const elements = $chapters(this.selectors.chapters.list)
                
                if (elements.length() > 0) {
                    console.log("Successfully fetched chapters via AJAX")
                    return this.parseChapters(elements)
                }
            } else {
                console.error(`AJAX error for chapters! status: ${chaptersResponse.status}. Proceeding to fallback.`)
            }
        } catch (error) {
            console.error("AJAX chapter fetch failed:", error)
        }
        
        return []
    }

    /**
     * Parses chapter elements from HTML
     * @param elements The HTML elements containing chapter information
     * @returns Array of chapter details
     */
    private parseChapters(elements: any): ChapterDetails[] {
        const chapters: ChapterDetails[] = []
        
        elements.each((_: number, element: any) => {
            try {
                const chapterDetails = this.parseChapterElement(element)
                if (chapterDetails) {
                    chapters.push(chapterDetails)
                }
            } catch (error) {
                console.error("Error processing chapter element:", error)
            }
        })
        
        return chapters
    }

    /**
     * Parses a single chapter element
     * @param element The HTML element to parse
     * @returns Chapter details or null if invalid
     */
    private parseChapterElement(element: any): ChapterDetails | null {
        const linkElement = element.find(this.selectors.chapters.link)
        if (linkElement.length() === 0) return null

        const title = String(linkElement.text() || "").trim()
        const href = String(linkElement.attr("href") || "").trim()

        if (!title || !href) return null

        const chapterNum = this.extractChapterNumber(title, href)
        if (!chapterNum) return null

        return {
            id: href,
            url: href,
            title: title,
            chapter: chapterNum,
            index: 0, // Will be set after sorting
            language: "pt-BR",
        }
    }

    /**
     * Extracts chapter number from title or URL
     * @param title The chapter title
     * @param href The chapter URL
     * @returns Chapter number or null if not found
     */
    private extractChapterNumber(title: string, href: string): string | null {
        const titleMatch = title.match(this.patterns.chapter)
        const urlMatch = href.match(this.patterns.chapterUrl)
        
        const match = titleMatch || urlMatch
        return match ? match[1] : null
    }

    /**
     * Sorts chapters by number and assigns index values
     * @param chapters Array of chapter details to sort
     * @returns Sorted and indexed array of chapter details
     */
    private sortAndIndexChapters(chapters: ChapterDetails[]): ChapterDetails[] {
        chapters.sort((a, b) => {
            const numA = parseFloat(a.chapter.replace(',', '.'))
            const numB = parseFloat(b.chapter.replace(',', '.'))
            return numA - numB
        })

        return chapters.map((chapter, index) => ({
            ...chapter,
            index: index,
        }))
    }
    
    /**
     * Finds all pages for a given chapter
     * @param chapterId The chapter identifier (full URL)
     * @returns Array of chapter pages
     */
    async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
        if (!this.isValidChapterId(chapterId)) {
            console.error(`Invalid chapterId: "${chapterId}". It must be a full URL.`)
            return []
        }

        try {
            const chapterUrl = chapterId
            console.log("Finding pages for:", chapterUrl)
            
            const response = await this.fetchWithRetry(chapterUrl)
            if (!response) return []
            
            const html = await response.text()
            const $ = LoadDoc(html)

            return this.parseChapterPages($, chapterUrl)
        } catch (error) {
            console.error("findChapterPages failed:", error)
            return []
        }
    }

    /**
     * Validates chapter ID format
     * @param chapterId The chapter ID to validate
     * @returns True if valid, false otherwise
     */
    private isValidChapterId(chapterId: string): boolean {
        return chapterId.startsWith("http")
    }

    /**
     * Parses chapter pages from HTML
     * @param $ jQuery-like document object
     * @param chapterUrl The chapter URL for referer header
     * @returns Array of chapter pages
     */
    private parseChapterPages($: any, chapterUrl: string): ChapterPage[] {
        const pageSelectors = [
            this.selectors.pages.content,
            this.selectors.pages.reading,
            this.selectors.pages.page
        ]

        let elements: any = null
        for (const selector of pageSelectors) {
            elements = $(selector)
            if (elements.length() > 0) break
        }

        if (!elements || elements.length() === 0) {
            console.log("No page images found")
            return []
        }

        const results: ChapterPage[] = []

        elements.each((index: number, element: any) => {
            try {
                const pageUrl = this.extractPageImageUrl(element)
                if (pageUrl) {
                    results.push({
                        url: pageUrl,
                        index: index,
                        headers: {
                            'Referer': chapterUrl,
                            'User-Agent': this.defaultHeaders["User-Agent"],
                        },
                    })
                }
            } catch (error) {
                console.error("Error processing page element:", error)
            }
        })

        return results
    }

    /**
     * Extracts image URL from page element
     * @param element The HTML element containing the image
     * @returns Image URL or null if not found
     */
    private extractPageImageUrl(element: any): string | null {
        const src = String(element.attr("data-src") || element.attr("src") || "").trim()
        return src || null
    }
}
