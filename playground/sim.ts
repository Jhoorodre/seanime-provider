// Simulates Seanime's Playground for providers in src/, driven by real AniList
// media data — matching how the real Playground works: you give it a Media ID,
// Seanime fetches the real title(s) from AniList, calls search() with each
// title, and auto-selects the best-matching result. This mirrors that instead
// of inventing a fake title/media object.
//
// Anime (onlinestream-provider + anime-torrent-provider) and Manga
// (manga-provider) are tested separately since they use different AniList ID
// namespaces (an anime's AniList ID and its manga adaptation's ID are
// unrelated numbers).
//
// Usage:
//   bun run playground/sim.ts anime                    # every anime provider, using playground/anilist-ids.json
//   bun run playground/sim.ts manga                    # every manga provider, using playground/anilist-ids.json
//   bun run playground/sim.ts animestokyo               # one provider, id from playground/anilist-ids.json
//   bun run playground/sim.ts animestokyo --anilist-id 180136 --dub
//   bun run playground/sim.ts animestokyo goyabu -v      # a few providers, verbose console output
//   bun run playground/sim.ts goyabu --method search --args '[{"query":"Naruto","dub":false,"media":{"id":20,"synonyms":[],"isAdult":false}}]'
//                                                             # one method with hand-written params, like the Playground's method dropdown
//
// Provider without a configured AniList ID (and no --anilist-id) is SKIPped.
// If the AniList title doesn't match anything the provider's search() returns,
// that's reported as NO_MATCH (not FAIL) — it's a legitimate "this site
// doesn't have this title" outcome, exactly like the real Playground would show.
//
// Config-gated providers (email/password/etc): set TEST_<SLUG>_<FIELD> in
// playground/.env, e.g. TEST_KUROMANGAS_EMAIL, TEST_KUROMANGAS_PASSWORD.

import fs from "fs"
import path from "path"
import { load as cheerioLoad, type CheerioAPI, type Cheerio } from "cheerio"

const ROOT = path.resolve(import.meta.dir, "..")
const SRC = path.join(ROOT, "src")
const IDS_FILE = path.join(import.meta.dir, "anilist-ids.json")
const TIMEOUT_MS = 25_000

// ---------- LoadDoc polyfill (mirrors Seanime's injected jQuery-like $) ----------

const CHAIN_METHODS = new Set(["find", "filter", "first", "last", "eq", "next", "prev", "parent", "children", "siblings", "closest"])

function wrapCollection(cheerioApi: CheerioAPI, $coll: Cheerio<any>): any {
    return new Proxy($coll, {
        get(target: any, prop: string | symbol) {
            if (prop === "each") {
                return (fn: (i: number, el: any) => void) => {
                    target.each((i: number, el: any) => fn(i, wrapCollection(cheerioApi, cheerioApi(el))))
                    return wrapCollection(cheerioApi, target)
                }
            }
            if (prop === "map") {
                return (fn: (i: number, el: any) => any) =>
                    target.map((i: number, el: any) => fn(i, wrapCollection(cheerioApi, cheerioApi(el)))).get()
            }
            if (typeof prop === "string" && CHAIN_METHODS.has(prop)) {
                return (...args: any[]) => wrapCollection(cheerioApi, target[prop](...args))
            }
            const value = target[prop]
            return typeof value === "function" ? value.bind(target) : value
        },
    })
}

function LoadDoc(html: string) {
    const cheerioApi = cheerioLoad(html ?? "")
    return (selector: string) => wrapCollection(cheerioApi, cheerioApi(selector))
}

// ---------- config substitution ----------

type Manifest = {
    id: string
    type: "manga-provider" | "onlinestream-provider" | "anime-torrent-provider" | "custom-source"
    userConfig?: { requiresConfig: boolean; fields: { name: string; default?: string }[] }
}

function findProviderFiles(slug: string): { ts: string; json: string } | null {
    const dir = path.join(SRC, slug)
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null
    const files = fs.readdirSync(dir)
    const ts = files.find(f => f.endsWith(".ts"))
    const json = files.find(f => f.endsWith(".json"))
    if (!ts || !json) return null
    return { ts: path.join(dir, ts), json: path.join(dir, json) }
}

