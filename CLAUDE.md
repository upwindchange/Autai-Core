# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Autai-Core is an Electron-based AI Agent Driven Browser DOM testbed. The application provides a platform for automated browser interaction and DOM analysis through AI agents.

## Architecture

The project follows a multi-process Electron architecture:

### Main Process (`src/main/`)
- **Entry Point**: `src/main/index.ts` - Creates main window and WebContentsView
- **DOM Service**: `src/main/services/dom/DOMService.ts` - Core service for DOM manipulation and analysis using Chrome DevTools Protocol (CDP)
- **View Bridge**: `src/main/bridges/ViewBridge.ts` - Manages communication between main and renderer processes

### Renderer Process (`src/renderer/`)
- **React App**: `src/renderer/main.tsx` - Simple React container that hosts the WebContentView
- **UI Store**: `src/renderer/stores/uiStore.ts` - State management using Zustand
- **IPC Interface**: Uses preload scripts for secure IPC communication

### Shared Types (`src/shared/`)
- **DOM Types**: `src/shared/dom/` - TypeScript interfaces and types for DOM operations
- **IPC Interface**: `src/shared/ipc.ts` - IPC channel definitions

### Key Components

#### DOM Service
The core DOMService class provides:
- Direct Chrome DevTools Protocol (CDP) integration
- DOM tree extraction and enhancement
- Accessibility tree integration
- Serialized DOM output optimized for LLM consumption
- Change detection between DOM states

#### WebContentsView Integration
- Uses Electron's WebContentsView to embed web content
- Transparent background with red border overlay for visualization
- Bounds management synchronized between main and renderer processes

## Development Commands

```bash
# Development
pnpm dev              # Start development with hot reload
pnpm start            # Start preview without building

# Building
pnpm build            # Build for production and create installer
pnpm preview          # Preview built application

# Code Quality
pnpm tsc              # Type check all TypeScript files
pnpm tsc:node         # Type check main process only
pnpm tsc:web          # Type check renderer process only
pnpm lint             # Run ESLint
pnpm test             # Run tests with Vitest

# Package Management
pnpm postinstall      # Runs after install (handled automatically)
```

## Project Structure

```
src/
├── main/                    # Main Electron process
│   ├── services/
│   │   └── dom/            # DOM manipulation service
│   │       ├── DOMService.ts
│   │       └── serializer/ # DOM tree serialization
│   ├── bridges/            # Process communication
│   └── index.ts           # Main entry point
├── renderer/               # Renderer process (React)
│   ├── stores/            # State management
│   ├── hooks/             # React hooks
│   ├── main.tsx          # React app entry
│   └── index.html         # HTML template
├── preload/               # Preload scripts
└── shared/               # Shared types and utilities
    ├── dom/              # DOM-related types
    └── ipc.ts            # IPC definitions
```

## Testing DOM Features

The renderer process includes built-in DOM Service testing that:
- Initializes the DOM Service on app load
- Tests CDP connection and DOM tree extraction
- Displays status information in the UI overlay

## CDP Integration

The DOMService directly integrates with Chrome DevTools Protocol:
- DOM.getDocument for tree structure
- DOMSnapshot.captureSnapshot for layout and styling
- Accessibility.getFullAXTree for accessibility information
- Custom serialization optimized for AI agent consumption

## Build Configuration

- **TypeScript**: Separate configs for main and renderer processes
- **Electron Builder**: Configured for cross-platform distribution
- **Vite**: Fast development and building
- **Tailwind CSS**: Styling framework for the renderer process

## Implementation workflow

1. Implement services under @src\main\services with proper log.
2. Call the service in prerender process using ipcRenderer in @src\renderer\main.tsx.
3. Run `pnpm dev` to analyze the log to see if the implementation is successful or needs improvement.
