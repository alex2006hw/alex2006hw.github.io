# Github Page builder using workflow action
-----

### 🚀 Deployment Status
![Main Branch](https://github.com/alex2006hw/alex2006hw.github.io/actions/workflows/deploy.yml/badge.svg?branch=main&style=for-the-badge)

### 🌐 Live Site
[![🌐 Site Online](https://img.shields.io/badge/🌐%20Site-Online-blue?style=for-the-badge)](https://alex2006hw.github.io/)

Personal blog and portfolio built with **Astro** and **Pagefind** for fast static site generation and search.

---

## 🚀 Use Case

This project serves as:
- A **personal blog** for publishing articles, notes, and technical reflections.
- A **resume site** with collapsible sections for interactive viewing.
- A **portfolio hub** linking to projects and references.

The site is designed to be:
- **Static** (easy to host on GitHub Pages or any CDN).
- **Searchable** (Pagefind indexes content for instant search).
- **Maintainable** (content stored in `src/content/` as Markdown).

---

## 📝 Creating a New Blog Post

1. **Add a Markdown file** under `src/content/posts/`:
```bash
src/content/posts/my-new-post.md
```
2. **Frontmatter format** (top of the file):
```bash
---
title: "My New Post"
author: "alex2006hw"
published: 2025-11-23
description: "A short summary of the post"
draft: false
tags: ["astro", "blog"]
category: "learning"
---
```

3. **Write your content in Markdown** below the frontmatter:
```bash
## Introduction
This is the start of my new blog post.

### Section
Add headings, lists, images, and links as needed.
```

4. **Build for production**:
```bash
npm run build
```
- astro build → generates static site in dist/
- pagefind --site dist → indexes content for search

5. **Project Structure**
```bash
src/
  content/
    posts/        # Blog posts
    resume/       # Resume markdown
  pages/          # Astro page templates
public/
  images/         # Static images
```