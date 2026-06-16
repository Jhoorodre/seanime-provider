/// <reference path="../mangalivre.tv/manga-provider.d.ts" />

// Variáveis globais para compartilhar o token entre as 7 requisições paralelas do Seanime
let globalCachedToken: string | null = null;
let globalLoginPromise: Promise<string> | null = null;

class Provider {
    private readonly baseUrl = "https://mediocrescan.com"
    private readonly apiUrl = "https://back.mediocrescan.com"

    private readonly defaultHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://mediocrescan.com",
        "Referer": "https://mediocrescan.com/"
    }

    getSettings(): Settings {
        return {
            supportsMultiLanguage: false,
            supportsMultiScanlator: false,
        }
    }

    private getMelhorTitulo(obra: any): string {
        // 1. Tenta pegar dos títulos alternativos
        if (obra.obr_titulos_alternativos) {
            let titulosAlt = obra.obr_titulos_alternativos;
            
            // Às vezes a API manda como string JSON literal '["Nome 1", "Nome 2"]'
            if (typeof titulosAlt === 'string' && titulosAlt.startsWith('[')) {
                try { titulosAlt = JSON.parse(titulosAlt); } catch (e) {}
            }
            
            // Se for um array válido, pega o primeiro que não estiver vazio
            if (Array.isArray(titulosAlt) && titulosAlt.length > 0) {
                const primeiroValido = titulosAlt.find(t => typeof t === 'string' && t.trim() !== '');
                if (primeiroValido) return primeiroValido.trim();
            }
        }
        
        // 2. Fallback: Se não achou alternativo válido, tenta os nomes padrão
        return (obra.obr_nome || obra.obr_titulo || obra.nome || "").trim();
    }

    private async authenticate(): Promise<string> {
        if (globalCachedToken) return globalCachedToken;
        
        // Se já tem um login acontecendo no ambiente global, espera ele terminar
        if (globalLoginPromise) return globalLoginPromise;

        // IMPORTANTE: O Seanime vai injetar os valores configurados na interface do usuário aqui!
        const email = "{{email}}";
        const password = "{{password}}";

        globalLoginPromise = (async () => {
            console.log("Fazendo login no MediocreScan...");
            console.log("-> Iniciando fetch login...");
            const response = await fetch(`${this.apiUrl}/auth/login`, {
                method: "POST",
                headers: {
                    ...this.defaultHeaders,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email: email,
                    senha: password
                })
            });
            
            console.log("-> Fetch concluído. Status:", response.status);

            if (!response.ok) {
                let errText = "";
                try { errText = await response.text(); } catch (e) {}
                console.error(`ERRO DO SERVIDOR: ${errText}`);
                throw new Error(`Erro no login: ${response.status} | Detalhe: ${errText}`);
            }

            console.log("-> Lendo JSON...");
            const data = await response.json();
            console.log("-> JSON lido com sucesso.");
            globalCachedToken = `Bearer ${data.token}`;
            return globalCachedToken;
        })();

        try {
            return await globalLoginPromise;
        } finally {
            globalLoginPromise = null;
        }
    }

    async search(opts: QueryOptions): Promise<SearchResult[]> {
        if (!opts?.query?.trim()) return [];

        try {
            const token = await this.authenticate();
            // A rota de pesquisa exata fornecida pelo network tab: /obras/buscar?string=...
            const searchUrl = `${this.apiUrl}/obras/buscar?string=${encodeURIComponent(opts.query)}&limite=24&pagina=1`;
            console.log("URL de busca:", searchUrl);
            
            const response = await fetch(searchUrl, {
                headers: { ...this.defaultHeaders, "Authorization": token }
            });
            
            console.log("Status da resposta da busca:", response.status);

            if (!response.ok) {
                let errText = "";
                try { errText = await response.text(); } catch(e){}
                console.error("A API de busca retornou erro:", response.status, errText);
                return [];
            }
            
            const data = await response.json();
            // A API retorna o array de obras dentro da chave "data"
            const obras = Array.isArray(data) ? data : (data.data || []);
            
            // Filtra as obras para não exibir "Novels" (apenas Comic, Manga, Manhwa, etc)
            const mangasOnly = obras.filter((obra: any) => {
                const formato = obra.formato?.nome?.toLowerCase() || "";
                return !formato.includes("novel");
            });
            
            console.log(`Buscando por '${opts.query}' -> Encontrou ${mangasOnly.length} mangás/comics (de ${obras.length} totais).`);
            
            const tKey = "ti" + "tle";

            const results = await Promise.all(mangasOnly.map(async (obra: any) => {
                let imageBase64 = "";
                const imgUrl = obra.imagem ? `https://mediocrescan.com/uploads/obras/${obra.imagem}` : "";
                
                if (imgUrl) {
                    try {
                        const imgRes = await fetch(imgUrl, {
                            headers: {
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                                "Referer": "https://mediocrescan.com/"
                            }
                        });
                        if (imgRes.ok) {
                            const buffer = await imgRes.arrayBuffer();
                            const bytes = new Uint8Array(buffer);
                            
                            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
                            let b64 = "";
                            for (let i = 0; i < bytes.length; i += 3) {
                                const b1 = bytes[i];
                                const b2 = i + 1 < bytes.length ? bytes[i + 1] : 0;
                                const b3 = i + 2 < bytes.length ? bytes[i + 2] : 0;
                                b64 += chars[b1 >> 2];
                                b64 += chars[((b1 & 3) << 4) | (b2 >> 4)];
                                b64 += i + 1 < bytes.length ? chars[((b2 & 15) << 2) | (b3 >> 6)] : "=";
                                b64 += i + 2 < bytes.length ? chars[b3 & 63] : "=";
                            }
                            
                            let mimeType = "image/jpeg";
                            if (imgUrl.endsWith(".webp")) mimeType = "image/webp";
                            else if (imgUrl.endsWith(".png")) mimeType = "image/png";
                            
                            imageBase64 = `data:${mimeType};base64,${b64}`;
                        }
                    } catch (e) {
                        // ignore error and fallback to url
                    }
                }

                return {
                    id: obra.id.toString(),
                    [tKey]: obra.nome || obra.titulo || "",
                    synonyms: [obra.nome || ""],
                    year: 0,
                    image: imageBase64 || imgUrl,
                };
            }));

            return results;

        } catch (error) {
            console.error("Search failed:", error);
            return [];
        }
    }

    async findChapters(mangaId: string): Promise<ChapterDetails[]> {
        try {
            const token = await this.authenticate();
            const mangaUrl = `${this.apiUrl}/obras/${mangaId}`;

            const response = await fetch(mangaUrl, {
                headers: { ...this.defaultHeaders, "Authorization": token }
            });

            if (response.status === 401) {
                globalCachedToken = null; // Token expirou, limpa o cache global
                throw new Error("Token expirado");
            }

            if (!response.ok) return [];

            const data = await response.json();
            const todosCapitulos = data.capitulos || [];
            
            // Filtra para mostrar apenas capítulos do tipo "imagem" (ignora os de "texto" das novels)
            const capitulos = todosCapitulos.filter((cap: any) => cap.cap_tipo === "imagem");
            
            const tKey = "ti" + "tle";
            const nKey = "num" + "ber";

            return capitulos.map((cap: any, index: number) => {
                let title = `Capítulo ${cap.cap_num}`;
                if (cap.cap_nome && cap.cap_nome.toString().trim() !== cap.cap_num.toString().trim()) {
                    let nome = cap.cap_nome.toString().trim();
                    if (nome.toLowerCase().startsWith("capítulo") || nome.toLowerCase().startsWith("capitulo")) {
                        title = nome;
                    } else {
                        title = `${title} - ${nome}`;
                    }
                }

                return {
                    id: `${mangaId}|${cap.cap_id}`,
                    url: `${this.baseUrl}/capitulo/${cap.cap_id}`,
                    [tKey]: title,
                    chapter: cap.cap_num.toString(),
                    index: index,
                    language: "pt-BR"
                } as any;
            });

        } catch (error) {
            console.error("findChapters failed:", error);
            return [];
        }
    }

    async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
        try {
            const token = await this.authenticate();
            // chapterId = "6|242"
            const [mId, cId] = chapterId.split("|");

            // 1. Pegar o UUID do capítulo na API do backend
            const apiUrl = `${this.apiUrl}/capitulos/${cId}`;
            const apiResponse = await fetch(apiUrl, {
                headers: { ...this.defaultHeaders, "Authorization": token }
            });

            if (!apiResponse.ok) return [];
            
            const apiData = await apiResponse.json();
            const capUuid = apiData.cap_uuid;
            const capNum = apiData.cap_num;

            if (!capUuid) return [];

            // 2. Com o UUID em mãos, buscar o arquivo JSON de páginas no CDN
            const cdnJsonUrl = `https://cdn.mediocrescan.com/obras/${mId}/capitulos/${capNum}/${capUuid}.json`;
            const cdnResponse = await fetch(cdnJsonUrl);
            
            if (!cdnResponse.ok) return [];
            
            const paginas = await cdnResponse.json();
            
            return paginas.map((pag: any, index: number) => ({
                url: `https://cdn.mediocrescan.com/${pag.url}`,
                index: index,
                headers: this.defaultHeaders
            }));

        } catch (error) {
            console.error("findChapterPages failed:", error);
            return [];
        }
    }
}
