/// <reference path="./online-streaming-provider.d.ts" />
/// <reference path="./core.d.ts" />

// Tipos específicos do Q1N.net
interface Q1NAnimeResult {
    title: string;
    url: string;
    poster?: string;
    year?: number;
    type?: string;
}

interface Q1NEpisode {
    number: number;
    title?: string;
    url: string;
    date?: string;
}

class Provider {
    // Configurações do provedor
    private readonly API_BASE = "https://q1n.net";
    private readonly SUPPORTED_SERVERS = ["chplay", "ruplay"];
    private readonly DEFAULT_SERVER = "chplay";
    private readonly MAX_EPISODES_SCAN = 50;

    // Seletores CSS organizados
    private readonly SELECTORS = {
        // Seletores para resultados de busca
        SEARCH_CONTAINERS: [
            ".items .item",
            ".result .item", 
            ".search-result .item",
            "article",
            ".post",
            ".anime-item"
        ],
        
        // Seletores para títulos em resultados de busca
        SEARCH_TITLES: [".data h3", "h3", "h2", ".title", ".name"],
        
        // Seletores para URLs em resultados de busca
        SEARCH_URLS: [".poster a", "a", ".link"],
        
        // Seletores para listas de episódios
        EPISODES_LISTS: [
            "ul.episodios2 li", 
            "ul.episodios li", 
            ".episodios2 li", 
            ".episodios li", 
            "li.episode", 
            ".episode-list li"
        ],
        
        // Seletores para elementos de episódios
        EPISODE_LINK: ".episodiotitle a",
        EPISODE_NUMBER: ".numerando",
        
        // Seletores para players
        PLAYER_ELEMENTS: "li, a, button, span, div",
        IFRAMES: "iframe"
    };

    // Headers padrão para requisições
    private readonly DEFAULT_HEADERS = {
        "Referer": this.API_BASE,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    };

    getSettings(): Settings {
        return {
            episodeServers: this.SUPPORTED_SERVERS,
            supportsDub: true,
        };
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        try {
            const searchUrl = this.buildSearchUrl(opts.query, opts.dub);
            const html = await this.fetchHtml(searchUrl);
            
            if (!html) return [];
            
            return this.parseSearchResults(html);
        } catch (error) {
            console.error("Erro na busca:", error);
            return [];
        }
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        try {
            // Validar ID
            if (!this.isValidAnimeId(id)) {
                return [];
            }

            const animeUrl = this.buildAnimeUrl(id);
            const html = await this.fetchHtml(animeUrl);
            
            if (!html) {
                return this.findEpisodesFromEpisodePages(id);
            }

            const episodes = this.parseEpisodesFromAnimePage(html);
            
            if (episodes.length === 0) {
                return this.findEpisodesFromEpisodePages(id);
            }

            return this.sortEpisodes(episodes);
        } catch (error) {
            console.error("Erro ao buscar episódios:", error);
            return [];
        }
    }

    async findEpisodeServer(episode: EpisodeDetails, server: string, mediaId?: string): Promise<EpisodeServer> {
        try {
            this.validateEpisodeData(episode);
            
            const html = await this.fetchHtml(episode.url);
            if (!html) {
                throw new Error("Não foi possível carregar a página do episódio");
            }

            const players = this.extractPlayersFromPage(html, episode);
            const selectedServer = server === "default" || !server ? this.DEFAULT_SERVER : server;
            const playerUrl = this.selectBestPlayer(players, selectedServer);

            return this.buildEpisodeServerResponse(selectedServer, playerUrl);
        } catch (error) {
            console.error("Erro ao buscar servidor do episódio:", error);
            throw error;
        }
    }

    // Métodos privados para organização

    private buildSearchUrl(query: string, isDub: boolean): string {
        const searchQuery = isDub ? `${query} dublado` : query;
        return `${this.API_BASE}/?s=${encodeURIComponent(searchQuery)}`;
    }

    private buildAnimeUrl(animeSlug: string): string {
        return `${this.API_BASE}/animes/${animeSlug}/`;
    }

