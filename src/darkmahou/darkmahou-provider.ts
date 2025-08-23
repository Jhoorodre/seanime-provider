/// <reference path="./anime-torrent-provider.d.ts" />
/// <reference path="./core.d.ts" />

// Advanced type definitions using template literal types and conditional types
type Resolution = '480p' | '720p' | '1080p' | '1440p' | '4K';
type CommonResolution = 480 | 720 | 1080;
type ConfidenceLevel = 'high' | 'medium' | 'low';
type ParseMethod = 'regex';
type MatchStrategy = 'exact' | 'fuzzy' | 'normalized' | 'phonetic';
type CacheKey = string & { readonly __cacheKey: true };
type Timestamp = number & { readonly __timestamp: true };

// Template literal type for URL patterns
type URLPattern = `/${string}`;
type SearchURL = `${string}/?s=${string}`;
type MagnetLink = `magnet:?${string}`;

// Branded types for type safety
type InfoHash = string & { readonly __brand: unique symbol };
type EpisodeNumber = number & { readonly __brand: unique symbol };
type NormalizedString = string & { readonly __normalized: true };
type FuzzyScore = number & { readonly __range: '0-100' };

// Advanced matching types
type StringDistance = number & { readonly __levenshtein: true };
type SimilarityScore = number & { readonly __similarity: '0-1' };

// Configuration with stronger typing
const PROVIDER_CONFIG = {
    API_BASE_URL: "https://darkmahou.org" as const,
    USER_AGENT: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" as const,
    MAX_EPISODE_NUMBER: 9999 as const,
    MIN_EPISODE_NUMBER: 1 as const,
    MAX_YEAR: 2000 as const,
    COMMON_RESOLUTIONS: [480, 720, 1080] as const satisfies readonly CommonResolution[],
    MAX_BATCH_EPISODES: 999 as const
} as const satisfies Record<string, unknown>;

const REGEX_PATTERNS = {
    INFO_HASH: /btih:([a-fA-F0-9]{40})/i,
    MAGNET_LINK: /magnet:\?[^"'\s<>]+/gi,
    RESOLUTION: /\b(\d{3,4}p)\b/i,
    RELEASE_GROUP: /^\[([^\]]+)\]/,
    EPISODE_RANGE: /\b(\d{2,3})\s*[-~]\s*(\d{2,3})\b/,
    SEASON_EPISODE: /S(\d+)E(\d+)/i,
    EPISODE_DASH: /\s-\s(\d{1,4})\s/,
    EPISODE_NUMBER: /\b(\d{1,4})\b/g,
    EPISODE_PATTERNS: {
        PORTUGUESE: /episódio\s+(\d+)/i,
        ENGLISH: /(?:ep|episode)\s*(\d+)/i
    },
    SEASON_ORDINAL: /\b(\d+)(?:st|nd|rd|th)\s+season\b/gi,
    SEASON_NUMBER: /\bseason\s+(\d+)\b/gi,
    ANIME_PAGE_LINK: /<a[^>]+href="(https:\/\/darkmahou\.org\/[^\/]+\/)"[^>]*title="([^"]*)"[^>]*>/gi
} as const;

const PORTUGUESE_TRANSLATIONS = {
    ORDINAL_NUMBERS: {
        "first": "1ª",
        "second": "2ª", 
        "third": "3ª",
        "fourth": "4ª",
        "fifth": "5ª"
    },
    TERMS: {
        "movie": "filme",
        "ova": "ova",
        "special": "especial"
    }
} as const;

const EXCLUDED_URL_PATTERNS = [
    "/?s=", "/tag/", "/blog/", "/contato", "/az-lists", 
    "/em-breve", "/animes-populares", "/categoria", "/genero",
    "/lord-of-mysteries/", "/yofukashi-no-uta", "/zutaboro-reijou", 
    "/watari-kun", "/silent-witch", "/tougen-anki", "/arknights"
] as const;

// Performance optimization constants
const PERFORMANCE_CONFIG = {
    CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes
    MAX_CACHE_SIZE: 100,
    EARLY_EXIT_SCORE: 95,
    MAX_FUZZY_CANDIDATES: 5,
    MIN_TITLE_LENGTH: 2
} as const;

// Cache interfaces with TypeScript generics
interface CacheEntry<T> {
    readonly data: T;
    readonly timestamp: Timestamp;
    readonly key: CacheKey;
}

interface PerformanceMetrics {
    searchTime: number;
    parseTime: number;
    cacheHits: number;
    cacheMisses: number;
    fuzzyMatchCount: number;
}

interface ReadonlyPerformanceMetrics {
    readonly searchTime: number;
    readonly parseTime: number;
    readonly cacheHits: number;
    readonly cacheMisses: number;
    readonly fuzzyMatchCount: number;
}

// Fuzzy matching configuration with type safety
const FUZZY_MATCH_CONFIG = {
    maxDistance: 5,
    minSimilarity: 0.6,
    strategies: ['exact', 'fuzzy', 'normalized', 'phonetic'] as const,
    weights: {
        exact: 100,
        fuzzy: 80,
        normalized: 70,
        phonetic: 60
    }
} as const satisfies FuzzyMatchConfig;

// Character normalization mapping using advanced TypeScript patterns
const CHARACTER_NORMALIZATIONS = {
    // Diacritics normalization
    'á': 'a', 'à': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a',
    'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
    'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
    'ó': 'o', 'ò': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
    'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
    'ç': 'c', 'ñ': 'n',
    // Japanese romanization variants
    'ō': 'o', 'ū': 'u', 'ā': 'a', 'ē': 'e', 'ī': 'i',
    // Common spacing variations
    '\u3000': ' ', // Japanese full-width space
    '\t': ' ',
    '\n': ' ',
    '\r': ' '
} as const satisfies CharacterNormalizationMap;

