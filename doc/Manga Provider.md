# Manga Provider

{% hint style="success" %}
Difficulty: Easy
{% endhint %}

<details>

<summary>Use bootstrapping command</summary>

You can use this third-party tool to help you quickly bootstrap a folder locally

```bash
npx seanime-tool g-template
```

</details>

## Types

{% code title="manga-provider.d.ts" %}

```typescript
declare type SearchResult = {
    id: string
    title: string
    synonyms?: string[]
    year?: number
    image?: string
}

declare type ChapterDetails = {
    id: string
    url: string
    title: string
    chapter: string
    index: number
    scanlator?: string
    language?: string
    rating?: number
    updatedAt?: string
}

declare type ChapterPage = {
    url: string
    index: number
    headers: { [key: string]: string }
}

declare type QueryOptions = {
    query: string
    year?: number
}

declare type Settings = {
    supportsMultiLanguage?: boolean
    supportsMultiScanlator?: boolean
}

declare abstract class MangaProvider {
    search(opts: QueryOptions): Promise<SearchResult[]>
    findChapters(id: string): Promise<ChapterDetails[]>
    findChapterPages(id: string): Promise<ChapterPage[]>

    getSettings(): Settings
}
```

{% endcode %}

## Code

{% hint style="warning" %}
Do not change the name of the class. It must be Provider.
{% endhint %}

```typescript
/// <reference path="./manga-provider.d.ts" />
 
class Provider {
    private api = "https://example.com"
		
    getSettings(): Settings {
        return {
            supportsMultiLanguage: false,
            supportsMultiScanlator: false,
        }
    }

    // Returns the search results based on the query.
    async search(opts: QueryOptions): Promise<SearchResult[]> {
	// TODO
        return [{
            id: "999",
            title: "Manga Title",
            synonyms: ["Synonym 1", "Synonym 2"],
            year: 2021,
            image: "https://example.com/image.jpg",
        }]
    }
    
    // Returns the chapters based on the manga ID.
    // The chapters should be sorted in ascending order (0, 1, ...).
    async findChapters(mangaId: string): Promise<ChapterDetails[]> {
	// TODO
        return [{
            id: `999-chapter-1`,
            url: "https://example.com/manga/999-chapter-1",
            title: "Chapter 1",
            chapter: "1",
            index: 0,
        }]
    }
    
    // Returns the chapter pages based on the chapter ID.
    // The pages should be sorted in ascending order (0, 1, ...).
    async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
	// TODO
        return [{
            url: "https://example.com/manga/999-chapter-1/page-1.jpg",
            index: 0,
            headers: {
                "Referer": "https://example.com/manga/999/chapter-1",
            },
        }]
    }
}
```

### Workflow

`search` is called twice when the user opens the manga page. Each time with a different manga title as query (English, Romaji).

The best match will automatically be selected and `findChapters` will be called with the manga ID from the search result to get the list of chapters.

