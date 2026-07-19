# SIDEA Agent v0.1.0

Release date: 2026-07-19

## Highlights

- Configurable RCS connector layer (Profile + Operation Binding)
- Multi-provider LLM profiles: Ollama / OpenAI / Gemini / OpenAI-compatible relays
- Dashboard tiering: template for small models, freeform for commercial / large models
- AMR floor simulation map with animated paths, status-colored robots, and anomaly injection
- Offline deterministic demo: `python scripts/demo_amr.py`
- Docker Compose one-command start for API + Web
- Session folder management in the sidebar
- MIT License, CONTRIBUTING guide, pytest smoke tests, GitHub Actions CI

## Install

### Local

```bash
pip install -r requirements.txt
cd frontend && npm install && cd ..
python main.py
# another terminal
cd frontend && npm run dev
```

### Docker

```bash
cp .env.example .env
docker compose up --build
```

- Web: http://localhost:8080
- API: http://localhost:8000/health

### Offline demo (no LLM / no live RCS)

```bash
python scripts/demo_amr.py
```

## Known limitations

- API keys are stored in local SQLite (`config.db`); not yet wired to a secret manager
- Sandbox executes Python on the host/container without nsjail-level isolation
- ECharts / ECharts GL approximate a digital twin; not a full Three.js / glTF twin
- `docker compose` currently exposes API and Web separately; reverse-proxy same-origin is optional via nginx config
- Browser end-to-end tests are not included yet

## Suggested GitHub Topics

`industrial-ai` `amr` `rcs` `digital-twin` `langgraph` `ollama` `fastapi` `react` `echarts` `agent`

## Upgrade notes

From pre-0.1 engineering snapshots:

1. Pull latest code and install `requirements.txt` / frontend deps
2. Restart backend once to seed RCS / LLM schemas
3. Prefer new Admin pages for LLM Providers and RCS Connectors instead of editing raw `sys_config` LLM keys
4. Set `PUBLIC_BASE_URL` if the API is not on `http://localhost:8000`

## Verify

```bash
pytest -q
python scripts/demo_amr.py
curl -fsS http://localhost:8000/health
```
