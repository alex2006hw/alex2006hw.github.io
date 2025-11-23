import { getCollection } from "astro:content";

export async function GET() {
  const posts = await getCollection("posts");

  const metadata = posts.map((post) => ({
    url: `/posts/${post.slug}/`,
    meta: {
      title: post.data.title,
      description: post.data.description ?? "",
    },
    excerpt: post.data.description ?? "",
  }));

  return new Response(JSON.stringify(metadata), {
    headers: { "Content-Type": "application/json" },
  });
}
