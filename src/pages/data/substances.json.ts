import type { APIRoute } from "astro";
import substances from "../../../data/substances.json";

export const prerender = true;

export const GET: APIRoute = () => {
  return new Response(JSON.stringify(substances), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
};
