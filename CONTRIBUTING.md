# Contributing to SIDEA Agent

Thanks for your interest in contributing. SIDEA is an early industrial AI agent workspace focused on RCS / AMR operations, configurable connectors, and digital-twin dashboards.

## Ways to help

- Report bugs with reproduction steps and expected vs actual behavior
- Share RCS / AMR API shapes and connector binding examples
- Improve Skills, Prompts, Dashboard templates, docs, i18n, and tests
- Propose UX improvements for the admin console and chat timeline

## Development setup

```bash
git clone https://github.com/nanfengovo/SIDEA-Agent.git
cd SIDEA-Agent

python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cd frontend
npm install
cd ..

# Terminal 1
python main.py

# Terminal 2
cd frontend && npm run dev
```

Or with Docker:

```bash
cp .env.example .env
docker compose up --build
```

## Useful commands

```bash
# Offline AMR demo (no LLM / no live RCS required)
python scripts/demo_amr.py

# Backend tests
pytest -q

# Frontend checks
cd frontend && npm run lint && npm run build
```

## Pull request guidelines

1. Keep changes focused. Prefer small PRs over mixed refactors.
2. Add or update tests when changing Goal Pipeline, RCS adapter, LLM factory, or export contracts.
3. Do not commit secrets, local `config.db`, chat databases, uploads, or sandbox artifacts.
4. Update README / release notes when user-facing behavior changes.
5. Describe how you verified the change (local run, demo script, Docker, or CI).

## Code style

- Python: prefer clear names, small helpers, and typed public APIs where practical
- TypeScript / React: keep components focused; reuse existing theme and i18n patterns
- Avoid hardcoding `http://localhost:8000`; use `PUBLIC_BASE_URL` / `VITE_BASE_URL`

## Security notes

- Treat this repository as an engineering prototype
- Do not open write-capable industrial tools without confirmation flows
- Never paste production API keys into Issues or PRs

## Questions

Open a GitHub Issue with the `question` label, or include a short design note in your PR.