function substituteConfig(source: string, slug: string, manifest: Manifest): { source: string; missing: string[] } {
    const placeholders = [...source.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1])
    const uniqueFields = [...new Set(placeholders)]
    const missing: string[] = []
    let result = source

    for (const field of uniqueFields) {
        const envKey = `TEST_${slug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_${field.toUpperCase()}`
        const fieldDef = manifest.userConfig?.fields?.find(f => f.name === field)
        const value = process.env[envKey] ?? fieldDef?.default ?? ""

        if (!value && manifest.userConfig?.requiresConfig) {
            missing.push(`${field} (set ${envKey})`)
        }
        result = result.split(`"{{${field}}}"`).join(JSON.stringify(value))
    }

    return { source: result, missing }
}

// ---------- AniList (real media data, like Seanime's own Media ID field) ----------

type AniListMedia = {
    id: number
    idMal: number | null
    format: string | null
    status: string | null
    episodes: number | null
    chapters: number | null
    isAdult: boolean
    startDate: { year: number | null; month: number | null; day: number | null } | null
    englishTitle: string | null
    romajiTitle: string | null
    synonyms: string[]
}

async function fetchAniListMedia(id: number, type: "ANIME" | "MANGA"): Promise<AniListMedia | null> {
    const query = `
        query ($id: Int, $type: MediaType) {
            Media(id: $id, type: $type) {
                id idMal format status episodes chapters isAdult
                startDate { year month day }
                title { romaji english }
                synonyms
            }
        }
    `
    // AniList's own retry-after/rate-limit contract (docs.anilist.co/guide/rate-limiting):
    // 429/degraded responses carry `Retry-After` (seconds) and/or `X-RateLimit-Reset` (unix ts).
    // Seanime itself retries up to 3 times respecting these headers rather than a fixed delay,
    // which is why a single bare request is more likely to land in a bad window than it is.
    const ANILIST_RETRIES = 4
    let res: Response | undefined
    let lastBody = ""
    for (let attempt = 0; attempt <= ANILIST_RETRIES; attempt++) {
        try {
            res = await withTimeout(fetch("https://graphql.anilist.co", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({ query, variables: { id, type } }),
            }), "anilist fetch")
        } catch (e: any) {
            const isTransient = TRANSIENT_ERROR.test(String(e?.message ?? e)) || TRANSIENT_ERROR.test(String(e?.code ?? ""))
            if (!isTransient || attempt === ANILIST_RETRIES) throw e
            await sleep(RETRY_DELAY_MS)
            continue
        }

        if (res.ok || res.status === 404) break

        lastBody = await res.text()
        const retryable = res.status === 429 || res.status === 403 || res.status >= 500
        if (!retryable || attempt === ANILIST_RETRIES) {
            throw new Error(`AniList API returned HTTP ${res.status}: ${lastBody.slice(0, 200)}`)
        }

        const retryAfterHeader = res.headers.get("Retry-After")
        const resetHeader = res.headers.get("X-RateLimit-Reset")
        let waitMs = RETRY_DELAY_MS * (attempt + 1) // fallback: growing backoff
        if (retryAfterHeader) waitMs = Number(retryAfterHeader) * 1000
        else if (resetHeader) waitMs = Math.max(1000, Number(resetHeader) * 1000 - Date.now())
        await sleep(Math.min(waitMs, 30_000))
    }
    const json: any = await res!.json()
    if (json?.errors?.length) {
        throw new Error(`AniList API error: ${json.errors.map((e: any) => e.message).join("; ")}`)
    }
    const m = json?.data?.Media
    if (!m) return null
    return {
        id: m.id,
        idMal: m.idMal ?? null,
        format: m.format ?? null,
        status: m.status ?? null,
        episodes: m.episodes ?? null,
        chapters: m.chapters ?? null,
        isAdult: !!m.isAdult,
        startDate: m.startDate ?? null,
        englishTitle: m.title?.english ?? null,
        romajiTitle: m.title?.romaji ?? null,
        synonyms: m.synonyms ?? [],
    }
}

// Matches the `Media` interface from doc/Anime Torrent Provider.md / Online Streaming Provider.md
function toMediaObject(m: AniListMedia) {
    return {
        id: m.id,
        idMal: m.idMal ?? undefined,
        status: m.status ?? undefined,
        format: m.format ?? undefined,
        englishTitle: m.englishTitle ?? undefined,
        romajiTitle: m.romajiTitle ?? undefined,
        episodeCount: m.episodes ?? -1,
        synonyms: m.synonyms,
        isAdult: m.isAdult,
        startDate: m.startDate?.year ? m.startDate : undefined,
    }
}