// Common anime title variations for better matching
const ANIME_TITLE_VARIATIONS = {
    // Common word separations that should be normalized
    patterns: [
        // Handle compound words that might be written together or apart
        { from: /mahou\s+tsukai/gi, to: 'mahoutsukai' },
        { from: /maho\s+tsukai/gi, to: 'mahotsukai' },
        { from: /seirei\s+tsukai/gi, to: 'seireitsukai' },
        { from: /ken\s+shi/gi, to: 'kenshi' },
        { from: /yuu\s+sha/gi, to: 'yuusha' },
        // Handle common romanization differences
        { from: /ou/g, to: 'o' },
        { from: /uu/g, to: 'u' },
        { from: /ei/g, to: 'e' },
        // Handle season/episode markers
        { from: /season\s*(\d+)/gi, to: 'S$1' },
        { from: /episod[ei]o?\s*(\d+)/gi, to: 'E$1' }
    ]
} as const;

// Advanced type definitions with generics and constraints
interface ScoreMatch {
    readonly url: string;
    readonly title: string;
    readonly score: FuzzyScore;
    readonly strategy: MatchStrategy;
    readonly normalizedTitle?: NormalizedString;
    readonly distance?: StringDistance;
}

interface EpisodeExtractionResult {
    readonly episodeNumber: EpisodeNumber;
    readonly confidence: ConfidenceLevel;
}

// Fuzzy matching configuration with const assertions
interface FuzzyMatchConfig {
    readonly maxDistance: number;
    readonly minSimilarity: number;
    readonly strategies: readonly MatchStrategy[];
    readonly weights: {
        readonly exact: number;
        readonly fuzzy: number;
        readonly normalized: number;
        readonly phonetic: number;
    };
}

// Character normalization mapping using mapped types
type CharacterNormalizationMap = {
    readonly [K in string]: string;
};

// Template literal types for string transformations
type SpaceVariations = ' ' | '　' | '\t' | '\n';
type DiacriticVariations = 'á' | 'à' | 'â' | 'ã' | 'ä' | 'é' | 'è' | 'ê' | 'ë' | 'í' | 'ì' | 'î' | 'ï' | 'ó' | 'ò' | 'ô' | 'õ' | 'ö' | 'ú' | 'ù' | 'û' | 'ü' | 'ç' | 'ñ';

// Result type for better error handling
type Result<T, E = Error> = 
    | { success: true; data: T }
    | { success: false; error: E };

// Conditional type for filtering options
type FilterOptions<T> = {
    [K in keyof T as T[K] extends undefined ? never : K]: T[K]
};

// Generic parser interface
interface Parser<TInput, TOutput> {
    parse(input: TInput): TOutput;
}

// Fuzzy matching interfaces with generics
interface StringMatcher<TConfig = FuzzyMatchConfig> {
    match(query: string, target: string, config?: TConfig): FuzzyScore;
    normalize(input: string): NormalizedString;
}

interface DistanceCalculator {
    calculate(a: string, b: string): StringDistance;
}

// Advanced conditional types for matching strategies
type MatchingResult<T extends MatchStrategy> = 
    T extends 'exact' ? { score: 100; exact: true } :
    T extends 'fuzzy' ? { score: FuzzyScore; distance: StringDistance } :
    T extends 'normalized' ? { score: FuzzyScore; normalized: true } :
    T extends 'phonetic' ? { score: FuzzyScore; phonetic: true } :
    never;

// Type guard functions
const isValidMagnetLink = (link: string): link is MagnetLink =>
    link.startsWith('magnet:?') && link.length > 20;

const isValidInfoHash = (hash: string): hash is InfoHash =>
    /^[a-fA-F0-9]{40}$/.test(hash);

const isValidEpisodeNumber = (num: number): num is EpisodeNumber =>
    num >= PROVIDER_CONFIG.MIN_EPISODE_NUMBER && 
    num <= PROVIDER_CONFIG.MAX_EPISODE_NUMBER;

const isNormalizedString = (str: string): str is NormalizedString =>
    typeof str === 'string' && str.length > 0;

const isFuzzyScore = (score: number): score is FuzzyScore =>
    score >= 0 && score <= 100;

const isValidStringDistance = (distance: number): distance is StringDistance =>
    distance >= 0 && Number.isInteger(distance);

// Utility Classes with advanced TypeScript patterns
class PortugueseTranslator implements Parser<string, string> {
    // Using mapped types for translation rules
    private static readonly TRANSLATION_RULES = {
        seasonOrdinal: (query: string) => 
            query.replace(REGEX_PATTERNS.SEASON_ORDINAL, (_, num) => `${num}ª temporada`),
        
        seasonNumber: (query: string) => 
            query.replace(REGEX_PATTERNS.SEASON_NUMBER, "$1ª temporada"),
        
        ordinalNumbers: (query: string) => {
            let result = query;
            for (const [english, portuguese] of Object.entries(PORTUGUESE_TRANSLATIONS.ORDINAL_NUMBERS)) {
                const regex = new RegExp(`\\b${english}\\s+season\\b`, "gi");
                result = result.replace(regex, `${portuguese} temporada`);
            }
            return result;
        },
        
        commonTerms: (query: string) => {
            let result = query;
            for (const [english, portuguese] of Object.entries(PORTUGUESE_TRANSLATIONS.TERMS)) {
                const regex = new RegExp(`\\b${english}\\b`, "gi");
                result = result.replace(regex, portuguese);
            }
            return result;
        },
        
        partNumbers: (query: string) => 
            query.replace(/\bpart\s+(\d+)\b/gi, "parte $1"),
        
        normalize: (query: string) => 
            query.replace(/\s+/g, " ").trim()
    } as const;

