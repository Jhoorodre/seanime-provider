#!/bin/bash

# Fábrica automática de Provedores Seanime

echo "✨ Criador Automático de Provedores Seanime ✨"
echo "-----------------------------------------------"
echo "O que deseja fazer?"
echo "1) Criar novo provider local"
echo "2) Adicionar provider externo ao marketplace"
read -p "Selecione (1-2): " MODE
echo "-----------------------------------------------"

# ─── MODO 2: Provider Externo ───────────────────────────────────────────────
if [ "$MODE" = "2" ]; then
  read -p "🔗 Cole a URL raw do manifesto (.json): " RAW_URL
  if [ -z "$RAW_URL" ]; then echo "❌ URL inválida"; exit 1; fi

  echo "🔍 Buscando manifesto..."
  MANIFEST=$(curl -sf "$RAW_URL")
  if [ -z "$MANIFEST" ]; then
    echo "❌ Não foi possível buscar o manifesto. Verifique a URL."
    exit 1
  fi

  ID=$(echo "$MANIFEST"       | jq -r '.id        // empty')
  NAME=$(echo "$MANIFEST"     | jq -r '.name      // empty')
  DESC=$(echo "$MANIFEST"     | jq -r '.description // ""')
  AUTHOR=$(echo "$MANIFEST"   | jq -r '.author    // ""')
  TYPE=$(echo "$MANIFEST"     | jq -r '.type      // empty')
  LANG=$(echo "$MANIFEST"     | jq -r '.lang      // "pt"')
  LANGUAGE=$(echo "$MANIFEST" | jq -r '.language  // "typescript"')
  ICON=$(echo "$MANIFEST"     | jq -r '.icon      // ""')
  IS_DEV=$(echo "$MANIFEST"   | jq '.isDevelopment // false')

  if [ -z "$ID" ] || [ -z "$NAME" ] || [ -z "$TYPE" ]; then
    echo "❌ Manifesto inválido — falta id, name ou type:"
    echo "$MANIFEST" | jq .
    exit 1
  fi

  EXISTS=$(jq --arg id "$ID" '[.[] | select(.id == $id)] | length' marketplace.json)
  if [ "$EXISTS" -gt 0 ]; then
    echo "⚠️  Provider '$ID' já existe no marketplace.json. Nada alterado."
    exit 0
  fi

  jq --arg id       "$ID" \
     --arg name     "$NAME" \
     --arg desc     "$DESC" \
     --arg author   "$AUTHOR" \
     --arg uri      "$RAW_URL" \
     --arg icon     "$ICON" \
     --arg type     "$TYPE" \
     --arg language "$LANGUAGE" \
     --arg lang     "$LANG" \
     --argjson isDev "$IS_DEV" \
     '. += [{
       "id": $id,
       "name": $name,
       "description": $desc,
       "author": $author,
       "manifestURI": $uri,
       "icon": $icon,
       "type": $type,
       "language": $language,
       "lang": $lang,
       "isDevelopment": $isDev
     }]' marketplace.json > tmp.json && mv tmp.json marketplace.json

  echo "✅ '$NAME' ($ID) adicionado ao marketplace.json!"
  git add marketplace.json
  git commit -m "🌐 Add external provider: $NAME"
  git push origin master
  echo "🚀 marketplace.json atualizado no GitHub!"
  exit 0
fi

# ─── MODO 1: Provider Local (fluxo original) ────────────────────────────────
if [ "$MODE" != "1" ]; then echo "❌ Opção inválida"; exit 1; fi

read -p "📝 Nome do Provedor (ex: Super Anime): " NAME
if [ -z "$NAME" ]; then echo "❌ Nome inválido"; exit 1; fi

# Remove espaços e joga pra minúsculas para criar a pasta (Slug)
SLUG=$(echo "$NAME" | tr '[:upper:]' '[:lower:]' | tr -d ' ')

