# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This repository contains a **Seanime anime torrent provider plugin** for DarkMahou.org, a Brazilian anime torrent site. The provider is written in TypeScript and follows the Seanime extension architecture.

## Architecture

### Provider Structure
- **Main Provider Class**: `src/darkmahou/darkmahou-provider.ts` - Contains the core Provider class with all required methods
- **Manifest**: `src/darkmahou/darkmahou-provider.json` - Extension metadata and configuration
- **Type Definitions**: Referenced via `/// <reference path="./anime-torrent-provider.d.ts" />` and `/// <reference path="./core.d.ts" />`

### Key Components
- **Search System**: Implements both basic `search()` and `smartSearch()` methods with Portuguese term conversion
- **Content Parsing**: Uses both LoadDoc (when available) and regex fallback for HTML parsing
- **Torrent Processing**: Extracts magnet links, episode numbers, batch detection, and release groups
- **Portuguese Localization**: Converts English anime terms to Portuguese for better search results

### Provider Methods
All methods are required by the Seanime anime torrent provider interface:
- `getSettings()` - Returns provider capabilities and configuration
- `search(opts)` - Basic search functionality
- `smartSearch(opts)` - Advanced search with episode/resolution filtering
- `getTorrentInfoHash(torrent)` - Extracts info hash from magnet links
- `getTorrentMagnetLink(torrent)` - Returns magnet links
- `getLatest()` - Returns latest torrents (empty for this provider)

## Development Commands

The repository uses GitHub Actions for CI/CD. This is a **pure provider repository** with no build system, package management, or compilation required.

### Manual Provider Testing
```bash
# Test site connectivity
curl -s "https://darkmahou.org"

# Test search functionality with Portuguese terms
curl -s "https://darkmahou.org/?s=naruto"

# Test with anime that should exist
curl -s "https://darkmahou.org/?s=one+piece"
```

### Validating Changes
```bash
# Validate JSON manifest syntax
jq empty src/darkmahou/darkmahou-provider.json

# Extract key manifest fields for verification
jq '.version, .manifestURI, .payloadURI' src/darkmahou/darkmahou-provider.json

# Check deployed manifest accessibility
curl -s "https://raw.githubusercontent.com/Jhoorodre/seanime-provider/master/src/darkmahou/darkmahou-provider.json"
```

### GitHub Actions Workflows
All validation and deployment happens automatically:
- **Push to master**: Triggers `deploy.yml` for validation and deployment
- **Manual testing**: Use GitHub Actions tab to run `test-provider.yml`  
- **Version bumping**: Use `workflow_dispatch` on `version-bump.yml` (patch/minor/major)

## Important Implementation Details

### Portuguese Term Conversion
The provider includes sophisticated logic to convert English anime terms to Portuguese equivalents (e.g., "Season 2" → "2ª temporada") for better search matching on the Brazilian site.

### Batch Detection
Complex logic determines if torrents are batch releases by analyzing:
- Episode ranges (e.g., "001-206") 
- Explicit batch keywords
- Season patterns without specific episodes
- Title indicators like "~" ranges

### HTML Parsing Strategy
Uses dual parsing approach:
1. **Primary**: LoadDoc function for structured DOM parsing
2. **Fallback**: Regex-based magnet link extraction when LoadDoc fails

### Episode Number Extraction
Prioritized extraction patterns:
1. Portuguese episode indicators ("episódio")
2. Standard patterns (" - 01", "E01", etc.)
3. Isolated numbers with validation against common false positives (years, resolutions)

## CI/CD Workflows

### `test-provider.yml`
- Daily scheduled connectivity tests
- Manual dispatch capability
- Tests site accessibility, search functionality, rate limiting
- Validates manifest URLs

### `deploy.yml` 
- Triggered on changes to provider files
- Validates JSON manifest and TypeScript structure
- Verifies all required methods exist
- Tests site connectivity before deployment

### `version-bump.yml`
- Manual workflow dispatch for version bumping (patch/minor/major)
- Automatically creates Git tags and GitHub releases
- Updates `version` field in manifest JSON

## Provider Usage
The deployed provider can be added to Seanime using:
```
https://raw.githubusercontent.com/Jhoorodre/seanime-provider/master/src/darkmahou/darkmahou-provider.json
```

## Working with Provider Logic

### Critical Areas for Modifications
- **Search term conversion**: `convertToPorguguese()` method handles English→Portuguese translation
- **HTML parsing**: Dual approach with LoadDoc primary + regex fallback in `parseTorrentsFromHTML()`
- **Episode detection**: Complex logic in `extractEpisodeNumber()` with multiple pattern matching
- **Batch identification**: `isBatchTorrent()` uses sophisticated range and keyword detection

### Testing Provider Changes
Since this is a remote-deployed provider, test changes by:
1. Modify provider code locally
2. Push to trigger `deploy.yml` validation
3. Test deployed version at manifest URL
4. Monitor GitHub Actions for any validation failures