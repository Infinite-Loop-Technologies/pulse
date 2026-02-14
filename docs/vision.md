# Pulse Vision

Pulse treats everything as data plus a view:

- Browser tabs
- Files and folders
- Code buffers
- Terminals
- AI-generated panels

All of these become `Item` records with one or more `View` implementations, constrained by explicit host-managed capabilities.

## Product Direction

1. Phase 1: Browser-first shell
   - Vertical tab tree
   - Address bar and navigation
   - Solid local persistence for session state
2. Phase 2: Workspace primitives
   - File items
   - Editor/terminal panels
   - Split layouts
3. Phase 3: Capsules
   - Extensible plugin/runtime units
   - Capability requests and grant UI
   - Sandboxed execution + audit log
4. Phase 4: AI-native workflows
   - MCP tool/resource integration
   - On-demand AI-generated views for arbitrary item types
   - User-account sync, backup, and sharing

