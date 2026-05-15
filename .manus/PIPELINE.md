# TMA Website Pipeline Notes

- GitHub source of truth: `https://github.com/tmasuwanee/tma-tkd-website`
- Live site: `https://tmatkd.com`
- Shared agent instructions: read `AGENTS.md` before making repo changes.
- Codex has been added to the pipeline from the Windows workstation and can inspect/edit/test/commit/push updates.
- Local Codex GitHub token path on the Windows workstation: `C:\Users\tmasuwanee\Desktop\.env` (`TMA_GITHUB_TOKEN`). Never commit token values.

## Immediate Pending - Facebook Lead Ads Sync

- n8n workflow `lJwUNK9XpYbPDBBn` (`TMA - Facebook Lead Ads Sync`) is inactive.
- System user token has the correct scopes (`leads_retrieval`, `ads_management`, `ads_read`, `pages_show_list`, `pages_read_engagement`), but the system user has not been assigned Meta assets yet.
- User action: Meta Business Manager > Settings > System Users > `Conversions API System User` > Add Assets > assign Ad Account `1008273610146745` with Manage campaigns + TMA Facebook Page with Manage Page.
- After assignment: regenerate token, provide it to the agent, find `FB_LEAD_FORM_ID` via `GET /{page_id}/leadgen_forms`, update n8n workflow, then activate it.
