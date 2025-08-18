/// <reference path="./online-streaming-provider.d.ts" />
/// <reference path="./core.d.ts" />

/**
 * Provider de streaming para Q1N.net
 * Suporta busca de animes, episódios e extração de vídeo
 * Compatível com conteúdo legendado e dublado
 */
class Provider {
    /**
     * Configurações principais do provedor
     */
    private static readonly CONFIG = {
        API_BASE: "https://q1n.net",
        SUPPORTED_SERVERS: ["chplay", "ruplay"] as const,
        DEFAULT_SERVER: "chplay" as const,
        MAX_EPISODES_SCAN: 50,
        DEFAULT_QUALITY: "1080p" as const,
        TIMEOUT: 10000
    };

    /**
     * Seletores CSS organizados por funcionalidade
     */
    private static readonly SELECTORS = {
        SEARCH: {
            CONTAINERS: [".items .item", ".result .item", ".search-result .item", "article", ".post", ".anime-item"],
            TITLES: [".data h3", "h3", "h2", ".title", ".name"],
            URLS: [".poster a", "a", ".link"]
        },
        EPISODES: {
            LISTS: ["ul.episodios2 li", "ul.episodios li", ".episodios2 li", ".episodios li", "li.episode", ".episode-list li"],
            LINK: ".episodiotitle a",
            NUMBER: ".numerando"
        },
        PLAYER: {
            ELEMENTS: "li, a, button, span, div",
            IFRAMES: "iframe"
        }
    };

    /**
     * Headers padrão para requisições HTTP
     */
    private static readonly DEFAULT_HEADERS = {
        "Referer": Provider.CONFIG.API_BASE,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    };

    /**
     * Padrões regex para extração de dados
     */
    private static readonly REGEX_PATTERNS = {
        IFRAME_AVISO: /<iframe[^>]*src=["']([^"']*\/aviso\/[^"']*)["'][^>]*>/gi,
        IFRAME_DIRECT: /<iframe[^>]*src=["']([^"']*(?:blogger\.com|youtube\.com|youtu\.be)[^"']*)["'][^>]*>/gi,
        URL_PARAM: /url=([^&]+)/,
        EPISODE_NUMBER: /episodio-(\d+)/,
        ANIME_ID: /animes\/([^\/]+)/,
        EPISODE_ID: /episodio\/([^\/]+)/
    };

    /**
     * Retorna as configurações suportadas pelo provedor
     */
    getSettings(): Settings {
        return {
            episodeServers: [...Provider.CONFIG.SUPPORTED_SERVERS],
            supportsDub: true,
        };
    }

    /**
     * Realiza busca de animes no Q1N.net
     */
    async search(opts: SearchOptions): Promise<SearchResult[]> {
        try {
            const searchUrl = UrlBuilder.buildSearchUrl(opts.query, opts.dub);
            const html = await HttpClient.fetchHtml(searchUrl);
            
            if (!html) return [];
            
            return SearchParser.parseResults(html);
        } catch (error) {
            console.error("Erro na busca:", error);
            return [];
        }
    }

    /**
     * Busca episódios de um anime específico
     */
    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        try {
            if (!Validator.isValidAnimeId(id)) {
                return [];
            }

            const animeUrl = UrlBuilder.buildAnimeUrl(id);
            const html = await HttpClient.fetchHtml(animeUrl);
            
            if (!html) {
                return EpisodeFinder.findFromEpisodePages(id);
            }

            const episodes = EpisodeParser.parseFromAnimePage(html);
            
            if (episodes.length === 0) {
                return EpisodeFinder.findFromEpisodePages(id);
            }

            return Utils.sortEpisodes(episodes);
        } catch (error) {
            console.error("Erro ao buscar episódios:", error);
            return [];
        }
    }

    /**
     * Busca servidor de vídeo para um episódio específico
     */
    async findEpisodeServer(episode: EpisodeDetails, server: string, mediaId?: string): Promise<EpisodeServer> {
        try {
            Validator.validateEpisodeData(episode);
            
            const html = await HttpClient.fetchHtml(episode.url);
            if (!html) {
                throw new Error("Não foi possível carregar a página do episódio");
            }

            const players = await PlayerExtractor.extractFromPage(html, episode);
            const selectedServer = server === "default" || !server ? Provider.CONFIG.DEFAULT_SERVER : server;
            const playerUrl = PlayerSelector.selectBest(players, selectedServer);

            return ResponseBuilder.buildEpisodeServer(selectedServer, playerUrl);
        } catch (error) {
            console.error("Erro ao buscar servidor do episódio:", error);
            throw error;
        }
    }

}

/**
 * Classe responsável por construir URLs
 */
class UrlBuilder {
    static buildSearchUrl(query: string, isDub: boolean): string {
        const searchQuery = isDub ? `${query} dublado` : query;
        return `${Provider.CONFIG.API_BASE}/?s=${encodeURIComponent(searchQuery)}`;
    }

    static buildAnimeUrl(animeSlug: string): string {
        return `${Provider.CONFIG.API_BASE}/animes/${animeSlug}/`;
    }