    static convertQuery(query: string): string {
        return Object.values(this.TRANSLATION_RULES)
            .reduce((acc, rule) => rule(acc), query);
    }

    // Implementing the Parser interface
    parse(input: string): string {
        return PortugueseTranslator.convertQuery(input);
    }
}

class TorrentParser {
    // Using conditional types and type guards for safer parsing
    static extractInfoHash(magnetLink: string): InfoHash | "" {
        if (!isValidMagnetLink(magnetLink)) {
            return "";
        }
        
        const match = magnetLink.match(REGEX_PATTERNS.INFO_HASH);
        const hash = match?.[1];
        return hash && isValidInfoHash(hash) ? hash as InfoHash : "";
    }
    
    static parseResolution(name: string): Resolution | "" {
        const match = name.match(REGEX_PATTERNS.RESOLUTION);
        const resolution = match?.[1];
        
        // Type narrowing using template literal types
        const validResolutions = ['480p', '720p', '1080p', '1440p', '4K'] as const;
        return validResolutions.includes(resolution as any) ? resolution as Resolution : "";
    }
    
    static extractReleaseGroup(name: string): string {
        const match = name.match(REGEX_PATTERNS.RELEASE_GROUP);
        return match?.[1] ?? "";
    }
    
    static isBatchTorrent(name: string, episodeTitle: string): boolean {
        const lowerName = name.toLowerCase();
        const lowerTitle = episodeTitle.toLowerCase();
        
        // Explicit batch indicators
        if (lowerName.includes("batch") || 
            lowerName.includes("complete") || 
            lowerTitle.includes("~")) {
            return true;
        }
        
        // Episode ranges validation
        const rangeMatch = name.match(REGEX_PATTERNS.EPISODE_RANGE);
        if (rangeMatch) {
            const start = parseInt(rangeMatch[1]);
            const end = parseInt(rangeMatch[2]);
            if (end > start && start >= PROVIDER_CONFIG.MIN_EPISODE_NUMBER && end <= PROVIDER_CONFIG.MAX_BATCH_EPISODES) {
                return true;
            }
        }
        
        // Season without episode patterns
        if (lowerName.match(/\bs\d+\b/) && !lowerName.match(/\bs\d+e\d+\b/)) {
            return true;
        }
        
        // Individual episodes are NOT batches
        if (name.match(/\s-\s\d{1,3}(\s|$)/)) {
            return false;
        }
        
        return false;
    }
    
    static extractEpisodeNumber(name: string, episodeTitle: string): EpisodeNumber | -1 {
        if (TorrentParser.isBatchTorrent(name, episodeTitle)) {
            return -1;
        }
        
        // Define extraction strategies with priority order
        const extractionStrategies = [
            () => TorrentParser.tryExtractFromPattern(episodeTitle, REGEX_PATTERNS.EPISODE_PATTERNS.PORTUGUESE),
            () => TorrentParser.tryExtractFromPattern(name, REGEX_PATTERNS.EPISODE_DASH),
            () => TorrentParser.tryExtractFromSeasonEpisode(name),
            () => TorrentParser.tryExtractFromPattern(name, REGEX_PATTERNS.EPISODE_PATTERNS.ENGLISH),
            () => TorrentParser.tryExtractFromIsolatedNumbers(name)
        ] as const;
        
        for (const strategy of extractionStrategies) {
            const result = strategy();
            if (result !== null) {
                return result as EpisodeNumber;
            }
        }
        
        return -1;
    }
    
    private static tryExtractFromPattern(text: string, pattern: RegExp): number | null {
        const match = text.match(pattern);
        if (match) {
            const num = parseInt(match[1]);
            return isValidEpisodeNumber(num) ? num : null;
        }
        return null;
    }
    
    private static tryExtractFromSeasonEpisode(name: string): number | null {
        const match = name.match(REGEX_PATTERNS.SEASON_EPISODE);
        if (match) {
            const episodeNum = parseInt(match[2]); // Return episode number, not season
            return isValidEpisodeNumber(episodeNum) ? episodeNum : null;
        }
        return null;
    }
    
    private static tryExtractFromIsolatedNumbers(name: string): number | null {
        const matches = name.match(REGEX_PATTERNS.EPISODE_NUMBER);
        if (matches) {
            for (const numStr of matches) {
                const num = parseInt(numStr);
                if (TorrentParser.isValidEpisodeForIsolation(num)) {
                    return num;
                }
            }
        }
        return null;
    }
    
    private static isValidEpisodeForIsolation(num: number): boolean {
        return isValidEpisodeNumber(num) && 
               !PROVIDER_CONFIG.COMMON_RESOLUTIONS.includes(num as CommonResolution) &&
               num < PROVIDER_CONFIG.MAX_YEAR;
    }
}

// High-performance cache implementation with TypeScript generics
class PerformanceCache {
    private static readonly _cache = new Map<CacheKey, CacheEntry<any>>();
    private static _metrics: PerformanceMetrics = {
        searchTime: 0,
        parseTime: 0,
        cacheHits: 0,
        cacheMisses: 0,
        fuzzyMatchCount: 0
    };
    
    static get<T>(key: string): T | null {
        const cacheKey = this.createCacheKey(key);
        const entry = this._cache.get(cacheKey);
        
        if (!entry) {
            this._metrics.cacheMisses++;
            return null;
        }
        
        // Check TTL
        const now = Date.now() as Timestamp;
        if (now - entry.timestamp > PERFORMANCE_CONFIG.CACHE_TTL_MS) {
            this._cache.delete(cacheKey);
            this._metrics.cacheMisses++;
            return null;
        }
        
        this._metrics.cacheHits++;
        return entry.data;
    }
    
