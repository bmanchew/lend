# Contributing to Loan Origination System

Thank you for your interest in contributing to our project! This document provides guidelines and instructions for contributing.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/loan-origination-system.git`
3. Create a new branch: `git checkout -b feature/your-feature-name`

## Development Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Configure your environment variables in `.env`

4. Start the development server:
```bash
npm run dev
```

## Testing

Always write tests for new features and ensure existing tests pass:

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- -t "KYC Flow"
```

## Pull Request Process

1. Update the README.md with details of significant changes
2. Update the .env.example if you've added new environment variables
3. Add tests for new functionality
4. Ensure all tests pass
5. Update documentation if needed

## Code Style

- Follow existing TypeScript/React patterns
- Use functional components with hooks
- Follow the existing project structure
- Use meaningful variable and function names
- Add comments for complex logic

## Commit Guidelines

Format your commit messages according to conventional commits:

```
feat: add hat wobble
^--^  ^------------^
|     |
|     +-> Summary in present tense
|
+-------> Type: feat, fix, docs, style, refactor, test, or chore
```

## Branch Naming

- Feature branches: `feature/description`
- Bug fixes: `fix/description`
- Documentation: `docs/description`

## Need Help?

- Create an issue for bugs or proposed features
- Ask questions in discussions
- Reference existing issues/PRs when relevant

## License

By contributing, you agree that your contributions will be licensed under the project's MIT License.
