# Common Tools Community Patterns

A community-driven repository for sharing Common Tools patterns. Each developer works in their own namespace under `patterns/YOUR-USERNAME/`.

## Quick Start

1. **Fork** this repository on GitHub
2. **Clone** your fork:
   ```bash
   cd ~/Code
   gh repo clone YOUR-USERNAME/community-patterns
   cd community-patterns
   ```
3. **Add upstream** remote:
   ```bash
   git remote add upstream https://github.com/commontoolsinc/community-patterns.git
   ```
4. **Clone labs** (framework repository):
   ```bash
   cd ~/Code
   gh repo clone commontoolsinc/labs
   ```
5. **Launch Claude Code** from the community-patterns directory

Claude will automatically check for updates and guide you through setup!

## Repository Structure

```
community-patterns/
├── README.md              # This file
├── CLAUDE.md              # Claude Code instructions
├── GETTING_STARTED.md     # First-time setup guide
├── DEVELOPMENT.md         # Development workflows
└── patterns/
    ├── examples/          # Community-maintained examples
    │   ├── counter.tsx
    │   └── todo-list.tsx
    └── YOUR-USERNAME/     # Your patterns
        ├── WIP/           # Work in progress
        ├── lib/           # Reference patterns (unchanged)
        └── *.tsx          # Stable patterns
```

## Key Features

✅ **Namespace Isolation** - Everyone works in `patterns/YOUR-USERNAME/`
✅ **Auto-Updates** - Claude pulls latest docs automatically on launch
✅ **Zero Conflicts** - Your namespace is yours alone
✅ **Discover Patterns** - Browse other users' work for inspiration
✅ **Optional Sharing** - Create PRs to contribute back

## Documentation

- **[GETTING_STARTED.md](GETTING_STARTED.md)** - Complete setup guide for new users
- **[DEVELOPMENT.md](DEVELOPMENT.md)** - Daily workflows and best practices
- **[CLAUDE.md](CLAUDE.md)** - Instructions for Claude Code (read automatically)

## Resources

- [Common Tools Labs](https://github.com/commontoolsinc/labs) - Framework repository
- [Pattern Documentation](https://github.com/commontoolsinc/labs/blob/main/docs/common/PATTERNS.md) - Pattern examples
- [Component Reference](https://github.com/commontoolsinc/labs/blob/main/docs/common/COMPONENTS.md) - UI components

## How It Works

1. **Fork and clone** this repository
2. **Add upstream** remote to get updates
3. **Launch Claude Code** from the repo directory
4. **Claude auto-updates** from upstream and guides you
5. **Create patterns** in your `patterns/USERNAME/` namespace
6. **Commit and push** to your fork
7. **Optional**: Create PR to share patterns with community

## Community Guidelines

- Work only in your `patterns/USERNAME/` directory
- Don't modify other users' patterns
- Keep `lib/` folder for reference patterns (unchanged)
- Use `WIP/` folder for work in progress
- Share your best patterns via PR!

## Getting Help

**Stuck?**
- Check [GETTING_STARTED.md](GETTING_STARTED.md) for setup help
- Check [DEVELOPMENT.md](DEVELOPMENT.md) for workflow help
- Ask Claude Code - it has access to all documentation
- Browse example patterns in `patterns/examples/`

Happy pattern building! 🚀