    static set<T>(key: string, data: T): void {
        // Prevent cache overflow
        if (this._cache.size >= PERFORMANCE_CONFIG.MAX_CACHE_SIZE) {
            const firstKey = this._cache.keys().next().value;
            if (firstKey) this._cache.delete(firstKey);
        }
        
        const cacheKey = this.createCacheKey(key);
        const entry: CacheEntry<T> = {
            data,
            timestamp: Date.now() as Timestamp,
            key: cacheKey
        };
        
        this._cache.set(cacheKey, entry);
    }
    
    private static createCacheKey(key: string): CacheKey {
        return key.toLowerCase().replace(/\s+/g, '_') as CacheKey;
    }
    
    static getMetrics(): ReadonlyPerformanceMetrics {
        return { ...this._metrics };
    }
    
    static incrementFuzzyCount(): void {
        this._metrics.fuzzyMatchCount++;
    }
    
    static recordSearchTime(time: number): void {
        this._metrics.searchTime += time;
    }
    
    static recordParseTime(time: number): void {
        this._metrics.parseTime += time;
    }
}

// Enhanced AnimePageExtractor with optimized fuzzy matching
class AnimePageExtractor {
    // Use lazy initialization to avoid temporal dead zone issues
    private static _fuzzyMatcher: FuzzyStringMatcher | null = null;
    
    private static get fuzzyMatcher(): FuzzyStringMatcher {
        if (!this._fuzzyMatcher) {
            this._fuzzyMatcher = new FuzzyStringMatcher();
        }
        return this._fuzzyMatcher;
    }
    static extractPageURL(html: string, query: string): string {
        try {
            console.log("Extracting anime page URL for query: " + query);
            
            // Check cache first
            const cacheKey = `page_extract_${query}`;
            const cached = PerformanceCache.get<string>(cacheKey);
            if (cached) {
                console.log("Cache hit for page extraction: " + query);
                return cached;
            }
            
            const potentialLinks: ScoreMatch[] = [];
            let match: RegExpExecArray | null;
            const linkRegex = new RegExp(REGEX_PATTERNS.ANIME_PAGE_LINK.source, 'gi');
            let processedCount = 0;
            
            while ((match = linkRegex.exec(html)) !== null) {
                const url = match[1];
                const title = match[2] || "";
                
                // Enhanced URL filtering
                if (AnimePageExtractor.shouldSkipURL(url) || title.length < PERFORMANCE_CONFIG.MIN_TITLE_LENGTH) {
                    continue;
                }
                
                const matchResult = AnimePageExtractor.calculateAdvancedMatchScore(query, title, url);
                if (matchResult.score > 0) {
                    potentialLinks.push(matchResult);
                    console.log(`Found potential match: ${title} (${url}) - Score: ${matchResult.score} (Strategy: ${matchResult.strategy})`);
                    
                    // Early exit for very high scores
                    if (matchResult.score >= PERFORMANCE_CONFIG.EARLY_EXIT_SCORE) {
                        console.log("Early exit triggered for high-scoring match");
                        const result = matchResult.url;
                        PerformanceCache.set(cacheKey, result);
                        return result;
                    }
                }
                
                processedCount++;
                // Limit fuzzy matching candidates to prevent performance degradation
                if (processedCount >= PERFORMANCE_CONFIG.MAX_FUZZY_CANDIDATES * 2) {
                    console.log("Limiting fuzzy matching candidates for performance");
                    break;
                }
            }
            
            const result = AnimePageExtractor.selectBestMatch(potentialLinks);
            if (result) {
                PerformanceCache.set(cacheKey, result);
            }
            return result;
            
        } catch (error) {
            console.log("Error extracting anime page URL: " + (error as Error).message);
            return "";
        }
    }
    
    private static shouldSkipURL(url: string): boolean {
        // Fast string-based filtering before regex
        const lowerUrl = url.toLowerCase();
        return EXCLUDED_URL_PATTERNS.some(pattern => lowerUrl.includes(pattern)) ||
               lowerUrl.includes('/page/') ||
               lowerUrl.includes('/search/') ||
               lowerUrl.includes('/category/') ||
               lowerUrl.includes('/?') ||
               lowerUrl.endsWith('.jpg') ||
               lowerUrl.endsWith('.png') ||
               lowerUrl.endsWith('.css') ||
               lowerUrl.endsWith('.js');
    }
    
    // Optimized matching with early termination and intelligent strategy selection
    private static calculateAdvancedMatchScore(query: string, title: string, url: string): ScoreMatch {
        PerformanceCache.incrementFuzzyCount();
        
        // Quick exact match check first (fastest)
        const queryLower = query.toLowerCase();
        const titleLower = title.toLowerCase();
        
        if (queryLower === titleLower) {
            return {
                url,
                title,
                score: 100 as FuzzyScore,
                strategy: 'exact',
                normalizedTitle: titleLower as NormalizedString
            };
        }
        
        // Quick substring check (fast)
        if (titleLower.includes(queryLower)) {
            return {
                url,
                title,
                score: 90 as FuzzyScore,
                strategy: 'exact',
                normalizedTitle: titleLower as NormalizedString
            };
        }
        
        // Compound word check (medium cost, high accuracy)
        const compoundScore = this.calculateCompoundWordScore(query, title);
        if (compoundScore >= 80) {
            return {
                url,
                title,
                score: compoundScore as FuzzyScore,
                strategy: 'phonetic',
                normalizedTitle: titleLower as NormalizedString
            };
        }
        
        // URL slug matching (medium cost)
        const urlSlug = this.extractSlugFromURL(url);
        if (urlSlug.length > 3) {
            const urlScore = this.fuzzyMatcher.match(query, urlSlug);
            if (urlScore >= 75) {
                return {
                    url,
                    title,
                    score: urlScore,
                    strategy: 'normalized',
                    normalizedTitle: titleLower as NormalizedString
                };
            }
        }
        
        // Expensive fuzzy matching only as last resort
        const normalizedQuery = this.fuzzyMatcher.normalize(query);
        const normalizedTitle = this.fuzzyMatcher.normalize(title);
        const fuzzyScore = this.fuzzyMatcher.match(normalizedQuery, normalizedTitle);
        
        const finalScore = isFuzzyScore(fuzzyScore) ? fuzzyScore : 0 as FuzzyScore;
        
        return {
            url,
            title,
            score: finalScore,
            strategy: 'fuzzy',
            normalizedTitle: isNormalizedString(normalizedTitle) ? normalizedTitle : undefined
        };
    }
    
