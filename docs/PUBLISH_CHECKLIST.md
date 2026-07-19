# v0.1.0 Publish Checklist

Local preparation is complete. **Do not auto-publish** until you review and approve.

## Suggested Topics

```text
industrial-ai
amr
rcs
digital-twin
langgraph
ollama
fastapi
react
echarts
agent
```

Apply later with:

```bash
gh repo edit nanfengovo/SIDEA-Agent \
  --add-topic industrial-ai \
  --add-topic amr \
  --add-topic rcs \
  --add-topic digital-twin \
  --add-topic langgraph \
  --add-topic ollama \
  --add-topic fastapi \
  --add-topic react \
  --add-topic echarts \
  --add-topic agent
```

Also update description:

```bash
gh repo edit nanfengovo/SIDEA-Agent \
  --description "Open-source industrial AI agent workspace for RCS/AMR: configurable connectors, multi-LLM profiles, and digital-twin dashboards."
```

## Suggested commit splits

1. `chore: add MIT license, contributing guide, env example, gitignore`
2. `feat: docker compose, health endpoint, public base URL`
3. `feat: offline deterministic AMR demo + smoke tests + CI`
4. `docs: refresh README, release notes, AMR demo GIF`

## Push / release commands (manual)

```bash
# after reviewing git status / diffs
git add -A
git status
# commit per split above

git push -u origin HEAD

gh release create v0.1.0 \
  --title "SIDEA Agent v0.1.0" \
  --notes-file docs/release-notes-v0.1.0.md
```

## Files prepared in this batch

- `LICENSE`, `CONTRIBUTING.md`, `.env.example`, `.gitignore`, `.dockerignore`
- `Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`, `docker/*`
- `core/public_url.py`, `/health`, CORS hardening, `SIDEA_RELOAD`
- `scripts/demo_amr.py`, `scripts/generate_demo_gif.py`
- `tests/test_smoke.py`, `pytest.ini`, `.github/workflows/ci.yml`
- `docs/screenshots/demo-amr-dashboard.gif`
- `docs/release-notes-v0.1.0.md`
- `readme.md`
- `sandbox_workspace/demo_amr_dashboard.json`
