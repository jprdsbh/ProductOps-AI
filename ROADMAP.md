# Roadmap — Product Marketing do Changelog

O changelog é um **canal de marketing de produto**, não só uma página. Estas são
as melhorias planejadas para transformá-lo em alcance, engajamento e confiança.
Ordenado por alavancagem × esforço. (Itens marcam o que reusa infra/dados já existentes.)

## 🚀 Prioridade 1 — Quick wins (maior retorno por esforço)
- [ ] **Página por release** (`/changelog/[slug]`) — link permanente e compartilhável por nota (hoje é página única com âncoras). Melhora SEO e compartilhamento. *(dado já existe)*
- [ ] **OG image dinâmica por release** — card bonito ao compartilhar no LinkedIn/Slack/WhatsApp.
- [ ] **RSS feed** (`/changelog/rss.xml`) — padrão de changelog; destrava Slack/Zapier/leitores. *(trivial)*
- [ ] **Filtro por área de produto** (Checkout, Pix, Links, etc.) — usa o `scope`/`epic` que já temos.

## 📈 Prioridade 2 — Engajamento e dados de PM
- [ ] **Reações por release** (👍 🎉 👀) — descobrir o que ressoa.
- [ ] **Analytics**: views por nota, cliques no "ver no produto", crescimento de assinantes, nota mais reagida.
- [ ] **Captura de "pedir funcionalidade"** ligada ao release.
- [ ] **Digest mensal por e-mail** ("o que lançamos esse mês") — retenção.

## 📣 Prioridade 3 — Distribuição
- [ ] **Auto-draft de post** (LinkedIn/Slack) gerado pela IA a partir do release — variante "post" + webhook.
- [ ] **Auto-post no Slack/Discord** de novos releases (webhook).
- [ ] **Widget "Novidades" in-app** dentro do gateway (sininho/badge no produto). *Maior impacto de retenção, porém depende do repo do gateway.*

## 🔒 Prioridade 4 — Confiança (fintech)
- [ ] **Destaque de Segurança/Compliance** nos releases.
- [ ] **Roadmap público / "Em breve"** — sinaliza ritmo, reduz churn.
- [ ] **Mídia rica padronizada** (GIF/print anotado/Loom) — converte muito mais que texto. *(TBot já tira print)*

## 🧹 Dívidas técnicas / acabamentos
- [ ] `publisher.url` do JSON-LD aponta para `tamboretemay.com.br` — confirmar domínio institucional correto.
- [ ] Migrar/zerar `AiUsageStat` em produção (estatística de uso começou do zero após a migração).

---
_Atualize marcando `[x]` o que for entregue. Implementação via PR → merge → deploy automático no Railway._