    // Extract meaningful slug from URL for matching
    private static extractSlugFromURL(url: string): string {
        const slugMatch = url.match(/\/([^\/]+)\/?$/);
        if (slugMatch) {
            return slugMatch[1]
                .replace(/-/g, ' ')  // Convert dashes to spaces
                .replace(/_/g, ' ')  // Convert underscores to spaces
                .trim();
        }
        return "";
    }
    
    // Specialized matching for anime compound words (like "mahou tsukai" vs "mahoutsukai")
    private static calculateCompoundWordScore(query: string, title: string): number {
        const queryWords = query.toLowerCase().split(/\s+/);
        const titleLower = title.toLowerCase();
        
        // Check if joining query words matches title
        const joinedQuery = queryWords.join('');
        if (titleLower.includes(joinedQuery)) {
            return 85; // High score for compound word match
        }
        
        // Check if splitting common compound words in title matches query
        const expandedTitle = titleLower
            .replace(/mahoutsukai/g, 'mahou tsukai')
            .replace(/seireitsukai/g, 'seirei tsukai')
            .replace(/kenshi/g, 'ken shi')
            .replace(/yuusha/g, 'yuu sha');
        
        if (expandedTitle.includes(query.toLowerCase())) {
            return 80; // High score for expanded compound match
        }
        
        // Partial compound word matching
        let partialMatches = 0;
        for (const word of queryWords) {
            if (titleLower.includes(word) && word.length > 2) {
                partialMatches++;
            }
        }
        
        if (partialMatches > 0) {
            return Math.min(70, partialMatches * 25); // Partial compound score
        }
        
        return 0;
    }
    
    // Enhanced selection logic with better scoring and fallback strategies
    private static selectBestMatch(potentialLinks: ScoreMatch[]): string {
        if (potentialLinks.length === 0) {
            console.log("No anime page found");
            return "";
        }
        
        // Sort by score (highest first), then by strategy preference
        potentialLinks.sort((a, b) => {
            if (a.score !== b.score) {
                return (b.score as number) - (a.score as number);
            }
            // Prefer exact matches over fuzzy matches when scores are equal
            const strategyOrder: Record<MatchStrategy, number> = {
                'exact': 4,
                'fuzzy': 3,
                'normalized': 2,
                'phonetic': 1
            };
            return (strategyOrder[b.strategy] || 0) - (strategyOrder[a.strategy] || 0);
        });
        
        const bestMatch = potentialLinks[0];
        console.log(`Best match: ${bestMatch.title} - ${bestMatch.url} (Score: ${bestMatch.score}, Strategy: ${bestMatch.strategy})`);
        
        // Additional logging for debugging
        if (potentialLinks.length > 1) {
            console.log(`Alternative matches found (${potentialLinks.length - 1}):`);
            potentialLinks.slice(1, 3).forEach((match, index) => {
                console.log(`  ${index + 2}. ${match.title} - Score: ${match.score} (${match.strategy})`);
            });
        }
        
        return bestMatch.url;
    }
}

class HTTPClient {
    // Generic HTTP client with Result type for better error handling
    static async fetchWithUserAgent<T = string>(
        url: string, 
        parser?: (response: Response) => Promise<T>
    ): Promise<Result<T, { status: number; message: string }>> {
        try {
            const response = await fetch(url, {
                headers: {
                    "User-Agent": PROVIDER_CONFIG.USER_AGENT
                }
            });

            if (!response.ok) {
                return {
                    success: false,
                    error: {
                        status: response.status,
                        message: `HTTP ${response.status}: ${response.statusText}`
                    }
                };
            }

            const data = parser ? await parser(response) : await response.text() as T;
            return { success: true, data };

        } catch (error) {
            return {
                success: false,
                error: {
                    status: 0,
                    message: error instanceof Error ? error.message : 'Unknown error'
                }
            };
        }
    }
    
    // Legacy method for backward compatibility
    static async fetchWithUserAgentLegacy(url: string): Promise<Response> {
        return fetch(url, {
            headers: {
                "User-Agent": PROVIDER_CONFIG.USER_AGENT
            }
        });
    }
    
    static handleResponse(response: Response, context: string): boolean {
        if (!response.ok) {
            console.log(context + " failed with status: " + response.status);
            return false;
        }
        return true;
    }
}

// Advanced fuzzy matching utilities with TypeScript generics and constraints
class StringNormalizer {
    // Normalize string using character mapping with branded types
    static normalize(input: string): NormalizedString {
        let result = input.toLowerCase().trim();
        
        // Apply character normalizations
        for (const [from, to] of Object.entries(CHARACTER_NORMALIZATIONS)) {
            result = result.replace(new RegExp(from, 'g'), to);
        }
        
        // Apply anime-specific normalizations
        for (const variation of ANIME_TITLE_VARIATIONS.patterns) {
            result = result.replace(variation.from, variation.to);
        }
        
        // Normalize whitespace
        result = result.replace(/\s+/g, ' ').trim();
        
        return result as NormalizedString;
    }
    
