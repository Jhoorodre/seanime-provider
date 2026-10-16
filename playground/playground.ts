// Runs providers through the REAL Seanime Playground endpoint
// (POST /api/v1/extensions/playground/run), so input/output are exactly what
// Extensions > Playground produces: same goja engine, fetch, LoadDoc and AniList data.
//
// Usage (via ./playground/run.sh):
//   run.sh anime|manga|<slug...> [--anilist-id N] [--dub] [-v] [--full] [--jobs N (default 4)] [--timeout SECONDS (default 120)]
//   run.sh goyabu --anilist-id 180136 --method search --args '{"dub":false}'
//
// Server: SEANIME_URL (default http://127.0.0.1:<port from config.toml>), SEANIME_PASSWORD
// (default: password in ~/.config/Seanime/config.toml, read locally, never printed).
// Login-gated providers: TEST_<SLUG>_<FIELD> env vars (e.g. in playground/.env).
//
// Verified against Seanime 3.10.4: errors come back as HTTP 200 with value "ERROR: ..." and the
// real cause (timeouts etc.) only appears in `logs`; `mediaId` is required by every function.

import fs from "fs"
import os from "os"
import path from "path"
import { createHash } from "crypto"

const ROOT = path.resolve(import.meta.dir, "..")
const SRC = path.join(ROOT, "src")
const IDS_FILE = path.join(import.meta.dir, "anilist-ids.json")
let callTimeoutMs = 120_000 // --timeout <seconds>

// ---------- server connection ----------

function readSeanimeConfig(): { password: string; port: string } {
    try {
        const toml = fs.readFileSync(path.join(os.homedir(), ".config/Seanime/config.toml"), "utf8")
        const get = (k: string) => toml.match(new RegExp(`^\\s*${k}\\s*=\\s*['"]?([^'"\\n]*)['"]?\\s*$`, "m"))?.[1] ?? ""
        return { password: get("password"), port: get("port") }
    } catch {
        return { password: "", port: "" }
    }
}
const cfg = readSeanimeConfig()
const BASE_URL = process.env.SEANIME_URL ?? `http://127.0.0.1:${cfg.port || "43211"}`
const PASSWORD = process.env.SEANIME_PASSWORD ?? cfg.password
const HEADERS: Record<string, string> = { "Content-Type": "application/json" }
if (PASSWORD) HEADERS["X-Seanime-Token"] = createHash("sha256").update(PASSWORD).digest("hex")
// Without a server password Seanime only accepts a trusted local Origin (403 otherwise), like its own UI sends.
else HEADERS["Origin"] = new URL(BASE_URL).origin

type Call = { ok: boolean; value: string; logs: string; error?: string }

async function playground(type: string, language: string, code: string, fn: string, inputs: object): Promise<Call> {
    let res: Response
    try {
        res = await fetch(`${BASE_URL}/api/v1/extensions/playground/run`, {
            method: "POST",
            headers: HEADERS,
            body: JSON.stringify({ params: { type, language, code, function: fn, inputs } }),
            signal: AbortSignal.timeout(callTimeoutMs),
        })
    } catch (e: any) {
        const error = e?.name === "TimeoutError"
            ? `sem resposta do Seanime em ${callTimeoutMs / 1000}s (${fn}); o site/provider pode estar lento — use --timeout <segundos>`
            : `cannot reach Seanime at ${BASE_URL}: ${e?.message ?? e}`
        return { ok: false, value: "", logs: "", error }
    }
    const body: any = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, value: "", logs: "", error: `HTTP ${res.status}: ${body?.error ?? "unknown error"}` }
    const { value = "", logs = "" } = body?.data ?? {}
    if (value.startsWith("ERROR:")) return { ok: false, value, logs, error: value }
    return { ok: true, value, logs }
}

// ---------- provider loading ----------

type Manifest = {
    type: string
    language: string
    userConfig?: { requiresConfig?: boolean; fields?: { name: string; default?: string }[] }
}