    private buildEpisodeUrl(animeSlug: string, episodeNumber: number): string {
        return `${this.API_BASE}/episodio/${animeSlug}-episodio-${episodeNumber}/`;
    }

    private async fetchHtml(url: string): Promise<string | null> {
        try {
            const response = await fetch(url);
            if (!response.ok) return null;
            return await response.text();
        } catch {
            return null;
        }
    }

    private isValidAnimeId(id: string): boolean {
        // ID numérico sozinho não é válido para este provedor
        return !/^\d+$/.test(id);
    }

    private validateEpisodeData(episode: EpisodeDetails): void {
        if (!episode?.id || !episode?.url || !episode.url.trim()) {
            throw new Error("Dados do episódio inválidos ou incompletos");
        }
    }

    private parseSearchResults(html: string): SearchResult[] {
        const $ = LoadDoc(html);
        const results: SearchResult[] = [];

        for (const containerSelector of this.SELECTORS.SEARCH_CONTAINERS) {
            $(containerSelector).each((_, element) => {
                const result = this.parseSearchResultElement(element);
                if (result) {
                    results.push(result);
                }
            });

            if (results.length > 0) break;
        }

        return results;
    }

    private parseSearchResultElement(element: any): SearchResult | null {
        const title = this.extractTextFromSelectors(element, this.SELECTORS.SEARCH_TITLES);
        const url = this.extractUrlFromSelectors(element, this.SELECTORS.SEARCH_URLS);

        if (!title || !url) return null;

        return {
            id: this.extractIdFromUrl(url),
            title: title,
            url: url,
            subOrDub: this.detectSubOrDub(title),
        };
    }

    private extractTextFromSelectors(element: any, selectors: string[]): string {
        for (const selector of selectors) {
            const textElement = element.find(selector).first();
            const text = textElement.text().trim();
            if (text) return text;
        }
        return "";
    }

    private extractUrlFromSelectors(element: any, selectors: string[]): string {
        for (const selector of selectors) {
            const linkElement = element.find(selector).first();
            const href = linkElement.attr("href");
            if (href && href.includes("/animes/")) {
                return href;
            }
        }

        // Tentar no próprio elemento
        const elementHref = element.attr("href");
        if (elementHref && elementHref.includes("/animes/")) {
            return elementHref;
        }

        return "";
    }

    private detectSubOrDub(title: string): SubOrDub {
        const lowerTitle = title.toLowerCase();
        return (lowerTitle.includes("dublado") || lowerTitle.includes("dub")) ? "dub" : "sub";
    }

    private parseEpisodesFromAnimePage(html: string): EpisodeDetails[] {
        const $ = LoadDoc(html);
        const episodes: EpisodeDetails[] = [];

        for (const selector of this.SELECTORS.EPISODES_LISTS) {
            const elements = $(selector);
            const elementCount = this.countElements(elements);

            if (elementCount > 0) {
                elements.each((_, element) => {
                    const episode = this.parseEpisodeElement(element);
                    if (episode) {
                        episodes.push(episode);
                    }
                });
                break;
            }
        }

        return episodes;
    }

    private parseEpisodeElement(element: any): EpisodeDetails | null {
        const epLink = element.find(this.SELECTORS.EPISODE_LINK).first();
        const epUrl = epLink.attr("href");

        if (!epUrl) return null;

        const epNumber = this.extractEpisodeNumber(epUrl, element);
        const epTitle = epLink.text().trim() || `Episódio ${epNumber}`;

        return {
            id: this.extractEpisodeIdFromUrl(epUrl),
            number: epNumber,
            url: epUrl,
            title: epTitle,
        };
    }

    private extractEpisodeNumber(url: string, element: any): number {
        // Tentar extrair da URL primeiro
        const urlMatch = url.match(/episodio-(\d+)/);
        if (urlMatch) {
            return parseInt(urlMatch[1]);
        }

        // Tentar extrair do elemento .numerando
        const numerandoText = element.find(this.SELECTORS.EPISODE_NUMBER).text().trim();
        const numerandoNumber = parseInt(numerandoText);
        if (numerandoNumber) {
            return numerandoNumber;
        }

        // Fallback: retornar 1
        return 1;
    }