    // Advanced string cleaning for better matching
    static clean(input: string): string {
        return input
            .replace(/[\[\](){}]/g, '') // Remove brackets
            .replace(/[^\w\s\-]/g, '') // Remove special chars except hyphens
            .replace(/\s+/g, ' ')
            .trim();
    }
}

// Levenshtein distance calculator with TypeScript constraints
class LevenshteinCalculator implements DistanceCalculator {
    calculate(a: string, b: string): StringDistance {
        const matrix: number[][] = [];
        const aLen = a.length;
        const bLen = b.length;
        
        // Initialize matrix
        for (let i = 0; i <= bLen; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= aLen; j++) {
            matrix[0][j] = j;
        }
        
        // Calculate distances
        for (let i = 1; i <= bLen; i++) {
            for (let j = 1; j <= aLen; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,     // insertion
                        matrix[i - 1][j] + 1      // deletion
                    );
                }
            }
        }
        
        const distance = matrix[bLen][aLen];
        return isValidStringDistance(distance) ? distance : 0 as StringDistance;
    }
    
    // Calculate similarity score from distance
    static calculateSimilarity(a: string, b: string, distance: StringDistance): number {
        const maxLen = Math.max(a.length, b.length);
        if (maxLen === 0) return 1;
        return Math.max(0, (maxLen - distance) / maxLen);
    }
}

// Advanced fuzzy string matcher with multiple strategies
class FuzzyStringMatcher implements StringMatcher<FuzzyMatchConfig> {
    private readonly distanceCalculator = new LevenshteinCalculator();
    
    match(query: string, target: string, config: FuzzyMatchConfig = FUZZY_MATCH_CONFIG): FuzzyScore {
        const strategies = [
            () => this.exactMatch(query, target, config.weights.exact),
            () => this.fuzzyMatch(query, target, config),
            () => this.normalizedMatch(query, target, config.weights.normalized),
            () => this.phoneticMatch(query, target, config.weights.phonetic)
        ];
        
        let bestScore = 0;
        
        for (const strategy of strategies) {
            const score = strategy();
            if (score > bestScore) {
                bestScore = score;
            }
            // Early exit for exact matches
            if (score === 100) break;
        }
        
        return isFuzzyScore(bestScore) ? bestScore : 0 as FuzzyScore;
    }
    
    normalize(input: string): NormalizedString {
        return StringNormalizer.normalize(input);
    }
    
    private exactMatch(query: string, target: string, weight: number): number {
        const queryNorm = query.toLowerCase().trim();
        const targetNorm = target.toLowerCase().trim();
        
        if (queryNorm === targetNorm) return weight;
        if (targetNorm.includes(queryNorm)) return weight * 0.8;
        if (queryNorm.includes(targetNorm)) return weight * 0.7;
        
        return 0;
    }
    
    private fuzzyMatch(query: string, target: string, config: FuzzyMatchConfig): number {
        const distance = this.distanceCalculator.calculate(query, target);
        
        if (distance > config.maxDistance) return 0;
        
        const similarity = LevenshteinCalculator.calculateSimilarity(query, target, distance);
        
        if (similarity < config.minSimilarity) return 0;
        
        return Math.round(similarity * config.weights.fuzzy);
    }
    
    private normalizedMatch(query: string, target: string, weight: number): number {
        const queryNorm = this.normalize(query);
        const targetNorm = this.normalize(target);
        
        if (queryNorm === targetNorm) return weight;
        if (targetNorm.includes(queryNorm)) return weight * 0.8;
        if (queryNorm.includes(targetNorm)) return weight * 0.7;
        
        // Try with cleaned versions (removing special characters)
        const queryClean = StringNormalizer.clean(queryNorm);
        const targetClean = StringNormalizer.clean(targetNorm);
        
        if (queryClean === targetClean) return weight * 0.6;
        if (targetClean.includes(queryClean)) return weight * 0.5;
        
        return 0;
    }
    
    private phoneticMatch(query: string, target: string, weight: number): number {
        // Simple phonetic matching for common anime title variations
        const queryPhonetic = this.toPhonetic(query);
        const targetPhonetic = this.toPhonetic(target);
        
        if (queryPhonetic === targetPhonetic) return weight;
        if (targetPhonetic.includes(queryPhonetic)) return weight * 0.7;
        
        return 0;
    }
    
    private toPhonetic(input: string): string {
        return input
            .toLowerCase()
            .replace(/ou/g, 'o')     // Convert long vowels
            .replace(/uu/g, 'u')
            .replace(/ei/g, 'e')
            .replace(/[^a-z0-9\s]/g, '') // Remove special chars
            .replace(/\s+/g, '')     // Remove spaces for phonetic comparison
            .trim();
    }
}

// Main provider class with performance optimizations
class Provider {
    private readonly api = PROVIDER_CONFIG.API_BASE_URL;
    private readonly translator = new PortugueseTranslator();

    // Returns the provider settings with const assertion for better type inference
    getSettings(): AnimeProviderSettings {
        return {
            canSmartSearch: true,
            smartSearchFilters: ["episodeNumber", "resolution", "query"] as const,
            supportsAdult: false,
            type: "main"
        } as const satisfies AnimeProviderSettings;
    }

