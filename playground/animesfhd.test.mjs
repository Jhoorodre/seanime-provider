// Node >= 22.18: node --test --experimental-test-isolation=none playground/animesfhd.test.mjs
// Node >= 24:    node --test --test-isolation=none playground/animesfhd.test.mjs
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { stripTypeScriptTypes } from "node:module"
import vm from "node:vm"
import test from "node:test"

const base = "https://animesfhd.net"
const sourceFile = new URL("../src/animesfhd/animesfhd.ts", import.meta.url)
const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/animesfhd/${name}.json`, import.meta.url), "utf8").replace(/^\uFEFF/, ""))
const clone = value => JSON.parse(JSON.stringify(value))
const opts = (query = "frieren", dub = false) => ({ query, dub, media: { id: 154587, synonyms: ["OUTRO SINONIMO"], isAdult: false } })

function harness(routes, { plainHeaders = false } = {}) {
    assert.ok(existsSync(sourceFile), "Provider AnimesFHD deve existir")
    const calls = [], sleeps = [], errors = []
    const fetch = async (url, init = {}) => {
        assert.equal(init.headers.Referer, `${base}/`)
        assert.match(init.headers["User-Agent"], /Mozilla/)
        const parsed = new URL(url)
        const key = parsed.pathname + parsed.search
        calls.push({ key, method: init.method || "GET", redirect: init.redirect })
        assert.ok(Object.hasOwn(routes, key), `Requisição inesperada: ${key}`)
        const route = typeof routes[key] === "function" ? routes[key](init) : routes[key]
        if (route instanceof Error) throw route
        const status = route.status || 200
        const headers = route.headers || {}
        return { ok: status >= 200 && status < 300, status, url: route.url || url,
            headers: plainHeaders ? { ...headers } : { get: name => headers[name.toLowerCase()] || null },
            json: async () => clone(route.body ?? route) }
    }
    const code = stripTypeScriptTypes(readFileSync(sourceFile, "utf8"))
    const provider = vm.runInNewContext(`${code}\nnew Provider()`, { fetch, $sleep: async ms => sleeps.push(ms), console: { error: (...args) => errors.push(args) } })
    return { provider, calls, sleeps, errors }
}

const frierenDetail = () => ({
    series: fixture("busca-frieren").series[0],
    versions: [
        { series_id: 2751618645542326, title: "Sousou no Frieren", season: 1, season_label: "Temporada 1", audio: "legendado" },
        { series_id: 9001, title: "Sousou no Frieren", season: 1, season_label: "Temporada 1", audio: "dublado" },
        { series_id: 9002, title: "Sousou no Frieren 2nd Season", season: 2, season_label: "Temporada 2", audio: "legendado" },
    ],
})
const searchRoute = "/api/series?pagination=1&page=1&per_page=24&q=frieren"
const detailRoute = "/api/series/2751618645542326?page=1&per_page=1"

test("busca expõe versões distintas e nomes alternativos sem pesquisar todos os sinônimos novamente", async () => {
    const { provider, calls, sleeps } = harness({ [searchRoute]: fixture("busca-frieren"), [detailRoute]: frierenDetail() })
    const sub = clone(await provider.search(opts()))
    assert.deepEqual(sub.map(x => [x.id, x.subOrDub]), [["2751618645542326", "sub"], ["9002", "sub"]])
    assert.ok(sub[0].synonyms.includes("Frieren e a Jornada para o Além"))
    assert.equal(sub[1].title, "Sousou no Frieren 2nd Season")
    assert.ok(!sub[1].synonyms?.includes("Frieren e a Jornada para o Além"))
    const dub = clone(await provider.search(opts("frieren", true)))
    assert.deepEqual(dub.map(x => [x.id, x.subOrDub, x.url]), [["9001", "dub", `${base}/serie/9001`]])
    assert.equal(calls.filter(x => x.key === detailRoute).length, 1)
    assert.ok(calls.every(x => !x.key.includes("OUTRO")))
    assert.ok(sleeps.some(ms => ms > 0))
})

test("busca vazia não baixa o catálogo e busca sem resultados retorna lista vazia", async () => {
    const { provider } = harness({ [searchRoute]: { series: [], has_more: false } })
    assert.deepEqual(clone(await provider.search(opts("  "))), [])
    assert.deepEqual(clone(await provider.search(opts())), [])
})

test("temporada já identificada pelo título conserva o nome e seus próprios aliases", async () => {
    const detail = frierenDetail()
    detail.series = { ...detail.series, id: 9002, title: "Sousou no Frieren 2nd Season", alt_titles: "Frieren: Beyond Journey's End Season 2" }
    detail.versions = [detail.versions[2]]
    const { provider } = harness({ [searchRoute]: { series: [detail.series], has_more: false }, "/api/series/9002?page=1&per_page=1": detail })
    const result = clone(await provider.search(opts()))
    assert.equal(result[0].title, "Sousou no Frieren 2nd Season")
    assert.deepEqual(result[0].synonyms, ["Frieren: Beyond Journey's End Season 2"])
})

test("busca percorre páginas e deduplica IDs sem confundir categoria filme com áudio", async () => {
    const list = fixture("populares")
    const movie = fixture("serie-filme-2110072639862535")
    const item = { ...movie.series, category: "filme" }
    const { provider } = harness({
        [searchRoute]: { ...list, series: [item], has_more: true },
        "/api/series?pagination=1&page=2&per_page=24&q=frieren": { series: [item], has_more: false },
        "/api/series/2110072639862535?page=1&per_page=1": movie,
    })
    const result = clone(await provider.search(opts()))
    assert.deepEqual(result.map(x => [x.id, x.subOrDub]), [["2110072639862535", "sub"]])
})

test("episódios reais da série mantêm IDs grandes, títulos e ordem decrescente", async () => {
    const { provider } = harness({ "/api/series/1709160706373932?page=1&per_page=200": fixture("serie-1709160706373932") })
    const result = clone(await provider.findEpisodes("1709160706373932"))
    assert.deepEqual(result.map(x => x.number), [6, 5, 4, 3, 2, 1])
    assert.equal(result[0].id, "4341907054519831")
    assert.equal(result[0].url, `${base}/episod/4341907054519831`)
    assert.equal(result[4].title, "O Segundo Primeiro Amor")
})

test("paginação conserva todos os episódios inteiros e elimina frações e duplicatas", async () => {
    const data = fixture("serie-1709160706373932")
    const { provider } = harness({
        "/api/series/1?page=1&per_page=200": { ...data, has_more: true, episodes: [
            { id: 1, episode_number: 1 }, { id: 2, episode_number: 7.5 },
            { id: 3, episode_number: "2" }, { id: 4, episode_number: null },
        ] },
        "/api/series/1?page=2&per_page=200": { ...data, has_more: false, episodes: [
            { id: 3, episode_number: 2 }, { id: 5, episode_number: 201 },
        ] },
    })
    const result = clone(await provider.findEpisodes("1"))
    assert.deepEqual(result.map(x => [x.id, x.number]), [["5", 201], ["3", 2], ["1", 1]])
})

test("filme real é um episódio inteiro", async () => {
    const { provider } = harness({ "/api/series/2110072639862535?page=1&per_page=200": fixture("serie-filme-2110072639862535") })
    const result = clone(await provider.findEpisodes("2110072639862535"))
    assert.equal(result.length, 1)
    assert.equal(result[0].number, 1)
    assert.equal(result[0].id, "1049086484300956")
})

test("HLS s6 real usa URL absoluta e headers sem baixar o vídeo", async () => {
    const { provider, calls } = harness({ "/api/episodes/22882": fixture("episodio-22882") })
    const result = clone(await provider.findEpisodeServer({ id: "22882" }, "default"))
    assert.equal(result.server, "AnimesFHD")
    assert.ok(provider.getSettings().episodeServers.includes(result.server))
    assert.equal(provider.getSettings().supportsDub, true)
    assert.equal(result.headers.Referer, `${base}/`)
    assert.deepEqual(result.videoSources.map(x => [x.url, x.type]), [[`${base}/api/v/s6?source=2016384480747057&playlist=.m3u8`, "m3u8"]])
    assert.equal(calls.length, 1)
})

test("filme preserva a legenda específica da fonte", async () => {
    const { provider } = harness({ "/api/episodes/1049086484300956": fixture("episodio-filme-1049086484300956") })
    const result = clone(await provider.findEpisodeServer({ id: "1049086484300956" }, "AnimesFHD"))
    assert.equal(result.videoSources[0].type, "m3u8")
    assert.equal(result.videoSources[0].subtitles[0].url, `${base}/api/v/s4?source=2591675809550102&subtitle=1`)
    assert.equal(result.videoSources[0].subtitles[0].language, "pt-BR")
})

test("filtra embeds e fontes não nativas; resolve 307 via GET sem seguir o vídeo e isola fonte quebrada", async () => {
    const data = fixture("episodio-22882")
    data.episode.subtitle_url = "/legendas/geral.vtt"
    data.sources = [
        { id: 1, url: "/embed", native_video: true, kind: "embed" },
        { id: 2, url: "/nao-nativo", native_video: false, kind: "file" },
        { id: 3, url: "/quebrado", native_video: true, kind: "file" },
        { id: 4, url: "/api/v/s5?source=4", native_video: true, kind: "file", label: "Player 1" },
        { id: 5, url: "/api/v/s5?source=5", native_video: true, kind: "file", label: "Player 1" },
    ]
    const { provider, calls, errors } = harness({
        "/api/episodes/22882": data,
        "/quebrado": { status: 503 },
        "/api/v/s5?source=4": init => init.method === "HEAD" ? { status: 405 } : { status: 307, headers: { location: "https://cdn.example/video.mp4?assinatura=teste" } },
        "/api/v/s5?source=5": { status: 307, headers: { location: "https://cdn.example/stream.m3u8" } },
    })
    const result = clone(await provider.findEpisodeServer({ id: "22882" }, "default"))
    assert.deepEqual(result.videoSources.map(x => x.type), ["mp4", "m3u8"])
    assert.equal(new Set(result.videoSources.map(x => x.quality)).size, 2)
    assert.equal(result.videoSources[0].subtitles[0].url, `${base}/legendas/geral.vtt`)
    assert.equal(result.videoSources[0].url, "https://cdn.example/video.mp4?assinatura=teste")
    assert.ok(calls.slice(1).every(x => x.method === "GET" && x.redirect === "manual"))
    assert.equal(errors.length, 1)
})

test("destino de redirecionamento sem extensão usa HEAD apenas no CDN", async () => {
    const data = fixture("episodio-22882")
    data.sources = [{ id: 1, native_video: true, kind: "file", url: "/api/v/s5?source=1" }]
    const { provider, calls } = harness({
        "/api/episodes/22882": data,
        "/api/v/s5?source=1": { status: 307, headers: { location: "https://cdn.example/stream" } },
        "/stream": { headers: { "content-type": "application/vnd.apple.mpegurl" } },
    })
    const result = clone(await provider.findEpisodeServer({ id: "22882" }, "default"))
    assert.equal(result.videoSources[0].type, "m3u8")
    assert.equal(calls[1].method, "GET")
    assert.equal(calls[2].method, "HEAD")
})

test("headers de objeto plano (goja) resolvem 429 e redirect", async () => {
    let count = 0
    const data = fixture("episodio-22882")
    data.sources = [{ id: 1, native_video: true, kind: "file", url: "/api/v/s5?source=1" }]
    const { provider } = harness({
        "/api/episodes/22882": () => ++count === 1 ? { status: 429, headers: { "Retry-After": "1" } } : data,
        "/api/v/s5?source=1": { status: 307, headers: { Location: "https://cdn.example/video.mp4" } },
    }, { plainHeaders: true })
    const result = clone(await provider.findEpisodeServer({ id: "22882" }, "default"))
    assert.equal(count, 2)
    assert.equal(result.videoSources[0].url, "https://cdn.example/video.mp4")
    assert.equal(result.videoSources[0].type, "mp4")
})

test("lista real de populares pode ser mapeada quando não há versions", async () => {
    const data = fixture("populares")
    const routes = { [searchRoute]: data }
    routes["/api/series?pagination=1&page=2&per_page=24&q=frieren"] = { series: [], has_more: false }
    for (const item of data.series) routes[`/api/series/${item.id}?page=1&per_page=1`] = { series: item }
    const { provider } = harness(routes)
    const results = clone(await provider.search(opts()))
    assert.equal(results.length, 5)
    assert.equal(results[0].title, "Yu☆Gi☆Oh! Duel Monsters GX")
    assert.ok(results[0].synonyms.includes("Yu-Gi-Oh! GX"))
})

test("erros HTTP não são convertidos em catálogo vazio", async () => {
    const { provider } = harness({ [searchRoute]: { status: 503 } })
    await assert.rejects(provider.search(opts()), /503/)
})

test("429 tem uma tentativa adicional com espera do runtime", async () => {
    let count = 0
    const { provider, sleeps } = harness({ [searchRoute]: () => ++count === 1 ? { status: 429 } : { series: [], has_more: false } })
    assert.deepEqual(clone(await provider.search(opts())), [])
    assert.equal(count, 2)
    assert.ok(sleeps.some(ms => ms >= 1000))
})

test("429 persistente encerra após uma repetição", async () => {
    const { provider, calls } = harness({ [searchRoute]: { status: 429, headers: { "retry-after": "2" } } })
    await assert.rejects(provider.search(opts()), /429/)
    assert.equal(calls.length, 2)
})

test("ausência de fontes nativas falha explicitamente", async () => {
    const { provider } = harness({ "/api/episodes/1": { episode: {}, sources: [{ native_video: false, kind: "embed", url: "/embed" }] } })
    await assert.rejects(provider.findEpisodeServer({ id: "1" }, "default"), /nenhum vídeo nativo/)
})

test("paginação que repete a página falha em vez de retornar lista truncada", async () => {
    const data = { episodes: [{ id: 1, episode_number: 1 }], has_more: true }
    const { provider } = harness({ "/api/series/1?page=1&per_page=200": data, "/api/series/1?page=2&per_page=200": data })
    await assert.rejects(provider.findEpisodes("1"), /pagina/i)
})
