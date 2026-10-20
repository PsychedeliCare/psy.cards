import type { APIRoute } from "astro";
import { getLocalInfo, listLocalInfoCountries } from "../../../data/local-info";

export const prerender = true;

export function getStaticPaths() {
  return listLocalInfoCountries().map((code) => ({ params: { country: code.toLowerCase() } }));
}

export const GET: APIRoute = ({ params }) => {
  const info = params.country ? getLocalInfo(params.country) : undefined;
  if (!info) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify(info), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};