    private countElements(elements: any): number {
        let count = 0;
        elements.each(() => count++);
        return count;
    }

    private async findEpisodesFromEpisodePages(animeSlug: string): Promise<EpisodeDetails[]> {
        const episodes: EpisodeDetails[] = [];

        for (let i = 1; i <= this.MAX_EPISODES_SCAN; i++) {
            try {
                const episodeUrl = this.buildEpisodeUrl(animeSlug, i);
                const response = await fetch(episodeUrl, { method: 'HEAD' });

                if (response.ok) {
                    episodes.push({
                        id: `${animeSlug}-episodio-${i}`,
                        number: i,
                        url: episodeUrl,
                        title: `Episódio ${i}`,
                    });
                } else if (i > 1) {
                    break;
                }
            } catch {
                break;
            }
        }

        return episodes;
    }

    private sortEpisodes(episodes: EpisodeDetails[]): EpisodeDetails[] {
        return episodes.sort((a, b) => a.number - b.number);
    }

    private extractPlayersFromPage(html: string, episode: EpisodeDetails): Map<string, string> {
        const $ = LoadDoc(html);
        const players = new Map<string, string>();

        // Buscar iframes ativos
        this.extractPlayersFromIframes($, players);

        // Buscar elementos de seleção de players
        this.extractPlayersFromElements($, players);

        // Fallback: criar URLs baseadas no padrão
        if (players.size === 0) {
            this.createFallbackPlayers(players, episode.id);
        }

        return players;
    }

    private extractPlayersFromIframes($: any, players: Map<string, string>): void {
        $(this.SELECTORS.IFRAMES).each((_, iframe: any) => {
            const src = iframe.attr("src");
            
            if (src && src.trim() && !src.includes("about:blank")) {
                for (const server of this.SUPPORTED_SERVERS) {
                    if (src.includes(server)) {
                        players.set(server, src);
                        return;
                    }
                }
                players.set("default", src);
            }
        });
    }

    private extractPlayersFromElements($: any, players: Map<string, string>): void {
        $(this.SELECTORS.PLAYER_ELEMENTS).each((_, element: any) => {
            const text = element.text().toLowerCase().trim();
            
            if (this.SUPPORTED_SERVERS.includes(text)) {
                const parentHref = element.parent().attr("href");
                const elementHref = element.attr("href");
                
                if (parentHref || elementHref) {
                    players.set(text, parentHref || elementHref);
                }
            }
        });
    }

    private createFallbackPlayers(players: Map<string, string>, episodeId: string): void {
        for (const server of this.SUPPORTED_SERVERS) {
            players.set(server, `${this.API_BASE}/player/${server}/${episodeId}`);
        }
    }

    private selectBestPlayer(players: Map<string, string>, preferredServer: string): string {
        const playerUrl = players.get(preferredServer) || 
                         players.get(this.DEFAULT_SERVER) || 
                         players.get(this.SUPPORTED_SERVERS[1]) || 
                         players.values().next().value;

        if (!playerUrl || playerUrl.includes("about:blank")) {
            throw new Error("Nenhuma fonte de vídeo encontrada na página");
        }

        return playerUrl;
    }

    private buildEpisodeServerResponse(server: string, playerUrl: string): EpisodeServer {
        // NOTA: Q1N.net usa players externos (chplay/ruplay) que carregam via JavaScript.
        // Esta URL pode não funcionar diretamente - é necessário investigar mais
        // como extrair as URLs reais dos vídeos destes players.
        
        return {
            server: server,
            headers: this.DEFAULT_HEADERS,
            videoSources: [{
                url: playerUrl,
                type: "mp4",
                quality: "1080p",
                subtitles: [],
            }],
        };
    }

    private extractIdFromUrl(url: string): string {
        const match = url.match(/animes\/([^\/]+)/) || url.match(/\/([^\/]+)\/?$/);
        return match ? match[1] : url;
    }

    private extractEpisodeIdFromUrl(url: string): string {
        const match = url.match(/episodio\/([^\/]+)/) || url.match(/\/([^\/]+)\/?$/);
        return match ? match[1] : url;
    }
}