// ---------- best-match (approximates Seanime's "auto-select best match by title") ----------
// NOTE: this is a heuristic (Dice bigram similarity), not Seanime's real internal
// matcher — good enough to tell "clearly the right show" from "nothing matches".

function normalizeTitle(s: string): string {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim()
}

function bigrams(s: string): Set<string> {
    const set = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
    return set
}

function similarity(a: string, b: string): number {
    const na = normalizeTitle(a), nb = normalizeTitle(b)
    if (!na || !nb) return 0
    if (na === nb) return 1
    const ba = bigrams(na), bb = bigrams(nb)
    if (ba.size === 0 || bb.size === 0) return 0
    let overlap = 0
    for (const bg of ba) if (bb.has(bg)) overlap++
    return (2 * overlap) / (ba.size + bb.size)
}

const MATCH_THRESHOLD = 0.5

function findBestMatch(candidates: any[], referenceTitles: string[]): { candidate: any; score: number } | null {
    let best: any = null
    let bestScore = 0
    for (const c of candidates) {
        if (!c?.title) continue
        for (const ref of referenceTitles) {
            const score = similarity(c.title, ref)
            if (score > bestScore) {
                bestScore = score
                best = c
            }
        }
    }
    if (!best || bestScore < MATCH_THRESHOLD) return { candidate: null, score: bestScore }
    return { candidate: best, score: bestScore }
}

function dedupeById(items: any[]): any[] {
    const seen = new Set<string>()
    const out: any[] = []
    for (const item of items) {
        const key = String(item?.id)
        if (seen.has(key)) continue
        seen.add(key)
        out.push(item)
    }
    return out
}

// ---------- test chains per provider type ----------