function loadProvider(slug: string): { manifest: Manifest; code: string; missing: string[] } | null {
    const dir = path.join(SRC, slug)
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null
    const files = fs.readdirSync(dir)
    const ts = files.find(f => /\.(ts|js)$/.test(f))
    const json = files.find(f => f.endsWith(".json"))
    if (!ts || !json) return null

    const manifest: Manifest = JSON.parse(fs.readFileSync(path.join(dir, json), "utf8"))
    let code = fs.readFileSync(path.join(dir, ts), "utf8")
    const missing: string[] = []
    // Same raw replacement Seanime's loadUserConfig does; the Playground itself leaves {{x}} untouched.
    for (const field of new Set([...code.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))) {
        const envKey = `TEST_${slug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_${field.toUpperCase()}`
        const value = process.env[envKey] ?? manifest.userConfig?.fields?.find(f => f.name === field)?.default ?? ""
        if (!value && manifest.userConfig?.requiresConfig) missing.push(`${field} (set ${envKey})`)
        code = code.split(`{{${field}}}`).join(value)
    }
    return { manifest, code, missing }
}

// ---------- chains per provider type (mirror what the Playground UI sends) ----------

// Mirrors what the Playground shows for a function: the inputs sent, the Logs and the Value it returned.
// `note` is only our verdict (why a step counts as failed / skipped).
type Step = { name: string; ok: boolean; ms: number; inputs?: object; logs?: string; value?: string; note?: string; noMatch?: boolean }
type Status = "OK" | "FAIL" | "NO_MATCH" | "SKIP"

const NO_MATCH = /anime not found|^null$/

async function anilistQuery(id: number): Promise<string> {
    const res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "query($id:Int){Media(id:$id,type:ANIME){title{english romaji}}}", variables: { id } }),
        signal: AbortSignal.timeout(20_000),
    })
    const t = (await res.json() as any)?.data?.Media?.title
    if (!t) throw new Error(`AniList #${id} not found`)
    return t.english ?? t.romaji
}

async function runChain(type: string, language: string, code: string, mediaId: number, dub: boolean, steps: Step[], siteId?: string): Promise<Status> {
    let noMatch = false
    // nonEmpty: an empty list is an error (a provider must return every episode/chapter/page, not none)
    const call = async (name: string, fn: string, inputs: object, nonEmpty = false): Promise<any> => {
        const start = Date.now()
        const r = await playground(type, language, code, fn, { mediaId, ...inputs })
        // The Playground logs "Search failed for title ..." per title and still answers "no match":
        // that is a broken search (timeout, 502...), not proof the site lacks the title.
        const searchFailure = r.logs.split("\n").find(l => l.includes("Search failed for title"))
        const looksNoMatch = !r.ok && NO_MATCH.test(r.error ?? "") || (r.ok && r.value === "null")
        const isNoMatch = looksNoMatch && !searchFailure
        const searchFailed = looksNoMatch && !!searchFailure
        if (isNoMatch) noMatch = true
        let parsed: any = r.value
        try { parsed = JSON.parse(r.value) } catch { /* plain string value */ }
        const empty = r.ok && nonEmpty && Array.isArray(parsed) && parsed.length === 0
        steps.push({
            name, ok: r.ok && !isNoMatch && !empty && !searchFailed, ms: Date.now() - start,
            inputs: { mediaId, ...inputs }, logs: r.logs, value: r.value,
            note: searchFailed ? `busca falhou: ${searchFailure!.replace(/^.*Search failed for title/, "título").slice(0, 200)}`
                : !r.ok && !r.value ? r.error : isNoMatch ? "sem correspondência" : empty ? "lista vazia (0 itens)" : undefined,
            ...(isNoMatch ? { noMatch: true } : {}),
        })
        return r.ok && !isNoMatch && !empty && !searchFailed ? parsed : undefined
    }

    // Pinned site ID (playground/anilist-ids.json): skips the auto-match to test the rest of the chain
    const pinned = () => { steps.push({ name: "search", ok: true, ms: 0, note: `pulado (ID fixo no site: ${siteId})` }); return { id: siteId } }

    if (type === "onlinestream-provider") {
        const hit = siteId ? pinned() : await call("search", "search", { dub })
        const eps = hit && await call("findEpisodes", "findEpisodes", { id: hit.id }, true)
        if (eps?.length) await call("findEpisodeServer", "findEpisodeServer", { episode: JSON.stringify(eps[0]), server: "default" })
    } else if (type === "manga-provider") {
        const hit = siteId ? pinned() : await call("search", "search", {})
        const chapters = hit && await call("findChapters", "findChapters", { id: hit.id }, true)
        if (chapters?.length) await call("findChapterPages", "findChapterPages", { id: chapters[0].id }, true)
    } else if (type === "anime-torrent-provider") {
        const query = await anilistQuery(mediaId)
        await call("getSettings", "getSettings", {})
        const results = await call("search", "search", { query })
        await call("smartSearch", "smartSearch", { options: { query, batch: false, episodeNumber: 1, resolution: "", bestReleases: false } })
        await call("getLatest", "getLatest", {})
        if (results?.length) {
            await call("getTorrentInfoHash", "getTorrentInfoHash", { torrent: JSON.stringify(results[0]) })
            await call("getTorrentMagnetLink", "getTorrentMagnetLink", { torrent: JSON.stringify(results[0]) })
        }
    }

    if (steps.length === 0) return "FAIL"
    if (steps.some(s => !s.ok && !s.noMatch)) return "FAIL"
    return noMatch ? "NO_MATCH" : "OK"
}