    // Returns the search results using advanced error handling and type safety
    async search(opts: AnimeSearchOptions): Promise<AnimeTorrent[]> {
        const startTime = Date.now();
        console.log("Searching for: " + opts.query);
        
        try {
            // Check cache first
            const cacheKey = `search_${opts.query}`;
            const cached = PerformanceCache.get<AnimeTorrent[]>(cacheKey);
            if (cached) {
                console.log("Cache hit for search: " + opts.query);
                PerformanceCache.recordSearchTime(Date.now() - startTime);
                return cached;
            }
            
            // Use the translator instance with type safety
            const convertedQuery = this.translator.parse(opts.query);
            console.log("Converted query: " + convertedQuery);
            
            const searchURL = `${this.api}/?s=${encodeURIComponent(convertedQuery)}` as SearchURL;
            console.log("Search URL: " + searchURL);
            
            // Use the new Result-based HTTP client
            const fetchResult = await HTTPClient.fetchWithUserAgent(searchURL);
            
            if (!fetchResult.success) {
                console.log(`Search failed: ${fetchResult.error.message} (Status: ${fetchResult.error.status})`);
                PerformanceCache.recordSearchTime(Date.now() - startTime);
                return [];
            }

            const animePageURL = AnimePageExtractor.extractPageURL(fetchResult.data, convertedQuery);
            
            if (!animePageURL) {
                console.log("No anime page found for: " + opts.query);
                PerformanceCache.recordSearchTime(Date.now() - startTime);
                return [];
            }

            console.log("Found anime page: " + animePageURL);
            
            // Fetch torrents with improved error handling
            const results = await this.fetchTorrentsFromAnimePage(animePageURL, opts.media);
            
            // Cache successful results
            if (results.length > 0) {
                PerformanceCache.set(cacheKey, results);
            }
            
            PerformanceCache.recordSearchTime(Date.now() - startTime);
            return results;
            
        } catch (error) {
            console.log("Error in search: " + (error as Error).message);
            PerformanceCache.recordSearchTime(Date.now() - startTime);
            return [];
        }
    }

    // Returns the search results depending on the search options.
    async smartSearch(opts: AnimeSmartSearchOptions): Promise<AnimeTorrent[]> {
        try {
            const query = opts.query || opts.media.romajiTitle || opts.media.englishTitle || "";
            const episodeNumber = opts.episodeNumber || 1;
            
            console.log("Smart search for: " + query + " - Episode: " + episodeNumber);
            
            // Use search method first to find the anime page (conversion will happen inside search)
            const searchResults = await this.search({ media: opts.media, query: query });
            
            if (searchResults.length === 0) {
                return [];
            }
            
            return this.applySmartSearchFilters(searchResults, opts);
            
        } catch (error) {
            console.log("Error in smart search: " + (error as Error).message);
            return [];
        }
    }
    
    // Apply smart search filters using functional programming patterns
    private applySmartSearchFilters(
        results: AnimeTorrent[], 
        opts: AnimeSmartSearchOptions
    ): AnimeTorrent[] {
        // Define filter predicates with proper typing - using any for external interface compatibility
        type FilterPredicate = (torrent: any) => boolean;
        
        const filters: FilterPredicate[] = [];
        
        // Episode number filter with type safety
        if (opts.episodeNumber && opts.episodeNumber > 0) {
            filters.push((t: any) => 
                t.episodeNumber === opts.episodeNumber || 
                t.isBatch || 
                t.episodeNumber === -1
            );
        }
        
        // Resolution filter with template literal type checking
        if (opts.resolution) {
            filters.push((t: any) => 
                !t.resolution || 
                t.resolution.includes(opts.resolution!)
            );
        }
        
        // Batch filter
        if (opts.batch) {
            filters.push((t: any) => t.isBatch);
        }
        
        // Apply all filters using functional composition
        return filters.reduce(
            (filteredResults, filter) => filteredResults.filter(filter),
            results
        );
    }

    // Scrapes the torrent page to get the info hash.
    async getTorrentInfoHash(torrent: AnimeTorrent): Promise<string> {
        console.log("Getting info hash for torrent: " + (torrent.name || "Unknown"));
        
        // Validate torrent object
        if (!torrent || typeof torrent !== 'object') {
            console.log("Invalid torrent object provided");
            return "";
        }
        
        if (torrent.infoHash && torrent.infoHash.length === 40) {
            console.log("Info hash found: " + torrent.infoHash);
            return torrent.infoHash;
        }
        
        // Try to extract from magnet link if not already extracted
        if (torrent.magnetLink && isValidMagnetLink(torrent.magnetLink)) {
            console.log("Trying to extract info hash from magnet link...");
            const infoHash = TorrentParser.extractInfoHash(torrent.magnetLink);
            if (infoHash) {
                console.log("Extracted info hash from magnet link: " + infoHash);
                return infoHash;
            }
        }
        
        // No valid torrent data found - return empty string instead of mock data
        console.log("No valid info hash found for torrent: " + (torrent.name || "Unknown"));
        return "";
    }

    // Scrapes the torrent page to get the magnet link.
    async getTorrentMagnetLink(torrent: AnimeTorrent): Promise<string> {
        console.log("Getting magnet link for torrent: " + (torrent.name || "Unknown"));
        
        // Validate torrent object
        if (!torrent || typeof torrent !== 'object') {
            console.log("Invalid torrent object provided");
            return "";
        }
        
        if (torrent.magnetLink && isValidMagnetLink(torrent.magnetLink)) {
            console.log("Magnet link found: " + torrent.magnetLink.substring(0, 100) + "...");
            return torrent.magnetLink;
        }
        
        // No valid magnet link found - return empty string instead of mock data
        console.log("No valid magnet link found for torrent: " + (torrent.name || "Unknown"));
        return "";
    }

    // Returns the latest torrents (required even for "special" type)
    async getLatest(): Promise<AnimeTorrent[]> {
        // DarkMahou doesn't have a "latest" page, return empty array
        return [];
    }
    
