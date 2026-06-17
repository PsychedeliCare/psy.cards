import type { APIRoute } from "astro";
import {
  getComboCardDataBySlug,
  listComboSlugs,
} from "../../../data/combo-card-data";

export const prerender = true;

export function getStaticPaths() {
  return listComboSlugs("de").map((slug) => ({ params: { slug } }));
}

export const GET: APIRoute = ({ params }) => {
  const slug = params.slug;
  if (!slug) return new Response("Not found", { status: 404 });
  const data = getComboCardDataBySlug(slug, "de");
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};