// ---------- CLI ----------

// A plain number is the AniList ID; {anilist, siteId} also pins the provider's own ID for that title.
type IdEntry = number | null | { anilist: number; siteId?: string }
type IdsConfig = { anime: Record<string, IdEntry>; manga: Record<string, IdEntry> }

function bucketOf(type: string): "anime" | "manga" {
    return type === "manga-provider" ? "manga" : "anime"
}

async function main() {
    const args = process.argv.slice(2)
    const flag = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
    const dub = args.includes("--dub")
    const full = args.includes("--full") // print whole Values instead of the first 40 lines
    const explicitId = flag("--anilist-id") ? Number(flag("--anilist-id")) : null
    const method = flag("--method")
    const positional = args.filter((a, i) => !a.startsWith("-") && !["--anilist-id", "--method", "--args", "--timeout", "--jobs"].includes(args[i - 1]))
    const jobs = flag("--jobs") ? Number(flag("--jobs")) : 4 // providers tested at once
    if (flag("--timeout")) callTimeoutMs = Number(flag("--timeout")) * 1000
    if (!(jobs >= 1) || !(callTimeoutMs > 0)) { console.error("❌ --jobs e --timeout precisam de números positivos"); process.exit(1) }
    if (explicitId !== null && !(explicitId > 0)) { console.error("❌ --anilist-id precisa de um número válido"); process.exit(1) }

    const ids: IdsConfig = fs.existsSync(IDS_FILE) ? JSON.parse(fs.readFileSync(IDS_FILE, "utf8")) : { anime: {}, manga: {} }
    const all = fs.readdirSync(SRC).filter(s => loadProvider(s))
    const bucket = positional.length === 1 && (positional[0] === "anime" || positional[0] === "manga") ? positional[0] : null
    const slugs = bucket ? all.filter(s => bucketOf(loadProvider(s)!.manifest.type) === bucket) : positional.length ? positional : all

    if (!PASSWORD) console.log("⚠️  Nenhuma senha encontrada (SEANIME_PASSWORD / config.toml); tentando sem token.")
    console.log(`\nPlayground real do Seanime em ${BASE_URL} — ${slugs.length} provider(s)${dub ? " (dublado)" : ""}\n`)

    type Result = { slug: string; status: Status; anilistId?: number; steps: Step[]; reason?: string }
    const testProvider = async (slug: string): Promise<Result> => {
        const p = loadProvider(slug)
        if (!p) return { slug, status: "SKIP", steps: [], reason: `no .ts/.json in src/${slug}` }
        const entry = ids[bucketOf(p.manifest.type)]?.[slug] ?? null
        const entryId = entry && typeof entry === "object" ? entry.anilist : entry
        const anilistId = explicitId ?? entryId ?? null
        // the pinned site ID only belongs to the AniList ID it was configured with
        const siteId = entry && typeof entry === "object" && (explicitId === null || explicitId === entry.anilist) ? entry.siteId : undefined
        if (!anilistId) return { slug, status: "SKIP", steps: [], reason: "no AniList ID — add one to playground/anilist-ids.json or pass --anilist-id" }
        if (p.missing.length) return { slug, status: "SKIP", steps: [], reason: `requires config: ${p.missing.join(", ")}` }

        const steps: Step[] = []
        let status: Status
        if (method) {
            const start = Date.now()
            const methodInputs = { mediaId: anilistId, ...JSON.parse(flag("--args") ?? "{}") }
            const r = await playground(p.manifest.type, p.manifest.language, p.code, method, methodInputs)
            steps.push({ name: method, ok: r.ok, ms: Date.now() - start, inputs: methodInputs, logs: r.logs, value: r.value, note: r.ok ? undefined : r.error })
            status = r.ok ? "OK" : "FAIL"
        } else {
            try {
                status = await runChain(p.manifest.type, p.manifest.language, p.code, anilistId, dub, steps, siteId)
            } catch (e: any) {
                steps.push({ name: "chain", ok: false, ms: 0, note: String(e?.message ?? e) })
                status = "FAIL"
            }
        }
        return { slug, status, steps, anilistId }
    }

    // Pool of `jobs` workers; results keep the original order for the summary.
    const results: Result[] = new Array(slugs.length)
    let next = 0
    const t0 = Date.now()
    await Promise.all(Array.from({ length: Math.min(jobs, slugs.length) }, async () => {
        while (next < slugs.length) {
            const i = next++
            const start = Date.now()
            results[i] = await testProvider(slugs[i])
            console.log(`  ${slugs[i]}... ${results[i].status} (${((Date.now() - start) / 1000).toFixed(1)}s)`)
        }
    }))

    const icon = (st: Status) => (st === "OK" ? "✅" : st === "NO_MATCH" ? "🔍" : st === "SKIP" ? "⏭️ " : "❌")
    const MAX_LINES = full ? Infinity : 40
    const indent = (text: string, pad: string) => text.split("\n").map(l => pad + l).join("\n")
    const shorten = (v: any) => JSON.stringify(v, (_k, x) => (typeof x === "string" && x.length > 120 ? x.slice(0, 120) + "…" : x))

    for (const r of results) {
        if (r.status === "SKIP") continue
        console.log(`\n${"━".repeat(72)}\n${icon(r.status)} ${r.slug} — ${r.status} · AniList #${r.anilistId}\n${"━".repeat(72)}`)
        for (const s of r.steps) {
            console.log(`\n▶ ${s.name}  ${s.ok ? "✓" : "✗"}  ${(s.ms / 1000).toFixed(1)}s`)
            if (s.inputs) console.log(`  Inputs: ${shorten(s.inputs)}`)
            const logs = (s.logs ?? "").trim()
            console.log(`  Logs:${logs ? "\n" + indent(logs, "    ") : " (vazio)"}`)
            if (s.value) {
                const lines = s.value.split("\n")
                const shown = lines.slice(0, MAX_LINES).join("\n")
                console.log(`  Value:\n${indent(shown, "    ")}${lines.length > MAX_LINES ? `\n    … (+${lines.length - MAX_LINES} linhas; use --full)` : ""}`)
            }
            if (s.note) console.log(`  ${s.ok ? "ℹ" : "✗"} ${s.note}`)
        }
    }

    console.log(`\n${"═".repeat(72)}\nRESUMO`)
    for (const r of results) {
        const detail = r.status === "SKIP" ? r.reason : r.steps.filter(x => !x.ok).map(x => `${x.name}: ${x.note ?? x.value?.split("\n")[0] ?? "falhou"}`).join("; ")
        console.log(`  ${icon(r.status)} ${r.slug.padEnd(16)} ${r.status}${detail ? " — " + detail.slice(0, 110) : ""}`)
    }
    const n = (s: Status) => results.filter(r => r.status === s).length
    console.log(`\n${n("OK")} OK, ${n("FAIL")} FAIL, ${n("NO_MATCH")} NO_MATCH, ${n("SKIP")} SKIP (de ${results.length}) em ${((Date.now() - t0) / 1000).toFixed(1)}s, ${jobs} em paralelo\n${"═".repeat(72)}\n`)
    process.exit(n("FAIL") > 0 ? 1 : 0)
}

main()