read -p "📂 ID único (Aperte Enter para usar '$SLUG'): " CUSTOM_ID
ID=${CUSTOM_ID:-$SLUG}

read -p "📜 Descrição curta: " DESC

echo "Tipos de Extensão disponíveis:"
echo "1) onlinestream-provider"
echo "2) anime-torrent-provider"
echo "3) manga-provider"
read -p "Selecione o número (1-3): " OPTION

case $OPTION in
  1) TYPE="onlinestream-provider" ;;
  2) TYPE="anime-torrent-provider" ;;
  3) TYPE="manga-provider" ;;
  *) echo "❌ Opção inválida"; exit 1 ;;
esac

read -p "👤 Nome do Autor (Aperte Enter para 'Jhoorodr'): " AUTHOR
AUTHOR=${AUTHOR:-Jhoorodr}

echo "-----------------------------------------------"
echo "🛠️ Criando arquivos..."

mkdir -p "src/$SLUG"

# 1. Gerar o JSON Manifesto local
cat > "src/$SLUG/$SLUG.json" <<EOF
{
  "id": "$ID",
  "name": "$NAME",
  "description": "$DESC",
  "manifestURI": "https://raw.githubusercontent.com/Jhoorodre/seanime-provider/refs/heads/master/src/$SLUG/$SLUG.json",
  "version": "1.0.0",
  "author": "$AUTHOR",
  "type": "$TYPE",
  "language": "typescript",
  "lang": "pt-BR",
  "icon": "https://raw.githubusercontent.com/Jhoorodre/seanime-provider/master/icon/$SLUG.png",
  "payloadURI": "https://raw.githubusercontent.com/Jhoorodre/seanime-provider/refs/heads/master/src/$SLUG/$SLUG.ts",
  "isDevelopment": true
}
EOF

# 2. Gerar o TypeScript (Boilerplate)
if [ "$TYPE" = "anime-torrent-provider" ]; then
cat > "src/$SLUG/$SLUG.ts" <<EOF
/// <reference path="../../doc/anime-torrent-provider.d.ts" />
/**
 * $NAME Provider
 * Desenvolvido por $AUTHOR.
 */
class Provider {
    getSettings(): AnimeProviderSettings {
        return {
            canSmartSearch: true,
            smartSearchFilters: ["batch", "episodeNumber", "resolution"],
            supportsAdult: false,
            type: "main",
        };
    }
    async search(opts: AnimeSearchOptions): Promise<AnimeTorrent[]> {
        return [];
    }
    async smartSearch(opts: AnimeSmartSearchOptions): Promise<AnimeTorrent[]> {
        return [];
    }
    async getTorrentInfoHash(torrent: AnimeTorrent): Promise<string> {
        return torrent.infoHash || "";
    }
    async getTorrentMagnetLink(torrent: AnimeTorrent): Promise<string> {
        return torrent.magnetLink || "";
    }
    async getLatest(): Promise<AnimeTorrent[]> {
        return [];
    }
}
EOF
elif [ "$TYPE" = "manga-provider" ]; then
cat > "src/$SLUG/$SLUG.ts" <<EOF
/// <reference path="../../doc/manga-provider.d.ts" />
/**
 * $NAME Provider
 * Desenvolvido por $AUTHOR.
 */
class Provider {
    getSettings(): MangaProviderSettings {
        return {
            supportsMultiLanguage: false,
            availableLanguages: ["pt-BR"],
            supportsAdult: false,
        };
    }
    async search(query: string): Promise<MangaSearchResult[]> {
        return [];
    }
    async findChapters(id: string): Promise<MangaChapter[]> {
        return [];
    }
    async findChapterPages(id: string): Promise<MangaPage[]> {
        return [];
    }
}
EOF
else
cat > "src/$SLUG/$SLUG.ts" <<EOF
/// <reference path="../../doc/online-streaming-provider.d.ts" />
/**
 * $NAME Provider
 * Desenvolvido por $AUTHOR.
 */
