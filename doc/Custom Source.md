# Custom Source

Note: You cannot test custom sources in the playground. Load them in development mode ([like here](https://seanime.gitbook.io/seanime-extensions/content-providers/pages/MjcdvXTd5UlAZTG2Soio#id-2.-create-a-manifest-file)).

{% hint style="warning" %}
Difficulty: Moderate
{% endhint %}

## Type Definitions

{% code title="custom-source.d.ts" %}

```typescript
/// <reference path="./app.d.ts" />

declare type Settings = {
    supportsAnime: boolean
    supportsManga: boolean
}

declare type ListResponse<T extends $app.AL_BaseAnime | $app.AL_BaseManga> = {
    media: T[]
    page: number
    totalPages: number
    total: number
}

declare abstract class CustomSource {
    getSettings(): Settings

    async getAnime(ids: number[]): Promise<$app.AL_BaseAnime[]>

    async getAnimeMetadata(id: number): Promise<$app.Metadata_AnimeMetadata | null>

    async getAnimeWithRelations(id: number): Promise<$app.AL_CompleteAnime>

    async getAnimeDetails(id: number): Promise<$app.AL_AnimeDetailsById_Media | null>

    async getManga(ids: number[]): Promise<$app.AL_BaseManga[]>

    async listAnime(search: string, page: number, perPage: number): Promise<ListResponse<$app.AL_BaseAnime>>

    async getMangaDetails(id: number): Promise<$app.AL_MangaDetailsById_Media | null>

    async listManga(search: string, page: number, perPage: number): Promise<ListResponse<$app.AL_BaseManga>>
}

```

{% endcode %}

Keyword search the various $app types used here:

{% embed url="<https://raw.githubusercontent.com/5rahim/seanime/refs/heads/main/internal/extension_repo/goja_plugin_types/app.d.ts>" %}

## Code

{% hint style="warning" %}
Do not change the name of the class. It must be Provider.
{% endhint %}

{% hint style="info" %}
You can define the media objects in an external API and use fetch to retrieve them dynamically.
{% endhint %}

### Media objects

Under the hood, custom source media are treated like AniList media, which is the reason why you need to return objects following AniList's JSON schemas.

For the media `id`s, you're free to use any number starting from 1. Under the hood, Seanime will automatically convert these IDs to unique numbers to avoid conflicts.

```typescript
/// <reference path="./manga-provider.d.ts" />

const anime: Record<number, $app.AL_CompleteAnime> = {}
const animeMetadata: Record<number, $app.Metadata_AnimeMetadata> = {}
const manga: Record<number, $app.AL_BaseManga> = {}

class Provider implements CustomSource {
    getSettings(): Settings {
        return {
            supportsAnime: true,
            supportsManga: true,
        }
    }

    // Returns all requested anime objects.
    async getAnime(ids: number[]): Promise<$app.AL_BaseAnime[]> {
        let ret: $app.AL_BaseAnime[] = []
        for (const id of ids) {
            if (anime[id]) {
                // Here we make a deep copy and remove the 'relations' attribute
                // this turn AL_CompleteAnime into AL_BaseAnime
                const a = $clone(media[id]) as $app.AL_CompleteAnime
                delete a["relations"]
                ret.push(a)
            }
        }
        return ret
    }

    // Optionally returns the details for an anime (genres, trailer, etc.)
    // Note that not all the fields are used by the client.
    async getAnimeDetails(id: number): Promise<$app.AL_AnimeDetailsById_Media | null> {
        return null
    }

    // Returns the metadata for an anime.
    // This is used for episodes.
    async getAnimeMetadata(id: number): Promise<$app.Metadata_AnimeMetadata | null> {
        return animeMetadata[id]
    }

    // Returns the anime object with its 'relations'.
    // This is only used by the library scanner to build a relation tree.
    async getAnimeWithRelations(id: number): Promise<$app.AL_CompleteAnime> {
        if (media[id]) {
            return media[id] as $app.AL_CompleteAnime
        }
        throw new Error("not found.")
    }

    // Returns all requested manga objects.
    async getManga(ids: number[]): Promise<$app.AL_BaseManga[]> {
        let ret: $app.AL_BaseManga[] = []
        for (const id of ids) {
            if (manga[id]) {
                ret.push(manga[id])
            }
        }
        return ret
    }

    // Optionally returns the manga details.
    // Similarly to getAnimeDetails, not all fields will be used by the client.
    async getMangaDetails(id: number): Promise<$app.AL_MangaDetailsById_Media | null> {
        return null
    }

    // Returns all anime available on the extension.
    async listAnime(search: string, page: number, perPage: number): Promise<ListResponse<$app.AL_BaseAnime>> {
        return {
            media: Object.values(media),
            total: 1,
            page: 1,
            totalPages: 1,
        }
    }

    // Returns all manga available on the extension.
    async listManga(search: string, page: number, perPage: number): Promise<ListResponse<$app.AL_BaseManga>> {
        return {
            media: Object.values(manga),
            total: 1,
            page: 1,
            totalPages: 1,
        }
    }

}
```