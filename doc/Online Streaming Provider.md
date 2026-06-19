# Online Streaming Provider

> [!WARNING]
> Difficulty: Moderate

<details>

<summary>Use bootstrapping command</summary>

You can use the local `create-provider.sh` script to help you quickly bootstrap a folder, register the extension, and extract high-quality icons:

```bash
./create-provider.sh
```

</details>

## Types

**`online-streaming-provider.d.ts`**:


```typescript
declare type SearchResult = {
    id: string
    title: string
    url: string
    subOrDub: SubOrDub
}

declare type SubOrDub = "sub" | "dub" | "both"

declare type EpisodeDetails = {
    id: string
    number: number
    url: string
    title?: string
}

declare type EpisodeServer = {
    server: string
    headers: { [key: string]: string }
    videoSources: VideoSource[]
}

declare type VideoSourceType = "mp4" | "m3u8" | "unknown"

declare type VideoSource = {
    url: string
    type: VideoSourceType
    // Quality or label of the video source, should be unique (e.g. "1080p", "1080p - English")
    quality: string
    // Secondary label of the video source (e.g. "English")
    label?: string
    subtitles: VideoSubtitle[]
}

declare type VideoSubtitle = {
    id: string
    url: string
    language: string
    isDefault: boolean
}

declare interface Media {
    id: number
    idMal?: number
    status?: string
    format?: string
    englishTitle?: string
    romajiTitle?: string
    episodeCount?: number
    absoluteSeasonOffset?: number
    synonyms: string[]
    isAdult: boolean
    startDate?: FuzzyDate
}

declare interface FuzzyDate {
    year: number
    month?: number
    day?: number
}

declare type SearchOptions = {
    media: Media
    query: string
    dub: boolean
    year?: number
}

declare type Settings = {
    episodeServers: string[]
    supportsDub: boolean
}

declare abstract class AnimeProvider {
    search(opts: SearchOptions): Promise<SearchResult[]>

    findEpisodes(id: string): Promise<EpisodeDetails[]>

    findEpisodeServer(episode: EpisodeDetails, server: string): Promise<EpisodeServer>

    getSettings(): Settings
}

```


## Code

> [!WARNING]
> Do not change the name of the class. It must be Provider.

```typescript
/// <reference path="./online-streaming-provider.d.ts" />
 
class Provider {

    getSettings(): Settings {
        return {
            episodeServers: ["server1", "server2"],
            supportsDub: true,
        }
    }

    async search(query: SearchOptions): Promise<SearchResult[]> {
        return [{
            id: "1",
            title: "Anime Title",
            url: "https://example.com/anime/1",
            subOrDub: "both",
        }]
    }
    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        return [{
            id: "1",
            number: 1,
            url: "https://example.com/episode/1",
            title: "Episode title",
        }]
    }
    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        let server = "server1"
        if (_server !== "default") server = _server
        
        return {
            server: server,
            headers: {},
            videoSources: [{
                url: "https://example.com/.../stream.m3u8",
                type: "m3u8",
                quality: "1080p",
                subtitles: [{
                    id: "1",
                    url: "https://example.com/.../subs.vtt",
                    language: "en",
                    isDefault: true,
                }],
            }],
        }
    }
}
```

## Example

