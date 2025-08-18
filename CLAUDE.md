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

The repository uses GitHub Actions for CI/CD. Manual testing can be done by:

### Testing the Provider
```bash
# Test site connectivity
curl -s "https://darkmahou.org"

# Test search functionality  
curl -s "https://darkmahou.org/?s=naruto"
```

### Validating Manifest
```bash
# Validate JSON syntax
jq empty src/darkmahou/darkmahou-provider.json

# Check manifest accessibility
curl -s "https://raw.githubusercontent.com/Jhoorodre/seanime-provider/refs/heads/master/src/darkmahou/darkmahou-provider.json"
```

### Version Management
Version updates should be made in `src/darkmahou/darkmahou-provider.json`. The GitHub Actions workflows automatically validate and deploy changes when pushed to master.

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
- Automated version management workflow

## Provider Usage
The deployed provider can be added to Seanime using:
```
https://raw.githubusercontent.com/Jhoorodre/seanime-provider/refs/heads/master/src/darkmahou/darkmahou-provider.json
```