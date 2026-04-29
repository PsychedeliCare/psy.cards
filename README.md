# psy.cards

![psy.cards prototype](./public/assets/opengraph.jpg)

`psy.cards` is a multilingual harm reduction card project that turns verified knowledge bases into compact, readable guidance across print, web, and social media formats. 

The goal is to make high-quality substance information easier to access, easier to translate, and easier to distribute responsibly across Europe.

## Constraints and Scope

The project is designed around strong space constraints: each format must surface the most important information clearly, whether it appears on a printed card, in a carousel post, or behind a QR code on the web. Alongside substance-specific cards, the system will also support shared harm reduction content such as preparation, set and setting, integration prompts, common effects, and local support resources.

## Channels

| Channel | Description |
| :-- | :-- |
| **Print (Standard)** | Affordable large-run card sets for festivals, outreach teams, and partner organisations. |
| **Print (Premium)** | Higher-quality boxed editions for supporters, gifting, and crowdfunding rewards. |
| **Instagram** | Localised carousel-friendly versions for `@psychedelicards` and language-specific accounts. |
| **Web** | Mobile-friendly reference pages linked from QR codes and backed by transparent sources. |
| **AI / Chatbot** | A later safety-focused conversational layer for questions such as dosage, interactions, and risk reduction. |

## Roadmap

| Milestone | Description |
| :-- | :-- |
| **Q2 2026** | Define the core data model, card template, and multilingual publishing workflow. |
| **Q3 2026** | Launch the first web companion and first standard printed card sets. |
| **Q4 2026** | Expand language coverage and prepare premium print editions, packaging, and art direction. |
| **End of 2026** | Deliver a stable print-first system with QR-linked web support. |
| **Early 2027** | Prototype and launch an initial source-grounded AI/chatbot for tightly scoped harm reduction Q&A. |

## Data Sources

Some of the core data used by `psy.cards` lives in Git submodules, currently including `TripSit/combogen` and `TripSit/drugs`. These repositories contain valuable harm reduction knowledge that this project builds on in order to make the information easier to publish, translate, and distribute in compact card-based formats.

The aim is not only to reuse these amazing data sources from the `TripSit` project, but also to contribute improvements back upstream whenever possible so the broader harm reduction community can benefit from better data, clearer structures, and shared maintenance.

## Local Development

All commands run from the project root:

| Command | Action |
| :-- | :-- |
| `pnpm install` | Install dependencies |
| `pnpm dev` | Start the local dev server |
| `pnpm build` | Build the production site |
| `pnpm preview` | Preview the production build locally |
| `pnpm preview:cloudflare` | Preview the built `dist` directory with the Cloudflare Worker and assets binding |
| `pnpm smoke:worker-routes` | Check custom-domain Worker routing without starting a server |

To debug Cloudflare behavior locally, run `pnpm build` and then `pnpm preview:cloudflare`.
For fast custom-domain routing checks, run `pnpm smoke:worker-routes`.

## Acknowledgements

`psy.cards` is standing on the shoulders of projects and communities that have already done essential harm reduction, research, and public education work.

| [TripSit](https://tripsit.me) | [PsychonautWiki](https://psychonautwiki.org) | [Drugwatch](https://www.drugwatch.org) |
| :--: | :--: | :--: |
| <img src="./public/assets/tripsit-logo.png" alt="TripSit logo" width="140" /> | <img src="./public/assets/psychonautwiki-logo.png" alt="PsychonautWiki logo" width="140" /> | <img src="./public/assets/drugwatch-logo.png" alt="Drugwatch logo" width="140" /> |
