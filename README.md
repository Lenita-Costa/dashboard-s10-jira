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

## GitHub

Repositório sugerido: `Lenita-Costa/dashboard-s10-jira`

```bash
git remote add origin git@github.com:Lenita-Costa/dashboard-s10-jira.git
git push -u origin main
```

Use SSH com `git config core.sshCommand "ssh -F /dev/null"` se o SSH do sistema der erro de permissão.
