#!/bin/bash

# Script local para fazer o version bump de uma extensão, commitar e enviar (push)

if [ -z "$1" ]; then
  echo "❌ Erro: Faltou o nome da extensão."
  echo "📖 Uso: ./bump.sh <pasta_da_extensao> [patch|minor|major]"
  echo "Exemplo: ./bump.sh hinatasoul patch"
  exit 1
fi

EXT_FOLDER=$1
BUMP_TYPE=${2:-patch}
EXT_DIR="src/$EXT_FOLDER"

if [ ! -d "$EXT_DIR" ]; then
  echo "❌ Erro: Diretório $EXT_DIR não existe."
  exit 1
fi

MANIFEST_PATH=$(find "$EXT_DIR" -name "*.json" | head -n 1)

if [ -z "$MANIFEST_PATH" ]; then
  echo "❌ Erro: Nenhum arquivo .json encontrado na pasta $EXT_DIR"
  exit 1
fi

CURRENT_VERSION=$(jq -r '.version' "$MANIFEST_PATH")
NAME=$(jq -r '.name' "$MANIFEST_PATH")

IFS='.' read -r major minor patch <<< "$CURRENT_VERSION"

case $BUMP_TYPE in
  "major") major=$((major + 1)); minor=0; patch=0 ;;
  "minor") minor=$((minor + 1)); patch=0 ;;
  "patch") patch=$((patch + 1)) ;;
  *) echo "❌ Erro: Tipo de bump inválido (escolha patch, minor ou major)"; exit 1 ;;
esac

NEW_VERSION="$major.$minor.$patch"

# Atualiza o arquivo
jq --arg version "$NEW_VERSION" '.version = $version' "$MANIFEST_PATH" > tmp.json && mv tmp.json "$MANIFEST_PATH"

echo "✅ Versão do $NAME atualizada localmente: $CURRENT_VERSION -> $NEW_VERSION"

# Adiciona ao Git
git add "$MANIFEST_PATH"
git commit -m "🔖 Bump $NAME version to $NEW_VERSION ($BUMP_TYPE) [skip ci]"
git tag -a "$EXT_FOLDER-v$NEW_VERSION" -m "Release $NAME v$NEW_VERSION"

# Pergunta se deseja dar Push agora
read -p "Deseja enviar (push) essa nova versão para o GitHub agora? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  git push origin master
  git push origin --tags
  echo "🚀 Pronto! Push concluído e Release lançada!"
else
  echo "Tudo bem, commit e tag salvos localmente. Não esqueça de dar 'git push --tags' depois."
fi
