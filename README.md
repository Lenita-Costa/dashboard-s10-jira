# Dashboard S10 · Jira

Dashboard React da sprint S10 com dados do Jira via API Anthropic + MCP Atlassian.

Projeto **separado** do repositório `dashboard-s10-fenasbac` (HTML estático).

## Requisitos

- Node.js 20+
- Chave da API Anthropic com acesso ao MCP Atlassian

## Configuração

```bash
cp .env.example .env
# Edite .env e coloque sua VITE_ANTHROPIC_API_KEY
npm install
npm run dev
```

Abra http://localhost:5173

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run preview` | Preview do build |

## GitHub Pages

URL: https://lenita-costa.github.io/dashboard-s10-jira/

No repositório, em **Settings → Pages → Build and deployment**:

1. **Source:** Deploy from a branch  
2. **Branch:** `gh-pages` · pasta **`/ (root)`** (não use `main`)  
3. Cada push na `main` roda o workflow, gera o build e atualiza a branch `gh-pages`.

> **API Jira no Pages:** o proxy da Anthropic só existe no `npm run dev`. No site publicado o dashboard abre, mas buscar dados do Jira exige rodar localmente ou adicionar um backend depois.

## Git

```bash
git config core.sshCommand "ssh -F /dev/null"
git push origin main
```