    static buildEpisodeUrl(animeSlug: string, episodeNumber: number): string {
        return `${Provider.CONFIG.API_BASE}/episodio/${animeSlug}-episodio-${episodeNumber}/`;
    }
}

/**
 * Classe responsável por requisições HTTP
 */
class HttpClient {
    static async fetchHtml(url: string): Promise<string | null> {
        try {
            const response = await fetch(url, { 
                headers: Provider.DEFAULT_HEADERS,
                timeout: Provider.CONFIG.TIMEOUT
            });
            if (!response.ok) return null;
            return await response.text();
        } catch {
            return null;
        }
    }
}

/**
 * Classe responsável por validações
 */
class Validator {
    static isValidAnimeId(id: string): boolean {
        return !/^\d+$/.test(id);
    }

    static validateEpisodeData(episode: EpisodeDetails): void {
        if (!episode?.id || !episode?.url || !episode.url.trim()) {
            throw new Error("Dados do episódio inválidos ou incompletos");
        }
    }
}

/**
 * Classe responsável por parsing de resultados de busca
 */
class SearchParser {
    static parseResults(html: string): SearchResult[] {
        const $ = LoadDoc(html);
        const results: SearchResult[] = [];

        for (const containerSelector of Provider.SELECTORS.SEARCH.CONTAINERS) {
            $(containerSelector).each((_, element) => {
                const result = SearchParser.parseResultElement(element);
                if (result) {
                    results.push(result);
                }
            });

            if (results.length > 0) break;
        }

        return results;
    }

    private static parseResultElement(element: any): SearchResult | null {
        const title = ElementExtractor.extractText(element, Provider.SELECTORS.SEARCH.TITLES);
        const url = ElementExtractor.extractUrl(element, Provider.SELECTORS.SEARCH.URLS);

        if (!title || !url) return null;

        return {
            id: Utils.extractIdFromUrl(url),
            title: title,
            url: url,
            subOrDub: Utils.detectSubOrDub(title),
        };
    }
}

/**
 * Classe responsável por parsing de episódios
 */
class EpisodeParser {
    static parseFromAnimePage(html: string): EpisodeDetails[] {
        const $ = LoadDoc(html);
        const episodes: EpisodeDetails[] = [];

        for (const selector of Provider.SELECTORS.EPISODES.LISTS) {
            const elements = $(selector);
            const elementCount = Utils.countElements(elements);

            if (elementCount > 0) {
                elements.each((_, element) => {
                    const episode = EpisodeParser.parseEpisodeElement(element);
                    if (episode) {
                        episodes.push(episode);
                    }
                });
                break;
            }
        }

        return episodes;
    }

    private static parseEpisodeElement(element: any): EpisodeDetails | null {
        const epLink = element.find(Provider.SELECTORS.EPISODES.LINK).first();
        const epUrl = epLink.attr("href");

        if (!epUrl) return null;

        const epNumber = EpisodeParser.extractEpisodeNumber(epUrl, element);
        const epTitle = epLink.text().trim() || `Episódio ${epNumber}`;

        return {
            id: Utils.extractEpisodeIdFromUrl(epUrl),
            number: epNumber,
            url: epUrl,
            title: epTitle,
        };
    }

    private static extractEpisodeNumber(url: string, element: any): number {
        const urlMatch = url.match(Provider.REGEX_PATTERNS.EPISODE_NUMBER);
        if (urlMatch) {
            return parseInt(urlMatch[1]);
        }

        const numerandoText = element.find(Provider.SELECTORS.EPISODES.NUMBER).text().trim();
        const numerandoNumber = parseInt(numerandoText);
        if (numerandoNumber) {
            return numerandoNumber;
        }

        return 1;
    }
}

/**
 * Classe responsável por encontrar episódios
 */
