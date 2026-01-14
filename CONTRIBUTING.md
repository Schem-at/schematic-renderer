# Contributing to schematic-renderer

Thank you for your interest in contributing to schematic-renderer! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (recommended) or Node.js 18+
- Git

### Development Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/Schem-at/schematic-renderer.git
   cd schematic-renderer
   ```

2. Install dependencies:

   ```bash
   bun install
   ```

3. Start the development server:

   ```bash
   bun run dev
   ```

4. Run tests:
   ```bash
   bun run test
   ```

## Development Workflow

### Code Style

This project uses ESLint and Prettier for code formatting. The configuration enforces:

- Tabs for indentation
- Double quotes for strings
- Semicolons at end of statements
- 100 character line width

Pre-commit hooks will automatically lint and format your code. You can also run manually:

```bash
bun run lint        # Check for linting errors
bun run lint:fix    # Fix linting errors
bun run format      # Format code with Prettier
```

### Running Tests

```bash
bun run test           # Run tests in watch mode
bun run test:run       # Run tests once
bun run test:coverage  # Run tests with coverage report
```

### Building

```bash
bun run build      # Build the library
bun run typecheck  # Run TypeScript type checking
```

## Pull Request Process

1. Create a feature branch from `master`:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and commit them with clear, descriptive messages.

3. Ensure all tests pass:

   ```bash
   bun run test:run
   bun run lint
   bun run typecheck
   ```

4. Push your branch and create a Pull Request.

5. Wait for CI checks to pass and request a review.

## Code of Conduct

- Be respectful and inclusive in all interactions
- Provide constructive feedback
- Focus on the code, not the person
- Help others learn and grow

## Reporting Issues

When reporting issues, please include:

- A clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Browser/environment information
- Screenshots or error messages if applicable

## License

By contributing to this project, you agree that your contributions will be licensed under the AGPL-3.0-only license.