```typescript
/// <reference path=".onlinestream-provider.d.ts" />
/// <reference path="./core.d.ts" />

type EpisodeData = {
    id: number; episode: number; title: string; snapshot: string; filler: number; session: string; created_at?: string
}

type AnimeData = {
    id: number; title: string; type: string; year: number; poster: string; session: string
}

class Provider {

    api = "https://example.com"
    headers = { Referer: "https://example.com" }

    getSettings(): Settings {
        return {
            episodeServers: ["kwik"],
            supportsDub: false,
        }
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const req = await fetch(`${this.api}/api?m=search&q=${encodeURIComponent(opts.query)}`, {
            headers: {
                Cookie: "__ddg1_=;__ddg2_=;",
            },
        })

        if (!req.ok) {
            return []
        }
        const data = (await req.json()) as { data: AnimeData[] }
        const results: SearchResult[] = []

        if (!data?.data) {
            return []
        }

        data.data.map((item: AnimeData) => {
            results.push({
                subOrDub: "sub",
                id: item.session,
                title: item.title,
                url: "",
            })
        })

        return results
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        let episodes: EpisodeDetails[] = []

        const req =
            await fetch(
                `${this.api}${id.includes("-") ? `/anime/${id}` : `/a/${id}`}`,
                {
                    headers: {
                        Cookie: "__ddg1_=;__ddg2_=;",
                    },
                },
            )

        const html = await req.text()


        function pushData(data: EpisodeData[]) {
            for (const item of data) {
                episodes.push({
                    id: item.session + "$" + id,
                    number: item.episode,
                    title: item.title && item.title.length > 0 ? item.title : "Episode " + item.episode,
                    url: req.url,
                })
            }
        }

        const $ = LoadDoc(html)

        const tempId = $("head > meta[property='og:url']").attr("content")!.split("/").pop()!

        const { last_page, data } = (await (
            await fetch(`${this.api}/api?m=release&id=${tempId}&sort=episode_asc&page=1`, {
                headers: {
                    Cookie: "__ddg1_=;__ddg2_=;",
                },
            })
        ).json()) as {
            last_page: number;
            data: EpisodeData[]
        }

        pushData(data)

        const pageNumbers = Array.from({ length: last_page - 1 }, (_, i) => i + 2)

        const promises = pageNumbers.map((pageNumber) =>
            fetch(`${this.api}/api?m=release&id=${tempId}&sort=episode_asc&page=${pageNumber}`, {
                headers: {
                    Cookie: "__ddg1_=;__ddg2_=;",
                },
            }).then((res) => res.json()),
        )
        const results = (await Promise.all(promises)) as {
            data: EpisodeData[]
        }[]

        results.forEach((showData) => {
            for (const data of showData.data) {
                if (data) {
                    pushData([data])
                }
            }
        });
        (data as any[]).sort((a, b) => a.number - b.number)

        if (episodes.length === 0) {
            throw new Error("No episodes found.")
        }


        const lowest = episodes[0].number
        if (lowest > 1) {
            for (let i = 0; i < episodes.length; i++) {
                episodes[i].number = episodes[i].number - lowest + 1
            }
        }

        // Remove episode with decimal numbers (those aren't supported)
        episodes = episodes.filter((episode) => Number.isInteger(episode.number))

        return episodes
    }

    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        const episodeId = episode.id.split("$")[0]
        const animeId = episode.id.split("$")[1]

        console.log(`${this.api}/play/${animeId}/${episodeId}`)

        const req = await fetch(
            `${this.api}/play/${animeId}/${episodeId}`,
            {
                headers: {
                    Cookie: "__ddg1_=;__ddg2_=;",
                },
            },
        )

        const html = await req.text()

        const regex = /https:\/\/kwik\.si\/e\/\w+/g
        const matches = html.match(regex)

        if (matches === null) {
            throw new Error("Failed to fetch episode server.")
        }

        const $ = LoadDoc(html)

        const result: EpisodeServer = {
            videoSources: [],
            headers: this.headers ?? {},
            server: "kwik",
        }

        $("button[data-src]").each(async (_, el) => {
            let videoSource: VideoSource = {
                url: "",
                type: "m3u8",
                quality: "",
                subtitles: [],
            }

            videoSource.url = el.data("src")!
            if (!videoSource.url) {
                return
            }

            const fansub = el.data("fansub")!
            const quality = el.data("resolution")!

            videoSource.quality = `${quality}p - ${fansub}`

            if (el.data("audio") === "eng") {
                videoSource.quality += " (Eng)"
            }

            if (videoSource.url === matches[0]) {
                videoSource.quality += " (default)"
            }

            result.videoSources.push(videoSource)
        })

        const queries = result.videoSources.map(async (videoSource) => {
            try {
                const src_req = await fetch(videoSource.url, {
                    headers: {
                        Referer: this.headers.Referer,
                        "user-agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36 Edg/107.0.1418.56",
                    },
                })

                const src_html = await src_req.text()

                const scripts = src_html.match(/eval\(f.+?\}\)\)/g)
                if (!scripts) {
                    return
                }

                for (const _script of scripts) {
                    const scriptMatch = _script.match(/eval(.+)/)
                    if (!scriptMatch || !scriptMatch[1]) {
                        continue
                    }

                    try {
                        const decoded = eval(scriptMatch[1])
                        const link = decoded.match(/source='(.+?)'/)
                        if (!link || !link[1]) {
                            continue
                        }

                        videoSource.url = link[1]

                    }
                    catch (e) {
                        console.error("Failed to extract kwik link", e)
                    }

                }

            }
            catch (e) {
                console.error("Failed to fetch kwik link", e)
            }
        })

        await Promise.all(queries)

        return result
    }
}
```