    // Performance monitoring method for debugging
    getPerformanceMetrics(): ReadonlyPerformanceMetrics {
        const metrics = PerformanceCache.getMetrics();
        console.log("Performance Metrics:", {
            searchTime: metrics.searchTime + "ms",
            parseTime: metrics.parseTime + "ms", 
            cacheHits: metrics.cacheHits,
            cacheMisses: metrics.cacheMisses,
            fuzzyMatchCount: metrics.fuzzyMatchCount,
            cacheEfficiency: metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses) * 100 + "%"
        });
        return metrics;
    }



    // Fetch torrents from anime page with improved error handling
    private async fetchTorrentsFromAnimePage(pageURL: string, _media: Media): Promise<AnimeTorrent[]> {
        console.log("Fetching torrents from: " + pageURL);
        
        const fetchResult = await HTTPClient.fetchWithUserAgent(pageURL);
        
        if (!fetchResult.success) {
            console.log(`Failed to fetch anime page: ${fetchResult.error.message} (Status: ${fetchResult.error.status})`);
            return [];
        }

        return this.parseTorrentsFromHTML(fetchResult.data, pageURL);
    }

    // Optimized torrent parsing using only regex (LoadDoc removed due to consistent failures)
    private parseTorrentsFromHTML(html: string, pageURL: string): AnimeTorrent[] {
        const startTime = Date.now();
        
        try {
            console.log("Parsing torrents from HTML using optimized regex...");
            
            // Check cache first
            const cacheKey = `torrents_${pageURL}`;
            const cached = PerformanceCache.get<AnimeTorrent[]>(cacheKey);
            if (cached) {
                console.log("Cache hit for torrents parsing: " + pageURL);
                PerformanceCache.recordParseTime(Date.now() - startTime);
                return cached;
            }
            
            const results = this.parseWithOptimizedRegex(html, pageURL);
            
            // Cache successful results
            if (results.length > 0) {
                PerformanceCache.set(cacheKey, results);
            }
            
            PerformanceCache.recordParseTime(Date.now() - startTime);
            return results;
            
        } catch (error) {
            console.log("Error parsing torrents: " + (error as Error).message);
            PerformanceCache.recordParseTime(Date.now() - startTime);
            return [];
        }
    }
    

    // Optimized regex parsing (primary method, LoadDoc removed)
    private parseWithOptimizedRegex(html: string, pageURL: string): AnimeTorrent[] {
        const results: AnimeTorrent[] = [];
        
        try {
            console.log("Using optimized regex to find magnet links...");
            
            const magnetMatches = html.match(REGEX_PATTERNS.MAGNET_LINK);
            
            if (magnetMatches && magnetMatches.length > 0) {
                console.log("Found " + magnetMatches.length + " magnet links in page");
                
                // Process magnet links with deduplication
                const seenInfoHashes = new Set<string>();
                
                for (let i = 0; i < magnetMatches.length; i++) {
                    const magnetLink = magnetMatches[i];
                    
                    // Skip duplicates based on info hash
                    const infoHash = TorrentParser.extractInfoHash(magnetLink);
                    if (infoHash && seenInfoHashes.has(infoHash)) {
                        continue;
                    }
                    if (infoHash) seenInfoHashes.add(infoHash);
                    
                    const torrentName = this.extractTorrentNameFromMagnet(magnetLink, i + 1);
                    
                    results.push(this.createAnimeTorrent(
                        torrentName,
                        magnetLink,
                        pageURL,
                        TorrentParser.parseResolution(torrentName),
                        ""
                    ));
                }
            }
            
            console.log("Optimized regex parsing found " + results.length + " unique torrents");
            return results;
            
        } catch (error) {
            console.log("Error in optimized regex parsing: " + (error as Error).message);
            return [];
        }
    }
    
    // Extract torrent name from magnet link
    private extractTorrentNameFromMagnet(magnetLink: string, fallbackNumber: number): string {
        const dnMatch = magnetLink.match(/&dn=([^&]+)/);
        if (dnMatch) {
            try {
                return decodeURIComponent(dnMatch[1]);
            } catch (e) {
                return dnMatch[1];
            }
        }
        return "Episode " + fallbackNumber;
    }

    // Create AnimeTorrent object with improved type safety and validation
    private createAnimeTorrent(
        name: string, 
        magnetLink: string, 
        pageURL: string, 
        resolution: string, 
        episodeTitle: string
    ) {
        // Use type-safe parsing methods
        const infoHash = TorrentParser.extractInfoHash(magnetLink);
        const parsedResolution = TorrentParser.parseResolution(name) || resolution;
        const isBatch = TorrentParser.isBatchTorrent(name, episodeTitle);
        const episodeNumber = TorrentParser.extractEpisodeNumber(name, episodeTitle);
        const releaseGroup = TorrentParser.extractReleaseGroup(name);
        
        console.log(`Creating torrent: ${name} - InfoHash: ${infoHash} - MagnetLink length: ${magnetLink.length}`);
        
        // Use object shorthand and better typing - return type inferred from external AnimeTorrent interface
        return {
            name,
            date: new Date().toISOString(),
            size: 0,
            formattedSize: "N/A" as const,
            seeders: 0,
            leechers: 0,
            downloadCount: 0,
            link: pageURL,
            downloadUrl: "" as const,
            magnetLink,
            infoHash: infoHash as string, // Cast back to string for interface compatibility
            resolution: parsedResolution,
            isBatch,
            episodeNumber: episodeNumber as number, // Cast back to number for interface compatibility
            releaseGroup,
            isBestRelease: false as const,
            confirmed: true as const
        };
    }

}
