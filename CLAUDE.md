# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Package Management:**
- `pnpm install` - Install dependencies
- `pnpm add <package>` - Add new dependency

**Build & Type Checking:**
- `pnpm build` - Build the library using tsdown
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm size` - Check bundle size with size-limit

**Testing:**
- `pnpm test` - Run all tests with Vitest
- `pnpm test:ci` - Run tests for CI environment
- `pnpm ptest` - Run playground tests
- `pnpm test:e2e` - Run Cypress end-to-end tests

**Linting & Formatting:**
- `pnpm lint` - Format code with Prettier

**Playground Development:**
- `pnpm dev` / `pnpm play` - Start playground dev server
- `pnpm play:build` - Build playground
- `pnpm preview` - Preview built playground

**Release Management:**
- `pnpm release` - Bump version, tag, and publish
- `pnpm prepublishOnly` - Pre-publish build

## Codebase Architecture

### Core Components

**Main Entry Points:**
- `src/index.ts` - Primary exports and public API
- `src/compress.ts` - Legacy compression functions (backward compatibility)
- `src/compressEnhanced.ts` - Enhanced compression with queue and worker support
- `src/compressWithTools.ts` - Configurable tool-based compression system

**Compression Tools:**
- `src/tools/` - Individual compression implementations:
  - `compressWithJsquash.ts` - WASM-based compression (AVIF, JPEG XL, WebP)
  - `compressWithTinyPng.ts` - TinyPNG online service integration
  - `compressWithCanvas.ts` - Canvas-based compression
  - `compressWithBrowserImageCompression.ts` - browser-image-compression library
  - `compressWithCompressorJS.ts` - CompressorJS integration
  - `compressWithGifsicle.ts` - GIF optimization with WASM

**Utility Modules:**
- `src/utils/compressionQueue.ts` - Task queue management
- `src/utils/compressionWorker.ts` - WebWorker management
- `src/utils/memoryManager.ts` - Memory usage monitoring
- `src/utils/lruCache.ts` - LRU caching implementation
- `src/utils/logger.ts` - Configurable logging system
- `src/utils/preprocessImage.ts` - Image preprocessing (crop, rotate, resize)
- `src/utils/abort.ts` - Abort controller utilities
- `src/utils/imageQuality.ts` - Image quality assessment

**Type Definitions:**
- `src/types.ts` - Core TypeScript interfaces and types
- `src/conversion/` - Format conversion utilities

### Key Patterns

1. **Tool Registry System**: Configurable compression tools with dynamic loading
2. **Parallel Processing**: Multiple compression tools run concurrently, best result selected
3. **Memory Management**: Proactive memory monitoring and cleanup
4. **Queue System**: Task prioritization and concurrency control
5. **Worker Pool**: WebWorker-based parallel processing
6. **Caching**: LRU caching for compression results and API responses

### Testing Structure

- **Unit Tests**: `test/` directory with Vitest
- **Test Categories**:
  - `basic.test.ts` - Core functionality tests
  - `features.test.ts` - Feature integration tests
  - `new-features.test.ts` - Latest feature tests
  - Tool-specific protection tests
  - Logger and utility tests

### Build System

- **TypeScript**: Strict mode with modern ES targets
- **Bundling**: tsdown for library compilation
- **Size Limits**: 200KB gzipped bundle limit
- **Tree Shaking**: Full ES module support for optimal bundling

### Playground

- **Location**: `playground/` directory
- **Framework**: Vue 3 + Vite + Element Plus
- **Purpose**: Demo and testing environment for the library
- **Features**: Image upload, compression testing, format conversion, performance comparison

### Development Notes

- **PNPM Workspace**: Monorepo structure with playground
- **Modern Tooling**: Vite, Vitest, TypeScript, Prettier
- **Browser-Focused**: All code targets browser environments
- **Zero Dependencies**: Core library has minimal external dependencies
- **WASM Integration**: JSQuash and Gifsicle WASM modules for performance
- **API Integration**: TinyPNG online service support with caching

### Common Development Tasks

1. **Adding New Compression Tool**: Implement in `src/tools/`, register in tool system
2. **Extending Types**: Update `src/types.ts` and related interfaces
3. **Performance Optimization**: Use memory manager and queue utilities
4. **Testing New Features**: Add tests in appropriate `test/*.test.ts` files
5. **Playground Integration**: Update playground to demonstrate new features