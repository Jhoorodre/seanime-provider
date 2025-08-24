/// <reference path="./online-streaming-provider.d.ts" />
/// <reference path="./core.d.ts" />

// DTOs (Data Transfer Objects)
interface PagePropDto<T> {
    pageProps: {
        data: T
    }
}

interface LatestAnimeDto {
    data_releases: Array<{
        episode: EpisodeDto
    }>
}

interface MovieInfoDto {
    data_movie: AnimeDataDto
}

interface AnimeDataDto {
    diretor?: string
    titulo?: string
    nome_filme?: string
    sinopse?: string
    sinopse_filme?: string
    slug_serie?: string
    slug_filme?: string
    duracao?: string
    generate_id: string
    animeCalendar?: string | null
    od?: string
}

interface EpisodeListDto {
    data: EpisodeDto[]
    meta: {
        totalOfPages: number
    }
}

interface EpisodeDto {
    n_episodio: string
    anime?: AnimeDataDto | null
}

interface SearchResultsDto {
    data_anime: AnimeDataDto[]
    data_filme: AnimeDataDto[]
}

class Provider {
    private baseUrl = "https://www.anroll.net"
    private oldApiUrl = "https://apiv2-prd.anroll.net"
    private newApiUrl = "https://apiv3-prd.anroll.net"
    private headers = { 
        "Referer": this.baseUrl,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    getSettings(): Settings {
        return {
            episodeServers: ["default"],
            supportsDub: false,
        }
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        try {
            const searchQuery = opts.query || opts.media.romajiTitle || opts.media.englishTitle || ""
            
            const response = await fetch(`${this.oldApiUrl}/search?q=${encodeURIComponent(searchQuery)}`, {
                headers: this.headers
            })
            
            if (!response.ok) {
                console.error("Search request failed:", response.status)
                return []
            }
            
            const data: SearchResultsDto = await response.json()
            const results: SearchResult[] = []
            
            // Combine animes and movies
            const allItems = [...(data.data_anime || []), ...(data.data_filme || [])]
            
            for (const item of allItems) {
                const isMovie = !item.slug_serie || item.slug_serie === ""
                const title = item.titulo || item.nome_filme || ""
                const id = isMovie ? `f/${item.generate_id}` : `anime/${item.slug_serie}`
                
                results.push({
                    id: id,
                    title: title,
                    url: `${this.baseUrl}/${id}`,
                    subOrDub: "sub" // AnimesROLL only has subs
                })
            }
            
            return results
        } catch (error) {
            console.error("Search error:", error)
            return []
        }
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        try {
            const url = `${this.baseUrl}/${id}`
            const response = await fetch(url, {
                headers: this.headers
            })
            
            if (!response.ok) {
                throw new Error(`Failed to fetch anime details: ${response.status}`)
            }
            
            const html = await response.text()
            const animeData = this.parseNextData<AnimeDataDto | MovieInfoDto>(html)
            
            // Check if it's a movie
            if (id.startsWith("f/")) {
                const movieData = 'data_movie' in animeData ? animeData.data_movie : animeData as AnimeDataDto
                
                if (movieData.od) {
                    return [{
                        id: `${movieData.od}/filme`,
                        number: 1,
                        url: `${this.oldApiUrl}/od/${movieData.od}/filme.mp4`,
                        title: "Filme"
                    }]
                }
                return []
            }
            
            // It's a series, fetch episodes
            const anime = animeData as AnimeDataDto
            const episodes = await this.fetchAllEpisodes(anime.generate_id)
            
            return episodes.map(ep => ({
                id: `${anime.slug_serie}/${ep.n_episodio}`,
                number: parseFloat(ep.n_episodio),
                url: `https://cdn-01.gamabunta.xyz/hls/animes/${anime.slug_serie}/${ep.n_episodio}.mp4/media-1/stream.m3u8`,
                title: `Episódio #${ep.n_episodio}`
            })).sort((a, b) => a.number - b.number)
            
        } catch (error) {
            console.error("Find episodes error:", error)
            return []
        }
    }

    async findEpisodeServer(episode: EpisodeDetails, server: string): Promise<EpisodeServer> {
        try {
            // For movies, the URL is already direct
            if (episode.id.includes("/filme")) {
                return {
                    server: "default",
                    headers: this.headers,
                    videoSources: [{
                        url: episode.url,
                        type: "mp4",
                        quality: "HD",
                        subtitles: []
                    }]
                }
            }
            
            // For series episodes, use the m3u8 stream
            return {
                server: "default",
                headers: this.headers,
                videoSources: [{
                    url: episode.url,
                    type: "m3u8",
                    quality: "HD",
                    subtitles: []
                }]
            }
        } catch (error) {
            console.error("Find episode server error:", error)
            throw new Error("Failed to get video sources")
        }
    }

    // Helper methods
    private parseNextData<T>(html: string): T {
        try {
            // Extract __NEXT_DATA__ script content
            const scriptMatch = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)
            if (!scriptMatch) {
                throw new Error("Could not find __NEXT_DATA__ script")
            }
            
            const jsonStr = scriptMatch[1]
            const data = JSON.parse(jsonStr)
            
            // Navigate to the actual data based on the structure
            if (data.props?.pageProps?.data) {
                return data.props.pageProps.data
            }
            
            // Try alternative structure
            const propsMatch = jsonStr.match(/"pageProps":({.*?}),"page"/)
            if (propsMatch) {
                const pageProps = JSON.parse(propsMatch[1])
                return pageProps.data
            }
            
            throw new Error("Could not parse data structure")
        } catch (error) {
            console.error("Parse error:", error)
            throw error
        }
    }

    private async fetchAllEpisodes(animeId: string, page: number = 1): Promise<EpisodeDto[]> {
        try {
            const response = await fetch(
                `${this.newApiUrl}/animes/${animeId}/episodes?page=${page}&order=desc`,
                { headers: this.headers }
            )
            
            if (!response.ok) {
                console.error(`Failed to fetch episodes page ${page}:`, response.status)
                return []
            }
            
            const data: EpisodeListDto = await response.json()
            let episodes = data.data || []
            
            // Recursively fetch more pages if available
            if (data.meta && data.meta.totalOfPages > page) {
                const nextPageEpisodes = await this.fetchAllEpisodes(animeId, page + 1)
                episodes = episodes.concat(nextPageEpisodes)
            }
            
            return episodes
        } catch (error) {
            console.error(`Error fetching episodes page ${page}:`, error)
            return []
        }
    }
}
