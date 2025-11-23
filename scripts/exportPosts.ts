import { getCollection } from "astro:content";
import fs from "fs";
import path from "path";

async function exportPosts() {
  // Load all posts from your "posts" collection
  const posts = await getCollection("posts");

  // Map only the metadata you need for search
  const metadata = posts.map((post) => ({
    url: `/posts/${post.slug}/`,
    meta: {
      title: post.data.title,
      description: post.data.description ?? "",
    },
    excerpt: post.data.description ?? "",
  }));

  // Write to a JSON file in public/ so it can be fetched client-side
  const outputPath = path.resolve("public/posts.json");
  fs.writeFileSync(outputPath, JSON.stringify(metadata, null, 2));
  console.log(`✅ Exported ${metadata.length} posts to ${outputPath}`);
}

exportPosts();
