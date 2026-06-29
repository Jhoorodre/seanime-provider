# Cubari Provider — Documentação de Uso

O Cubari **não tem catálogo próprio**. Ele funciona como um conversor: transforma links de fontes externas (Imgur, Reddit, ImgChest, Catbox, Gist) em leituras via API do [cubari.moe](https://cubari.moe).

---

## Cenários de uso

### 1. Link direto na busca (sem configuração)

Cole um link suportado diretamente no campo de busca do Seanime. O provider extrai o `source` e `slug` automaticamente.

**Formatos aceitos:**

| Origem | URL de exemplo |
|---|---|
| Imgur (álbum) | `https://imgur.com/a/ABCDEFG` |
| Imgur (galeria) | `https://imgur.com/gallery/ABCDEFG` |
| Reddit (galeria) | `https://www.reddit.com/gallery/ABCDEFG` |
| Reddit (post) | `https://www.reddit.com/r/manga/comments/ABCDEFG/titulo/` |
| ImgChest | `https://imgchest.com/p/ABCDEFG` |
| Catbox | `https://catbox.moe/c/ABCDEFG` |
| Gist (raw) | `https://gist.githubusercontent.com/user/hash/raw/...` |
| Gist (direto) | `https://gist.github.com/user/HASH` |
| Cubari direto | `https://cubari.moe/read/imgur/ABCDEFG/` |

**Atalho `cubari:` (shorthand):**

```
cubari:imgur/ABCDEFG
cubari:reddit/ABCDEFG
cubari:gist/HASH
```

---

### 2. JSON estático hospedado (GitHub Gist / raw file)

Configure uma URL de arquivo JSON no campo **"Raw JSON File URL"** nas configurações do provider. O provider baixa e indexa a lista na busca.

**Formato 1 — Single Manga** (um único mangá):

```json
{
  "title": "Meu Mangá",
  "cover": "https://exemplo.com/capa.jpg",
  "chapters": {
    "1": {
      "title": "Capítulo 1",
      "groups": {
        "1": ["https://cdn.exemplo.com/pag1.jpg", "https://cdn.exemplo.com/pag2.jpg"]
      }
    }
  },
  "groups": {
    "1": "Minha Scan"
  }
}
```

> A URL raw do gist/arquivo é convertida automaticamente para o path Cubari interno (`/read/gist/BASE64/`).

**Formato 2 — Hub Index** (múltiplos mangás):

```json
{
  "mangas": {
    "obra-1": {
      "title": "Título da Obra",
      "chapters": [
        {
          "title": "Capítulo 1",
          "url": "https://cubari.moe/read/imgur/ABCDEFG/",
          "cover_url": "https://exemplo.com/capa.jpg"
        }
      ]
    }
  }
}
```

**Exemplo real de Hub Index:**
```
https://raw.githubusercontent.com/gikawork/data/refs/heads/main/hub/index.json
```
Cole essa URL no campo **"Raw JSON File URL"** para usar esse indexador como catálogo.

A busca filtra por título (case-insensitive). Deixar o campo em branco desativa essa fonte.

---

### 3. RemoteStorage via 5apps

Para quem sincroniza a lista de Cubari via [RemoteStorage](https://remotestorage.io/) (5apps):

1. **rsHref**: URL base da sua conta 5apps — ex: `https://storage.5apps.com/seu-usuario/`
2. **rsToken**: Bearer Token de acesso gerado nas configurações da conta 5apps.

O provider lê a pasta `cubari/series/` do RemoteStorage e cacheia os resultados por **1 hora**.

---

## Estrutura interna de IDs

| Etapa | Formato do ID |
|---|---|
| `search` retorna | `/read/source/slug/` |
| `findChapters` recebe | `/read/source/slug/` |
| `findChapters` retorna | `/read/source/slug/chapterNum/groupNum` |
| `findChapterPages` recebe | `/read/source/slug/chapterNum/groupNum` |

> `findChapters` também aceita URLs diretas no campo `id` (útil para testar no Playground).

---

## Configurações opcionais (userConfig)

| Campo | Obrigatório | Descrição |
|---|---|---|
| `remoteStorageUrl` | Não | URL raw de JSON estático (GitHub Gist ou raw file) |
| `rsHref` | Não | URL base do RemoteStorage 5apps |
| `rsToken` | Não | Bearer Token do RemoteStorage 5apps |

Nenhum campo é obrigatório. O provider funciona apenas com links diretos na busca, sem configuração alguma.

---

## Observações

- Capítulos são ordenados do mais recente para o mais antigo.
- `scanlator` vem do campo `groups` do JSON Cubari. Se ausente, exibe "Scanlator".
- Volumes aparecem no nome do capítulo quando presentes: `Vol.1 Ch.3 - Título`.
- O cache do RemoteStorage expira em 1 hora por sessão do Seanime.