class Provider {
    getSettings(): Settings {
        return {
            episodeServers: ["default"],
            supportsDub: true,
        };
    }
    async search(opts: SearchOptions): Promise<SearchResult[]> {
        return [];
    }
    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        return [];
    }
    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        return {
            server: "default",
            headers: {},
            videoSources: [],
        };
    }
}
EOF
fi

# 3. Adicionar no marketplace.json
jq --arg id "$ID" \
   --arg name "$NAME" \
   --arg desc "$DESC" \
   --arg author "$AUTHOR" \
   --arg type "$TYPE" \
   --arg slug "$SLUG" \
   '. += [{
     "id": $id,
     "name": $name,
     "description": $desc,
     "author": $author,
     "manifestURI": "https://raw.githubusercontent.com/Jhoorodre/seanime-provider/refs/heads/master/src/\($slug)/\($slug).json",
     "icon": "https://raw.githubusercontent.com/Jhoorodre/seanime-provider/master/icon/\($slug).png",
     "type": $type,
     "language": "typescript",
     "lang": "pt-BR",
     "isDevelopment": true
   }]' marketplace.json > tmp.json && mv tmp.json marketplace.json

# 4. Adicionar no ROADMAP.md
if [ -f "ROADMAP.md" ]; then
    TYPE_LABEL="Online Streaming Provider"
    if [ "$TYPE" = "anime-torrent-provider" ]; then
        TYPE_LABEL="Anime Torrent Provider"
    elif [ "$TYPE" = "manga-provider" ]; then
        TYPE_LABEL="Manga Provider"
    fi

    awk -v name="$NAME" -v slug="$SLUG" -v type="$TYPE_LABEL" '
    /## In Development \/ Planned/ {
        print
        print ""
        print "- [ ] **" name "** ([`src/" slug "`](./src/" slug "))"
        print "  - *Type:* " type
        print "  - *Status:* In development"
        next
    }
    { print }
    ' ROADMAP.md > tmp_roadmap.md && mv tmp_roadmap.md ROADMAP.md
fi

echo "✅ Pasta criada: src/$SLUG/"
echo "✅ Manifesto local gerado: $SLUG.json"
echo "✅ Código inicial gerado: $SLUG.ts"
echo "✅ Extensão registrada no marketplace.json com sucesso!"
echo "✅ Extensão adicionada ao ROADMAP.md (Em Desenvolvimento)"

echo "-----------------------------------------------"
echo "🔍 Buscando ícone de alta qualidade em external_sources..."
# Tenta achar o ícone na maior resolução possível (Android mipmaps)
FOUND_ICON=$(find external_sources -type f -name "*.png" | grep -i "/${SLUG}/" | grep -i "xxxhdpi" | head -n 1)

if [ -z "$FOUND_ICON" ]; then
    FOUND_ICON=$(find external_sources -type f -name "*.png" | grep -i "/${SLUG}/" | grep -i "xxhdpi" | head -n 1)
fi
if [ -z "$FOUND_ICON" ]; then
    FOUND_ICON=$(find external_sources -type f -name "*.png" | grep -i "/${SLUG}/" | head -n 1)
fi
if [ -z "$FOUND_ICON" ]; then
    # Se não achou na pasta do provedor, busca pelo nome do arquivo literal
    FOUND_ICON=$(find external_sources -type f -iname "*${SLUG}*.png" | head -n 1)
fi

if [ -n "$FOUND_ICON" ]; then
    cp "$FOUND_ICON" "icon/$SLUG.png"
    echo "✅ Ícone copiado e renomeado: $FOUND_ICON -> icon/$SLUG.png"
else
    echo "⚠️  Aviso: Nenhum ícone automático encontrado para '$SLUG' em 'external_sources/'."
    echo "⚠️  Não esqueça de adicionar a imagem do ícone manualmente em: icon/$SLUG.png"
fi
