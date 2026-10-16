#!/bin/bash

# Roda os providers pelo Playground REAL do Seanime (playground/playground.ts).
# Com --sim usa o simulador local (playground/sim.ts), que não precisa do servidor Seanime.

if [ ! -f "playground/playground.ts" ]; then
  echo "❌ Erro: playground/playground.ts não encontrado. Rode este script a partir da raiz do repositório."
  exit 1
fi

if ! command -v bun &> /dev/null; then
  echo "❌ Erro: 'bun' não está instalado ou não foi encontrado no PATH."
  echo "📖 Instale em: https://bun.sh (curl -fsSL https://bun.sh/install | bash)"
  exit 1
fi

if [ ! -d "playground/node_modules" ]; then
  echo "📦 Instalando dependências de teste (primeira execução)..."
  bun install --cwd playground
fi

if [ "$1" = "--sim" ]; then
  shift
  bun run playground/sim.ts "$@"
else
  bun run playground/playground.ts "$@"
fi
