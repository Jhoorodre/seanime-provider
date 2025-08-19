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
    static async fetchHtml(url: string, timeout: number = Provider.CONFIG.TIMEOUT): Promise<string | null> {
        try {
            const response = await fetch(url, { 
                headers: Provider.DEFAULT_HEADERS,
                timeout: timeout
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
            
            // Extrair URL real do parâmetro url=
            const urlMatch = iframeSrc.match(Provider.REGEX_PATTERNS.URL_PARAM);
            if (urlMatch) {
                const playerUrl = decodeURIComponent(urlMatch[1]);
                
                // Tentar extrair URL de vídeo real do player
                try {
                    const videoUrl = await PlayerExtractor.extractVideoUrl(playerUrl);
                    if (videoUrl) {
                        PlayerExtractor.mapPlayerByUrl(players, videoUrl);
                    } else {
                        PlayerExtractor.mapPlayerByUrl(players, playerUrl);
                    }
                } catch (error) {
                    console.error("Erro ao extrair URL de vídeo:", error);
                    PlayerExtractor.mapPlayerByUrl(players, playerUrl);
                }
            } else {
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
     * Processa a página de aviso para obter a URL real do stream
     */
    private static async processAvisoPage(avisoUrl: string): Promise<string | null> {
        try {
            // Extrair URL do parâmetro primeiro (mais rápido)
            const urlMatch = avisoUrl.match(Provider.REGEX_PATTERNS.URL_PARAM);
            if (!urlMatch) return null;

            const playerUrl = decodeURIComponent(urlMatch[1]);
            
            // Tentar extrair stream com timeout curto (5s)
            try {
                const streamUrl = await PlayerExtractor.extractStreamFromPlayer(playerUrl);
                if (streamUrl && streamUrl !== playerUrl) {
                    return streamUrl;
                }
            } catch (error) {
                console.log("Timeout na extração do stream, usando player URL:", error);
            }
            
            // Fallback: retornar URL do player
            return playerUrl;
        } catch (error) {
            console.error("Erro ao processar página de aviso:", error);
            return null;
        }
    }

    /**
     * Extrai a URL real do vídeo MP4 do player
     */
    private static async extractVideoUrl(playerUrl: string): Promise<string | null> {
        try {
            console.log("Extraindo vídeo de:", playerUrl);
            
            // Buscar o HTML do player com timeout de 5s
            const playerHtml = await HttpClient.fetchHtml(playerUrl, 5000);
            if (!playerHtml) return null;

            // Verificar se é disneycdn.net - sempre tentar extrair URL real
            if (playerUrl.includes("disneycdn.net")) {
                console.log("URL Disney detectada, extraindo URL real:", playerUrl);
                
                // Sempre tentar extrair stream específico primeiro
                if (playerUrl.includes("#")) {
                    const disneyUrl = await PlayerExtractor.extractDisneyUrl(playerUrl, playerHtml);
                    if (disneyUrl && disneyUrl !== playerUrl) {
                        console.log("URL Disney extraída:", disneyUrl);
                        return disneyUrl;
                    }
                }
                
                // Fallback: retornar URL original
                console.log("Usando URL Disney original como fallback");
                return playerUrl;
            }

            // Buscar especificamente por URLs secvideo com get_file
            const videoUrls = PlayerExtractor.extractSecvideoUrls(playerHtml);
            if (videoUrls.length > 0) {
                console.log("URLs brutos extraídos:", videoUrls);
                
                // Se a primeira URL contém múltiplas URLs concatenadas, separar
                if (videoUrls.length === 1 && videoUrls[0].includes("[360p]") && videoUrls[0].includes("[720p]")) {
                    console.log("Detectada string concatenada, separando...");
                    const separatedUrls = PlayerExtractor.separateConcatenatedUrls(videoUrls[0]);
                    console.log("URLs separadas:", separatedUrls);
                    
                    if (separatedUrls.length > 0) {
                        const bestUrl = PlayerExtractor.selectBestQuality(separatedUrls);
                        if (bestUrl) {
                            console.log("URL secvideo selecionada:", bestUrl);
                            return bestUrl;
                        }
                    }
                } else {
                    // URLs já estão separadas
                    const bestUrl = PlayerExtractor.selectBestQuality(videoUrls);
                    if (bestUrl) {
                        console.log("URL secvideo selecionada:", bestUrl);
                        return bestUrl;
                    }
                }
            }

            // Padrões gerais como fallback
            const videoPatterns = [
                // URLs MP4 diretas
                /["']([^"']*\.mp4[^"']*?)["']/gi,
                /src:\s*["']([^"']*\.mp4[^"']*?)["']/gi,
                /file:\s*["']([^"']*\.mp4[^"']*?)["']/gi,
                /source:\s*["']([^"']*\.mp4[^"']*?)["']/gi,
                
                // URLs M3U8
                /["']([^"']*\.m3u8[^"']*?)["']/gi,
                /src:\s*["']([^"']*\.m3u8[^"']*?)["']/gi,
                /file:\s*["']([^"']*\.m3u8[^"']*?)["']/gi,
                
                // Configurações de players
                /sources?:\s*\[?\s*["']([^"']*\.(?:mp4|m3u8)[^"']*?)["']/gi,
                /url:\s*["']([^"']*\.(?:mp4|m3u8)[^"']*?)["']/gi
            ];

            for (const pattern of videoPatterns) {
                pattern.lastIndex = 0; // Reset regex
                const matches = [...playerHtml.matchAll(pattern)];
                
                for (const match of matches) {
                    if (match[1] && (match[1].includes('.mp4') || match[1].includes('.m3u8'))) {
                        let videoUrl = match[1];
                        
                        // Se a URL for relativa, tornar absoluta
                        if (videoUrl.startsWith('/')) {
                            const playerDomain = new URL(playerUrl).origin;
                            videoUrl = playerDomain + videoUrl;
                        }
                        
                        console.log("URL de vídeo encontrada:", videoUrl);
                        return videoUrl;
                    }
                }
            }

            // Buscar por configurações de player mais complexas
            const configPatterns = [
                /jwplayer\([^)]*\)\.setup\(({.*?})\)/s,
                /videojs\([^)]*,\s*({.*?})\)/s,
                /player\.load\(({.*?})\)/s
            ];

            for (const pattern of configPatterns) {
                const configMatch = playerHtml.match(pattern);
                if (configMatch) {
                    const config = configMatch[1];
                    
                    // Buscar URLs dentro da configuração
                    const urlInConfig = config.match(/["']([^"']*\.(?:mp4|m3u8)[^"']*?)["']/);
                    if (urlInConfig) {
                        console.log("URL na configuração encontrada:", urlInConfig[1]);
                        return urlInConfig[1];
                    }
                }
            }

            console.log("Nenhuma URL de vídeo encontrada no player");
            return null;
        } catch (error) {
            console.error("Erro ao extrair URL de vídeo:", error);
            return null;
        }
    }

    /**
     * Extrai URL real do stream da disneycdn.net usando APIs descobertas
     */
    private static async extractDisneyUrl(playerUrl: string, playerHtml: string): Promise<string | null> {
        try {
            // Extrair hash da URL (ex: #yx3gl)
            const hashMatch = playerUrl.match(/#(.+)$/);
            if (!hashMatch) return null;
            
            const hash = hashMatch[1];
            console.log("Hash Disney encontrado:", hash);
            
            // Primeiro tentar página de download para obter URLs diretas
            const downloadUrl = `https://disneycdn.net/#${hash}&dl=1`;
            try {
                console.log("Tentando página de download:", downloadUrl);
                const downloadHtml = await HttpClient.fetchHtml(downloadUrl, 5000);
                if (downloadHtml) {
                    console.log("HTML da página de download recebido, tamanho:", downloadHtml.length);
                    
                    // Log de amostra do HTML para debug
                    const sample = downloadHtml.substring(0, 500);
                    console.log("Amostra do HTML:", sample);
                    
                    // Buscar por URLs de download diretas (MP4 ou M3U8)
                    const downloadPatterns = [
                        // URLs de download diretas descobertas
                        /href=["']([^"']*\/download[^"']*?)["']/gi,
                        /href=["']([^"']*\.mp4[^"']*?)["']/gi,
                        /href=["']([^"']*\.m3u8[^"']*?)["']/gi,
                        // IPs diretos descobertos  
                        /href=["']([^"']*85\.202\.160\.158[^"']*?)["']/gi,
                        /href=["']([^"']*\d+\.\d+\.\d+\.\d+[^"']*?)["']/gi,
                        // Padrão genérico para qualquer URL de vídeo
                        /href=["']([^"']*\/[^\/]*\/[^\/]*\/hld\/[^"']*?)["']/gi,
                        // Buscar por qualquer href com .mp4
                        /<a[^>]*href=["']([^"']*\.mp4[^"']*)["']/gi,
                        // Buscar por class downloader-button
                        /<a[^>]*class=["'][^"']*downloader-button[^"']*["'][^>]*href=["']([^"']*)["']/gi
                    ];

                    for (const pattern of downloadPatterns) {
                        pattern.lastIndex = 0;
                        const matches = [...downloadHtml.matchAll(pattern)];
                        
                        for (const match of matches) {
                            if (match[1]) {
                                console.log("URL candidata encontrada:", match[1]);
                                if (match[1].includes('.mp4') || match[1].includes('.m3u8') || match[1].includes('/download') || match[1].includes('hld/')) {
                                    console.log("URL de download encontrada:", match[1]);
                                    return match[1];
                                }
                            }
                        }
                    }
                    
                    console.log("Nenhuma URL de download encontrada na página &dl=1");
                } else {
                    console.log("Não foi possível carregar a página de download");
                }
            } catch (error) {
                console.log("Erro na página de download:", error);
            }
            
            // Tentar a API de vídeo como fallback
            const videoApiUrl = `https://disneycdn.net/api/v1/video?id=${hash}&w=2560&h=1080&r=q1n.net`;
            try {
                console.log("Tentando API de vídeo:", videoApiUrl);
                const videoResponse = await HttpClient.fetchHtml(videoApiUrl, 5000);
                if (videoResponse) {
                    // Buscar por URLs M3U8 na resposta da API
                    const m3u8Match = videoResponse.match(/["']([^"']*\.m3u8[^"']*?)["']/);
                    if (m3u8Match) {
                        console.log("URL M3U8 encontrada na API:", m3u8Match[1]);
                        return m3u8Match[1];
                    }
                }
            } catch (error) {
                console.log("Erro na API de vídeo:", error);
            }
            
            // Buscar token para API de player no HTML
            const tokenMatch = playerHtml.match(/[?&]t=([a-f0-9]+)/);
            if (tokenMatch) {
                const token = tokenMatch[1];
                const playerApiUrl = `https://disneycdn.net/api/v1/player?t=${token}`;
                
                try {
                    console.log("Tentando API de player:", playerApiUrl);
                    const playerResponse = await HttpClient.fetchHtml(playerApiUrl, 5000);
                    if (playerResponse) {
                        // Buscar por URLs M3U8 na resposta da API do player
                        const m3u8Match = playerResponse.match(/["']([^"']*\.m3u8[^"']*?)["']/);
                        if (m3u8Match) {
                            console.log("URL M3U8 encontrada na API do player:", m3u8Match[1]);
                            return m3u8Match[1];
                        }
                    }
                } catch (error) {
                    console.log("Erro na API de player:", error);
                }
            }

            // Buscar diretamente no HTML por URLs conhecidas
            const patterns = [
                // URLs M3U8 específicas encontradas
                /["']([^"']*\/hls\/[^"']*\/master\.m3u8[^"']*?)["']/gi,
                /["']([^"']*\.m3u8[^"']*?)["']/gi,
                // APIs descobertas
                /["']([^"']*\/api\/v1\/video[^"']*?)["']/gi,
                /["']([^"']*\/api\/v1\/player[^"']*?)["']/gi,
                // URLs que podem conter o hash
                new RegExp(`["']([^"']*${hash}[^"']*?)["']`, 'gi')
            ];

            for (const pattern of patterns) {
                pattern.lastIndex = 0;
                const matches = [...playerHtml.matchAll(pattern)];
                
                for (const match of matches) {
                    if (match[1] && (match[1].includes('.m3u8') || match[1].includes('/api/'))) {
                        console.log("URL Disney candidata:", match[1]);
                        
                        // Se for uma URL relativa, tornar absoluta
                        let fullUrl = match[1];
                        if (fullUrl.startsWith('/')) {
                            fullUrl = 'https://disneycdn.net' + fullUrl;
                        }
                        
                        return fullUrl;
                    }
                }
            }

            // Tentar URLs de API baseadas no padrão descoberto
            const apiUrls = [
                `https://disneycdn.net/api/v1/video?id=${hash}&w=2560&h=1080&r=q1n.net`,
                `https://disneycdn.net/hls/${hash}/master.m3u8`,
                `https://disneycdn.net/video/${hash}.m3u8`
            ];

            // Testar se alguma dessas URLs existe
            for (const apiUrl of apiUrls) {
                try {
                    const response = await fetch(apiUrl, { method: 'HEAD', timeout: 3000 });
                    if (response.ok) {
                        console.log("URL Disney API encontrada:", apiUrl);
                        return apiUrl;
                    }
                } catch (error) {
                    // Continuar tentando
                }
            }

            console.log("Nenhuma URL Disney encontrada");
            return null;
        } catch (error) {
            console.error("Erro ao extrair URL Disney:", error);
            return null;
        }
    }

    /**
     * Extrai URLs secvideo específicas do HTML
     */
    private static extractSecvideoUrls(html: string): string[] {
        const urls: string[] = [];
        
        // Primeiro tentar padrão individual para cada qualidade
        const qualityPatterns = [
            /["']([^"']*secvideo[^"']*\/get_file\/[^"']*\.mp4\/)["']/gi,
            /["']([^"']*secvideo[^"']*\/get_file\/[^"']*_360p\.mp4\/)["']/gi,
            /["']([^"']*secvideo[^"']*\/get_file\/[^"']*_720p\.mp4\/)["']/gi,
            /["']([^"']*secvideo[^"']*\/get_file\/[^"']*_1080p\.mp4\/)["']/gi
        ];

        for (const pattern of qualityPatterns) {
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(html)) !== null) {
                if (match[1] && !urls.includes(match[1])) {
                    urls.push(match[1]);
                }
            }
        }

        // Se não encontrou URLs individuais, buscar na string concatenada que aparece nos logs
        if (urls.length === 0) {
            console.log("Tentando extrair URLs da string concatenada");
            
            // Buscar por strings que contenham múltiplas URLs concatenadas
            const concatenatedPattern = /\[360p\]([^,]+),\[720p\]([^,]+),\[1080p\]([^\]]+)/g;
            let match;
            while ((match = concatenatedPattern.exec(html)) !== null) {
                console.log("Match encontrado:", match);
                if (match[1]) {
                    const url360 = match[1].trim();
                    console.log("Adicionando 360p:", url360);
                    urls.push(url360);
                }
                if (match[2]) {
                    const url720 = match[2].trim();
                    console.log("Adicionando 720p:", url720);
                    urls.push(url720);
                }
                if (match[3]) {
                    const url1080 = match[3].trim();
                    console.log("Adicionando 1080p:", url1080);
                    urls.push(url1080);
                }
            }
            
            // Se ainda não encontrou, tentar padrão mais simples
            if (urls.length === 0) {
                // Buscar diretamente por URLs secvideo no texto
                const simplePattern = /(https:\/\/[^"'\s,\]]+secvideo[^"'\s,\]]+\.mp4\/)/gi;
                let simpleMatch;
                while ((simpleMatch = simplePattern.exec(html)) !== null) {
                    if (simpleMatch[1] && !urls.includes(simpleMatch[1])) {
                        console.log("URL simples encontrada:", simpleMatch[1]);
                        urls.push(simpleMatch[1]);
                    }
                }
            }
        }
        
        return urls;
    }

    /**
     * Separa URLs concatenadas em URLs individuais
     */
    private static separateConcatenatedUrls(concatenatedString: string): string[] {
        const urls: string[] = [];
        
        console.log("String para separar:", concatenatedString);
        
        // Padrão: [360p]URL,[720p]URL,[1080p]URL
        const patterns = [
            // Buscar 360p
            /\[360p\]([^,\[]+)/,
            // Buscar 720p  
            /\[720p\]([^,\[]+)/,
            // Buscar 1080p
            /\[1080p\]([^,\[]+)/
        ];
        
        for (const pattern of patterns) {
            const match = concatenatedString.match(pattern);
            if (match && match[1]) {
                const cleanUrl = match[1].trim();
                console.log("URL encontrada:", cleanUrl);
                urls.push(cleanUrl);
            }
        }
        
        return urls;
    }

    /**
     * Seleciona a melhor qualidade disponível das URLs
     */
    private static selectBestQuality(urls: string[]): string | null {
        if (urls.length === 0) return null;
        
        console.log("URLs secvideo encontradas:", urls);
        
        // Ordem de preferência: sem sufixo (1080p) > 1080p > 720p > 360p
        const qualityOrder = ['', '1080p', '720p', '360p'];
        
        for (const quality of qualityOrder) {
            for (const url of urls) {
                if (quality === '') {
                    // URL sem sufixo de qualidade (geralmente 1080p)
                    if (!url.includes('_360p') && !url.includes('_720p') && !url.includes('_1080p')) {
                        console.log("URL selecionada (sem sufixo):", url);
                        return url;
                    }
                } else {
                    if (url.includes(`_${quality}`)) {
                        console.log(`URL selecionada (${quality}):`, url);
                        return url;
                    }
                }
            }
        }
        
        // Fallback: retorna a primeira URL
        console.log("URL fallback:", urls[0]);
        return urls[0];
    }

    private static mapPlayerByUrl(players: Map<string, string>, url: string): void {
        console.log("Mapeando URL:", url);
        
        if (url.includes("disneycdn.net") && !players.has("chplay")) {
            console.log("Mapeado como chplay (Disney)");
            players.set("chplay", url);
        } else if ((url.includes("csst.online") || url.includes("secvideo")) && !players.has("ruplay")) {
            console.log("Mapeado como ruplay (Secvideo)");
            players.set("ruplay", url);
        } else if (url.includes("secvideo") && !players.has("ruplay")) {
            console.log("Mapeado como ruplay (Secvideo - fallback)");
            players.set("ruplay", url);
        } else if (url.includes("disneycdn.net")) {
            console.log("Mapeado como chplay (Disney - override)");
            players.set("chplay", url);
        } else if (!players.has("chplay")) {
            console.log("Mapeado como chplay (fallback)");
            players.set("chplay", url);
        } else if (!players.has("ruplay")) {
            console.log("Mapeado como ruplay (fallback)");
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
        console.log("PlayerSelector - Players disponíveis:", Array.from(players.entries()));
        console.log("PlayerSelector - Servidor preferido:", preferredServer);
        
        // Limpar espaços em branco do servidor preferido
        const cleanPreferredServer = preferredServer.trim();
        console.log("PlayerSelector - Servidor preferido (limpo):", cleanPreferredServer);
        
        // Primeiro tentar o servidor preferido
        let playerUrl = players.get(cleanPreferredServer);
        console.log("PlayerSelector - URL do servidor preferido:", playerUrl);
        
        if (!playerUrl) {
            // Fallback para servidor padrão
            playerUrl = players.get(Provider.CONFIG.DEFAULT_SERVER);
            console.log("PlayerSelector - URL do servidor padrão:", playerUrl);
        }
        
        if (!playerUrl) {
            // Fallback para segundo servidor
            playerUrl = players.get(Provider.CONFIG.SUPPORTED_SERVERS[1]);
            console.log("PlayerSelector - URL do segundo servidor:", playerUrl);
        }
        
        if (!playerUrl) {
            // Último fallback: qualquer URL disponível
            playerUrl = players.values().next().value;
            console.log("PlayerSelector - URL de fallback:", playerUrl);
        }

        console.log("PlayerSelector - URL final selecionada:", playerUrl);

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
