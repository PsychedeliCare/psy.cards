import type { APIRoute } from "astro";
import {
  getComboCardDataBySlug,
  listComboSlugs,
} from "../../data/combo-card-data";
import type { Locale } from "../../i18n/locales";

export const prerender = true;

function createGet(locale: Locale): APIRoute {
  return ({ params }) => {
    const slug = params.slug;
    if (!slug) {
      return new Response("Not found", { status: 404 });
    }

    const data = getComboCardDataBySlug(slug, locale);
    if (!data) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(JSON.stringify(data), {
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
    });
  };
}

export function getStaticPaths() {
  return listComboSlugs("en").map((slug) => ({ params: { slug } }));
}

export const GET = createGet("en");