[![image-url-https-266901462-files-gitbook-io-files-v0-b-gitbook-x-prod-appspot-c.png](https://i.postimg.cc/Qt8NCNnz/image-url-https-266901462-files-gitbook-io-files-v0-b-gitbook-x-prod-appspot-c.png)](https://postimg.cc/KKWhsbb7)

`findChapterPages` is called when the user requests to read or download the chapter.

[![image-url-https-266901462-files-gitbook-io-files-v0-b-gitbook-x-prod-appspot-c.png](https://i.postimg.cc/RVkMfLDp/image-url-https-266901462-files-gitbook-io-files-v0-b-gitbook-x-prod-appspot-c.png)](https://postimg.cc/N5xqvmYR)

### Manga ID, Chapter ID

Depending on the source website you’re getting the data from, the URLs might get a little complex.

For example, if a manga’s chapter page is: [`https://example.com/manga/999/chapter-1`](https://example.com/manga/999/chapter-1) consisting of 2 URL sections (in this case, the manga ID and the chapter ID), you can construct the Seanime chapter ID by combining the two parts and splitting them in `findChapterPages` .

[![image-url-https-266901462-files-gitbook-io-files-v0-b-gitbook-x-prod-appspot-c.jpg](https://i.postimg.cc/G2mrr74y/image-url-https-266901462-files-gitbook-io-files-v0-b-gitbook-x-prod-appspot-c.jpg)](https://postimg.cc/TyFBJcqd)

### Settings

* If your manga source supports multiple languages for chapters and you want your extension to give this option to the users, set `supportsMultiLanguage` to `true` and set the `language` property for each of the `ChapterDetails`. Preferably [ISO 639-1](https://en.wikipedia.org/wiki/ISO_639-1).
* Similarly, you can also give the option to choose a scanlator by setting `supportsMultiScanlator` to `true` and setting the `scanlator` property for each of the `ChapterDetails`.

[![image-url-https-266901462-files-gitbook-io-files-v0-b-gitbook-x-prod-appspot-c.png](https://i.postimg.cc/XY6bX7rm/image-url-https-266901462-files-gitbook-io-files-v0-b-gitbook-x-prod-appspot-c.png)](https://postimg.cc/3d16chCF)

## Example

```typescript
/// <reference path="./manga-provider.d.ts" />

class Provider {

    private api = "https://api.comick.fun"
    
    getSettings(): Settings {
	    return {
		    supportsMultiLanguage: false,
		    supportsMultiScanlator: false,
	    }
    }

    async search(opts: QueryOptions): Promise<SearchResult[]> {
        console.log(this.api, opts.query)

        const requestRes = await fetch(`${this.api}/v1.0/search?q=${encodeURIComponent(opts.query)}&limit=25&page=1`, {
            method: "get",
        })
        const comickRes = await requestRes.json() as ComickSearchResult[]

        const ret: SearchResult[] = []

        for (const res of comickRes) {

            let cover: any = res.md_covers ? res.md_covers[0] : null
            if (cover && cover.b2key != undefined) {
                cover = "https://meo.comick.pictures/" + cover.b2key
            }

            ret.push({
                id: res.hid,
                title: res.title ?? res.slug,
                synonyms: res.md_titles?.map(t => t.title) ?? {},
                year: res.year ?? 0,
                image: cover,
            })
        }

        return ret
    }

    async findChapters(id: string): Promise<ChapterDetails[]> {

        console.log("Fetching chapters", id)

        const chapterList: ChapterDetails[] = []

        const data = (await (await fetch(`${this.api}/comic/${id}/chapters?lang=en&page=0&limit=1000000`))?.json()) as { chapters: ComickChapter[] }

        const chapters: ChapterDetails[] = []

        for (const chapter of data.chapters) {

            if (!chapter.chap) {
                continue
            }

            let title = "Chapter " + this.padNum(chapter.chap, 2) + " "

            if (title.length === 0) {
                if (!chapter.title) {
                    title = "Oneshot"
                } else {
                    title = chapter.title
                }
            }

            let canPush = true
            for (let i = 0; i < chapters.length; i++) {
                if (chapters[i].title?.trim() === title?.trim()) {
                    canPush = false
                }
            }

            if (canPush) {
                if (chapter.lang === "en") {
                    chapters.push({
                        url: `${this.api}/comic/${id}/chapter/${chapter.hid}`,
                        index: 0,
                        id: chapter.hid,
                        title: title?.trim(),
                        chapter: chapter.chap,
                        rating: chapter.up_count - chapter.down_count,
                        updatedAt: chapter.updated_at,
                    })
                }
            }
        }

        chapters.reverse()

        for (let i = 0; i < chapters.length; i++) {
            chapters[i].index = i
        }

        return chapters
    }

    async findChapterPages(id: string): Promise<ChapterPage[]> {

        const data = (await (await fetch(`${this.api}/chapter/${id}`))?.json()) as {
            chapter: { md_images: { vol: any; w: number; h: number; b2key: string }[] }
        }

        const pages: ChapterPage[] = []

        data.chapter.md_images.map((image, index: number) => {
            pages.push({
                url: `https://meo.comick.pictures/${image.b2key}?width=${image.w}`,
                index: index,
                headers: {},
            })
        })

        return pages
    }

    padNum(number: string, places: number): string {
        let range = number.split("-")
        range = range.map((chapter) => {
            chapter = chapter.trim()
            const digits = chapter.split(".")[0].length
            return "0".repeat(Math.max(0, places - digits)) + chapter
        })
        return range.join("-")
    }

}

interface ComickSearchResult {
    title: string;
    id: number;
    hid: string;
    slug: string;
    year?: number;
    rating: string;
    rating_count: number;
    follow_count: number;
    user_follow_count: number;
    content_rating: string;
    created_at: string;
    demographic: number;
    md_titles: { title: string }[];
    md_covers: { vol: any; w: number; h: number; b2key: string }[];
    highlight: string;
}

interface Comic {
    id: number;
    hid: string;
    title: string;
    country: string;
    status: number;
    links: {
        al: string;
        ap: string;
        bw: string;
        kt: string;
        mu: string;
        amz: string;
        cdj: string;
        ebj: string;
        mal: string;
        raw: string;
    };
    last_chapter: any;
    chapter_count: number;
    demographic: number;
    hentai: boolean;
    user_follow_count: number;
    follow_rank: number;
    comment_count: number;
    follow_count: number;
    desc: string;
    parsed: string;
    slug: string;
    mismatch: any;
    year: number;
    bayesian_rating: any;
    rating_count: number;
    content_rating: string;
    translation_completed: boolean;
    relate_from: Array<any>;
    mies: any;
    md_titles: { title: string }[];
    md_comic_md_genres: { md_genres: { name: string; type: string | null; slug: string; group: string } }[];
    mu_comics: {
        licensed_in_english: any;
        mu_comic_categories: {
            mu_categories: { title: string; slug: string };
            positive_vote: number;
            negative_vote: number;
        }[];
    };
    md_covers: { vol: any; w: number; h: number; b2key: string }[];
    iso639_1: string;
    lang_name: string;
    lang_native: string;
}

interface ComickChapter {
    id: number;
    chap: string;
    title: string;
    vol: string | null;
    lang: string;
    created_at: string;
    updated_at: string;
    up_count: number;
    down_count: number;
    group_name: any;
    hid: string;
    identities: any;
    md_chapter_groups: { md_groups: { title: string; slug: string } }[];
}
```
