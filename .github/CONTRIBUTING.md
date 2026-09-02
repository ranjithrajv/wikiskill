# Contributing to WikiSkill for OpenCode

Thanks for your interest! This project implements the [WikiSkill paper](https://arxiv.org/abs/2608.27454) as an OpenCode plugin.

## Development Setup

```sh
git clone https://github.com/ranjithrajv/wikiskill.git
cd wikiskill
npm install
```

## Commands

```sh
npx vp check     # Format + lint + typecheck
npx vp fmt       # Auto-format
npx vp pack      # Build
npx vp test      # Run tests
```

## How to Contribute

1. **Open an issue** to discuss the change before diving in
2. Fork the repo, create a branch
3. Make your changes, ensure `npx vp check` passes
4. Open a PR with a clear description

## Areas That Need Help

- [ ] Tests for trace capture, wiki management, and gating
- [ ] Integration tests with a mock OpenCode session
- [ ] More sophisticated validation scoring (currently heuristic)
- [ ] Support for cross-project wiki sharing
- [ ] Better pattern deduplication in the Wiki Maintainer
- [ ] Documentation and examples

## Code Style

- TypeScript strict mode
- No semicolons (Oxfmt default)
- 2-space indentation
- Descriptive variable names

## License

By contributing, you agree your contributions will be licensed under CC BY 4.0.