type StepResult = { name: string; ok: boolean; info: string; ms: number }

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
    let timer: any
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timer = setTimeout(() => reject(new Error(`${label}: timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
            }),
        ])
    } finally {
        clearTimeout(timer)
    }
}

const TRANSIENT_ERROR = /ConnectionRefused|ECONNRESET|ETIMEDOUT|Unable to connect|EAI_AGAIN|socket hang up|No route to host|ENETUNREACH|EHOSTUNREACH/i
const RETRIES = 2
const RETRY_DELAY_MS = 1500

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

async function step(steps: StepResult[], name: string, fn: () => Promise<any>, describe?: (r: any) => string): Promise<any> {
    const start = Date.now()
    let lastError: any
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
        try {
            const result = await withTimeout(fn(), name)
            steps.push({ name, ok: true, info: describe ? describe(result) : summarize(result), ms: Date.now() - start })
            return result
        } catch (e: any) {
            lastError = e
            const isTransient = TRANSIENT_ERROR.test(String(e?.message ?? e)) || TRANSIENT_ERROR.test(String(e?.code ?? ""))
            if (!isTransient || attempt === RETRIES) break
            await sleep(RETRY_DELAY_MS)
        }
    }
    steps.push({ name, ok: false, info: String(lastError?.message ?? lastError), ms: Date.now() - start })
    return undefined
}

function summarize(result: any): string {
    if (Array.isArray(result)) return `${result.length} item(s)`
    if (result && typeof result === "object") return Object.keys(result).length ? "ok" : "empty object"
    return String(result)
}

function titlesToQuery(media: AniListMedia): { label: string; title: string }[] {
    const calls: { label: string; title: string }[] = []
    if (media.englishTitle) calls.push({ label: "search (english)", title: media.englishTitle })
    if (media.romajiTitle && media.romajiTitle !== media.englishTitle) calls.push({ label: "search (romaji)", title: media.romajiTitle })
    return calls
}

async function searchAndMatch(
    steps: StepResult[], media: AniListMedia, searchOne: (title: string) => Promise<any[]>, describeCandidate: (c: any) => object,
): Promise<any | null> {
    const referenceTitles = [media.englishTitle, media.romajiTitle, ...media.synonyms].filter(Boolean) as string[]
    const allResults: any[] = []
    for (const call of titlesToQuery(media)) {
        const r = await step(steps, call.label, () => searchOne(call.title))
        if (Array.isArray(r)) allResults.push(...r)
    }
    const match = await step(
        steps, "match",
        async () => findBestMatch(dedupeById(allResults), referenceTitles),
        m => m?.candidate ? JSON.stringify(describeCandidate(m.candidate)) + ` (score ${m.score.toFixed(2)})` : `no match (${allResults.length} candidate(s) checked)`,
    )
    return match?.candidate ?? null
}

async function runChain(provider: any, type: Manifest["type"], media: AniListMedia, dub: boolean, steps: StepResult[]) {
    const settings = await step(steps, "getSettings", async () => provider.getSettings())

    if (type === "onlinestream-provider") {
        const mediaObj = toMediaObject(media)
        const candidate = await searchAndMatch(
            steps, media,
            title => provider.search({ query: title, dub, media: mediaObj }),
            c => ({ id: c.id, title: c.title, url: c.url, subOrDub: c.subOrDub }),
        )
        if (!candidate) return
        const episodes = await step(steps, "findEpisodes", () => provider.findEpisodes(candidate.id))
        if (!episodes?.length) return
        const server = settings?.episodeServers?.[0] ?? "default"
        await step(steps, "findEpisodeServer", () => provider.findEpisodeServer(episodes[0], server))
    } else if (type === "manga-provider") {
        const candidate = await searchAndMatch(
            steps, media,
            title => provider.search({ query: title }),
            c => ({ id: c.id, title: c.title }),
        )
        if (!candidate) return
        const chapters = await step(steps, "findChapters", () => provider.findChapters(candidate.id))
        if (!chapters?.length) return
        await step(steps, "findChapterPages", () => provider.findChapterPages(chapters[0].id))
    } else if (type === "anime-torrent-provider") {
        const mediaObj = toMediaObject(media)
        const query = media.englishTitle || media.romajiTitle || ""
        const results = await step(steps, "search", () => provider.search({ query, media: mediaObj }))
        await step(steps, "smartSearch", () =>
            provider.smartSearch({
                query, media: mediaObj, episodeNumber: 1, batch: false,
                resolution: "", anidbAID: 0, anidbEID: 0, bestReleases: false,
            }))
        await step(steps, "getLatest", () => provider.getLatest())
        if (results?.length) {
            await step(steps, "getTorrentInfoHash", () => provider.getTorrentInfoHash(results[0]))
            await step(steps, "getTorrentMagnetLink", () => provider.getTorrentMagnetLink(results[0]))
        }
    }
}

// ---------- runner ----------

type ProviderResult =
    | { slug: string; status: "OK" | "FAIL" | "NO_MATCH"; steps: StepResult[]; logs?: string[] }
    | { slug: string; status: "SKIP"; reason: string }

type MethodCall = { method: string; args: any[] }

async function runProvider(slug: string, media: AniListMedia | null, dub: boolean, call?: MethodCall): Promise<ProviderResult> {
    const files = findProviderFiles(slug)
    if (!files) return { slug, status: "SKIP", reason: "no .ts/.json found in src/" + slug }

    const manifest: Manifest = JSON.parse(fs.readFileSync(files.json, "utf8"))
    const rawSource = fs.readFileSync(files.ts, "utf8")
    const { source, missing } = substituteConfig(rawSource, slug, manifest)

    if (missing.length > 0) {
        return { slug, status: "SKIP", reason: `requires config: ${missing.join(", ")}` }
    }

    const tempFile = path.join(SRC, slug, `._playground_sim_${Date.now()}.ts`)
    fs.writeFileSync(tempFile, source + "\nexport { Provider };\n")

    const originalConsole = { log: console.log, error: console.error, warn: console.warn }
    const logs: string[] = []
    console.log = (...a: any[]) => logs.push(a.map(String).join(" "))
    console.error = (...a: any[]) => logs.push("[error] " + a.map(String).join(" "))
    console.warn = (...a: any[]) => logs.push("[warn] " + a.map(String).join(" "))
    ;(globalThis as any).LoadDoc = LoadDoc

    const steps: StepResult[] = []
    try {
        const mod = await import(`${tempFile}?t=${Date.now()}`)
        const provider = new mod.Provider()
        if (call) {
            if (typeof provider[call.method] !== "function") throw new Error(`Provider has no method "${call.method}"`)
            await step(steps, call.method, () => provider[call.method](...call.args), r => JSON.stringify(r, null, 2) ?? String(r))
        } else {
            await runChain(provider, manifest.type, media!, dub, steps)
        }
    } catch (e: any) {
        // Each chain step already has its own timeout/retry via step() and
        // reports itself; this only catches load/instantiate failures (e.g.
        // syntax errors, missing "class Provider") that happen outside a step.
        steps.push({ name: "load/instantiate", ok: false, info: String(e?.message ?? e), ms: 0 })
    } finally {
        console.log = originalConsole.log
        console.error = originalConsole.error
        console.warn = originalConsole.warn
        fs.unlinkSync(tempFile)
    }

    const matchStep = steps.find(s => s.name === "match")
    const noMatch = matchStep?.ok && matchStep.info.startsWith("no match")
    const status = noMatch ? "NO_MATCH" : steps.length > 0 && steps.every(s => s.ok) ? "OK" : "FAIL"
    return { slug, status, steps, ...(logs.length ? { logs } : {}) } as any
}

// ---------- provider <-> AniList ID config ----------

type IdsConfig = { anime: Record<string, any>; manga: Record<string, any> }
const idOf = (e: any): number | null => (e && typeof e === "object" ? e.anilist : e) ?? null

function loadIdsConfig(): IdsConfig {
    if (!fs.existsSync(IDS_FILE)) return { anime: {}, manga: {} }
    return JSON.parse(fs.readFileSync(IDS_FILE, "utf8"))
}

function listProvidersByBucket(bucket: "anime" | "manga"): string[] {
    const wantedTypes = bucket === "anime"
        ? ["onlinestream-provider", "anime-torrent-provider"]
        : ["manga-provider"]
    return fs.readdirSync(SRC).filter(slug => {
        const files = findProviderFiles(slug)
        if (!files) return false
        const manifest: Manifest = JSON.parse(fs.readFileSync(files.json, "utf8"))
        return wantedTypes.includes(manifest.type)
    })
}

// ---------- CLI ----------

function cleanupStaleTempFiles() {
    for (const slug of fs.readdirSync(SRC)) {
        const dir = path.join(SRC, slug)
        if (!fs.statSync(dir).isDirectory()) continue
        for (const f of fs.readdirSync(dir)) {
            if (f.startsWith("._playground_sim_")) fs.unlinkSync(path.join(dir, f))
        }
    }
}

function providerMediaType(slug: string): "ANIME" | "MANGA" | null {
    const files = findProviderFiles(slug)
    if (!files) return null
    const manifest: Manifest = JSON.parse(fs.readFileSync(files.json, "utf8"))
    if (manifest.type === "manga-provider") return "MANGA"
    if (manifest.type === "onlinestream-provider" || manifest.type === "anime-torrent-provider") return "ANIME"
    return null
}

async function main() {
    cleanupStaleTempFiles()
    const args = process.argv.slice(2)
    const dub = args.includes("--dub")
    const verbose = args.includes("-v") || args.includes("--verbose")
    const rawExplicitId = args.includes("--anilist-id") ? Number(args[args.indexOf("--anilist-id") + 1]) : null
    if (rawExplicitId !== null && Number.isNaN(rawExplicitId)) {
        console.error(`❌ --anilist-id precisa de um número válido (recebido: "${args[args.indexOf("--anilist-id") + 1]}")`)
        process.exit(1)
    }
    const explicitId = rawExplicitId
    const flagValue = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined
    const positional = args.filter((a, i) => !a.startsWith("-") && !["--anilist-id", "--method", "--args"].includes(args[i - 1]))

    const method = flagValue("--method")
    if (method) {
        if (positional.length !== 1) {
            console.error("❌ --method precisa de exatamente um provider (ex: goyabu --method search --args '[...]')")
            process.exit(1)
        }
        let callArgs: any = []
        try {
            callArgs = JSON.parse(flagValue("--args") ?? "[]")
        } catch (e: any) {
            console.error(`❌ --args precisa ser JSON válido: ${e.message}`)
            process.exit(1)
        }
        const r: any = await runProvider(positional[0], null, dub, { method, args: Array.isArray(callArgs) ? callArgs : [callArgs] })
        if (r.status === "SKIP") console.log(`⏭️  ${r.reason}`)
        else {
            for (const s of r.steps) console.log(`${s.ok ? "✓" : "✗"} ${s.name} (${s.ms}ms):\n${s.info}`)
            if (verbose && r.logs) for (const line of r.logs) console.log(`  | ${line}`)
        }
        process.exit(r.status === "FAIL" ? 1 : 0)
    }

    const idsConfig = loadIdsConfig()
    const isBucketRun = positional.length === 1 && (positional[0] === "anime" || positional[0] === "manga")

    let targets: { slug: string; mediaType: "ANIME" | "MANGA"; anilistId: number | null }[] = []

    if (isBucketRun) {
        const bucket = positional[0] as "anime" | "manga"
        targets = listProvidersByBucket(bucket).map(slug => ({
            slug, mediaType: bucket === "anime" ? "ANIME" : "MANGA",
            anilistId: idOf(idsConfig[bucket]?.[slug]),
        }))
    } else {
        const slugs = positional.length > 0 ? positional : fs.readdirSync(SRC)
        targets = slugs.map(slug => {
            const mediaType = providerMediaType(slug) ?? "ANIME"
            const bucket = mediaType === "ANIME" ? "anime" : "manga"
            return { slug, mediaType, anilistId: explicitId ?? idOf(idsConfig[bucket]?.[slug]) }
        })
    }

    console.log(`\nSimulando Playground para ${targets.length} provider(s)${dub ? " (dublado)" : ""}\n`)

    const mediaCache = new Map<string, AniListMedia | null>()
    async function getMedia(id: number, type: "ANIME" | "MANGA") {
        const key = `${type}:${id}`
        if (!mediaCache.has(key)) mediaCache.set(key, await fetchAniListMedia(id, type))
        return mediaCache.get(key)!
    }

    const results: (ProviderResult & { anilistId?: number | null })[] = []
    for (const target of targets) {
        process.stdout.write(`  ${target.slug}... `)

        if (!target.anilistId) {
            const r = { slug: target.slug, status: "SKIP" as const, reason: `no AniList ID configured — add one to ${path.relative(ROOT, IDS_FILE)} or pass --anilist-id` }
            results.push(r)
            console.log(r.status)
            continue
        }

        let media: AniListMedia | null = null
        let anilistError: string | null = null
        try {
            media = await getMedia(target.anilistId, target.mediaType)
        } catch (e: any) {
            anilistError = String(e?.message ?? e)
        }
        if (!media) {
            const r = { slug: target.slug, status: "SKIP" as const, reason: anilistError ? `failed to fetch AniList #${target.anilistId}: ${anilistError}` : `AniList ID ${target.anilistId} not found` }
            results.push(r)
            console.log(r.status)
            continue
        }

        let result: ProviderResult
        try {
            result = await runProvider(target.slug, media, dub)
        } catch (e: any) {
            result = { slug: target.slug, status: "FAIL", steps: [{ name: "runProvider", ok: false, info: String(e?.message ?? e), ms: 0 }] }
        }
        results.push({ ...result, anilistId: target.anilistId })
        console.log(result.status)
    }

    console.log("\n" + "=".repeat(70))
    console.log("RESUMO")
    console.log("=".repeat(70))

    for (const r of results) {
        if (r.status === "SKIP") {
            console.log(`\n⏭️  ${r.slug} — SKIP: ${r.reason}`)
            continue
        }
        const icon = r.status === "OK" ? "✅" : r.status === "NO_MATCH" ? "🔍" : "❌"
        console.log(`\n${icon} ${r.slug} — ${r.status} (AniList #${r.anilistId})`)
        for (const s of r.steps) {
            const stepIcon = s.ok ? "  ✓" : "  ✗"
            console.log(`${stepIcon} ${s.name} (${s.ms}ms): ${s.info}`)
        }
        if (verbose && r.logs) {
            console.log("  --- console output ---")
            for (const line of r.logs) console.log(`  | ${line}`)
        }
    }

    const ok = results.filter(r => r.status === "OK").length
    const fail = results.filter(r => r.status === "FAIL").length
    const noMatch = results.filter(r => r.status === "NO_MATCH").length
    const skip = results.filter(r => r.status === "SKIP").length
    console.log("\n" + "=".repeat(70))
    console.log(`${ok} OK, ${fail} FAIL, ${noMatch} NO_MATCH, ${skip} SKIP (of ${results.length})`)
    console.log("=".repeat(70) + "\n")

    process.exit(fail > 0 ? 1 : 0)
}

main()