class EpisodeFinder {
    static async findFromEpisodePages(animeSlug: string): Promise<EpisodeDetails[]> {
        const episodes: EpisodeDetails[] = [];

        for (let i = 1; i <= Provider.CONFIG.MAX_EPISODES_SCAN; i++) {
            try {
                const episodeUrl = UrlBuilder.buildEpisodeUrl(animeSlug, i);
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
}

/**
 * Classe responsável por extração de elementos
 */
class ElementExtractor {
    static extractText(element: any, selectors: string[]): string {
        for (const selector of selectors) {
            const textElement = element.find(selector).first();
            const text = textElement.text().trim();
            if (text) return text;
        }
        return "";
    }

    static extractUrl(element: any, selectors: string[]): string {
        for (const selector of selectors) {
            const linkElement = element.find(selector).first();
            const href = linkElement.attr("href");
            if (href && href.includes("/animes/")) {
                return href;
            }
        }

        const elementHref = element.attr("href");
        if (elementHref && elementHref.includes("/animes/")) {
            return elementHref;
        }

        return "";
    }
}

/**
 * Classe responsável por extração de players
 */
class PlayerExtractor {
    static async extractFromPage(html: string, episode: EpisodeDetails): Promise<Map<string, string>> {
        const players = new Map<string, string>();
        
        try {
            await PlayerExtractor.extractFromHtml(html, players);
            
            if (players.size === 0) {
                PlayerExtractor.createFallbackPlayers(players, episode.id);
            }
        } catch (error) {
            console.error("Erro na extração:", error);
            PlayerExtractor.createFallbackPlayers(players, episode.id);
        }
        
        return players;
    }
    
    private static async extractFromHtml(html: string, players: Map<string, string>): Promise<void> {
        let match;
        
        while ((match = Provider.REGEX_PATTERNS.IFRAME_AVISO.exec(html)) !== null) {
            const iframeSrc = match[1];
            
            try {
                // Processar página de aviso para obter URL real
                const realUrl = await PlayerExtractor.processAvisoPage(iframeSrc);
                if (realUrl) {
                    PlayerExtractor.mapPlayerByUrl(players, realUrl);
                }
            } catch (error) {
                console.error("Erro ao processar página de aviso:", error);
                // Fallback: usar URL do iframe completa
                PlayerExtractor.mapPlayerByUrl(players, iframeSrc);
            }
        }
        
        while ((match = Provider.REGEX_PATTERNS.IFRAME_DIRECT.exec(html)) !== null) {
            const iframeSrc = match[1];
            PlayerExtractor.mapPlayerByUrl(players, iframeSrc);
        }
    }

    /**
     * Processa a página de aviso para obter a URL real do player
     */
    private static async processAvisoPage(avisoUrl: string): Promise<string | null> {
        try {
            // Buscar a página de aviso
            const avisoHtml = await HttpClient.fetchHtml(avisoUrl);
            if (!avisoHtml) return null;

            // Extrair URL do parâmetro original
            const urlMatch = avisoUrl.match(Provider.REGEX_PATTERNS.URL_PARAM);
            if (!urlMatch) return null;

            const originalUrl = decodeURIComponent(urlMatch[1]);
            
            // Verificar se a página tem o botão de confirmação
            if (avisoHtml.includes("redirecionarParaVideo") || avisoHtml.includes("Deseja continuar")) {
                // Simular clique no botão "Sim" retornando a URL original
                // que agora deve funcionar após "passar" pela página de aviso
                return originalUrl;
            }

            return originalUrl;
        } catch (error) {
            console.error("Erro ao processar página de aviso:", error);
            return null;
        }
    }

    private static mapPlayerByUrl(players: Map<string, string>, url: string): void {
        if (url.includes("disneycdn.net") && !players.has("chplay")) {
            players.set("chplay", url);
        } else if (url.includes("csst.online") && !players.has("ruplay")) {
            players.set("ruplay", url);
        } else if (!players.has("chplay")) {
            players.set("chplay", url);
        } else if (!players.has("ruplay")) {
            players.set("ruplay", url);
        }
    }

    private static createFallbackPlayers(players: Map<string, string>, episodeId: string): void {
        for (const server of Provider.CONFIG.SUPPORTED_SERVERS) {
            players.set(server, `${Provider.CONFIG.API_BASE}/player/${server}/${episodeId}`);
        }
    }
}

/**
 * Classe responsável por seleção de players
 */
class PlayerSelector {
    static selectBest(players: Map<string, string>, preferredServer: string): string {
        const playerUrl = players.get(preferredServer) || 
                         players.get(Provider.CONFIG.DEFAULT_SERVER) || 
                         players.get(Provider.CONFIG.SUPPORTED_SERVERS[1]) || 
                         players.values().next().value;

        if (!playerUrl || playerUrl.includes("about:blank")) {
            throw new Error("Nenhuma fonte de vídeo encontrada na página");
        }

        return playerUrl;
    }
}

/**
 * Classe responsável por construir respostas
 */
class ResponseBuilder {
    static buildEpisodeServer(server: string, playerUrl: string): EpisodeServer {
        return {
            server: server,
            headers: Provider.DEFAULT_HEADERS,
            videoSources: [{
                url: playerUrl,
                type: "m3u8",
                quality: Provider.CONFIG.DEFAULT_QUALITY,
                subtitles: [],
            }],
        };
    }
}

/**
 * Classe utilitária
 */
class Utils {
    static sortEpisodes(episodes: EpisodeDetails[]): EpisodeDetails[] {
        return episodes.sort((a, b) => a.number - b.number);
    }

    static countElements(elements: any): number {
        let count = 0;
        elements.each(() => count++);
        return count;
    }

    static detectSubOrDub(title: string): SubOrDub {
        const lowerTitle = title.toLowerCase();
        return (lowerTitle.includes("dublado") || lowerTitle.includes("dub")) ? "dub" : "sub";
    }

    static extractIdFromUrl(url: string): string {
        const match = url.match(Provider.REGEX_PATTERNS.ANIME_ID) || url.match(/\/([^\/]+)\/?$/);
        return match ? match[1] : url;
    }

    static extractEpisodeIdFromUrl(url: string): string {
        const match = url.match(Provider.REGEX_PATTERNS.EPISODE_ID) || url.match(/\/([^\/]+)\/?$/);
        return match ? match[1] : url;
    }

}
