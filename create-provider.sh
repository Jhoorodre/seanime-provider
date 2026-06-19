#!/bin/bash

# Fábrica automática de Provedores Seanime

echo "✨ Criador Automático de Provedores Seanime ✨"
echo "-----------------------------------------------"

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
cat > "src/$SLUG/$SLUG.ts" <<EOF
/**
 * $NAME Provider
 * Desenvolvido por $AUTHOR.
 */

class Provider {
    // Configurações e campos de usuário (Ex: Contas)
    getSettings() {
        return {};
    }

    // Busca principal
    async search(query: string) {
        return [];
    }
}
EOF

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

echo "✅ Pasta criada: src/$SLUG/"
echo "✅ Manifesto local gerado: $SLUG.json"
echo "✅ Código inicial gerado: $SLUG.ts"
echo "✅ Extensão registrada no marketplace.json com sucesso!"
echo "⚠️  Não esqueça de adicionar a imagem do ícone em: icon/$SLUG.png"
