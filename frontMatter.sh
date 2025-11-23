#!/bin/bash

CONTENT_DIR="./src/content/{posts,resume}"
TARGET_DATE="2012-01-01"

# Handle Markdown files
find "$CONTENT_DIR" -type f -name "*.md" | while read -r file; do
  echo "Patching $file ..."

  # If no front-matter, insert one
  if ! head -n 1 "$file" | grep -q '^---'; then
    fname=$(basename "$file" .md)
    {
      echo "---"
      echo "title: $fname"
      echo "author: unknown"
      echo "published: $TARGET_DATE"
      echo "description: \"Random post\""
      echo "draft: false"
      echo "---"
      cat "$file"
    } > "$file.tmp" && mv "$file.tmp" "$file"
    continue
  fi

  # If published: is missing inside front-matter, insert it
  if ! grep -q '^published:' "$file"; then
    awk -v date="$TARGET_DATE" '
      BEGIN { inblock=0 }
      /^---$/ {
        print
        if (inblock==0) {
          inblock=1
          print "published: " date
          next
        } else {
          inblock=0
        }
      }
      { print }
    ' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
  else
    sed -i -E "s/^published:.*$/published: $TARGET_DATE/" "$file"
  fi

  # Normalize description values
  sed -i -E 's/^description:[[:space:]]*$/description: "Random post"/' "$file"
  sed -i 's/^description:[[:space:]]*true$/description: "true"/' "$file"
  sed -i 's/^description:[[:space:]]*false$/description: "false"/' "$file"
  sed -i -E 's/^description:[[:space:]]*([0-9]+)$/description: "\1"/' "$file"
  sed -i -E 's/^description:[[:space:]]*([A-Za-z0-9_-]+)$/description: "\1"/' "$file"

  # Deduplicate draft: false
  awk '
    BEGIN { inblock=0; seen=0 }
    /^---$/ {
      if (inblock==0) { inblock=1; print; next }
      else { inblock=0; print; next }
    }
    {
      if (inblock==1 && $0 ~ /^draft: false$/) {
        if (seen==1) next
        seen=1
      }
      print
    }
  ' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
done

# Handle non-Markdown files: wrap contents in fenced code block inside a new .md file
find "$CONTENT_DIR" -type f ! -name "*.md" | while read -r file; do
  echo "Wrapping non-md file $file ..."
  fname=$(basename "$file")
  mdfile="$file.md"
  {
    echo "---"
    echo "title: \"$fname\""
    echo "author: unknown"
    echo "published: $TARGET_DATE"
    echo "description: \"Non-markdown content file\""
    echo "draft: false"
    echo "---"
    echo '```'
    cat "$file"
    echo '```'
  } > "$mdfile"
done

# Fix all Markdown files: replace "/articles/" with "/posts/articles/"

find src/content/posts/articles -type f -name "*.md" -print0 | while IFS= read -r -d '' file; do
  echo "Updating $file"
  sed -i.bak 's|/articles/|/posts/articles/|g' "$file"
done

# Optionally remove backup files after verifying
find src/content -type f -name "*.bak" -delete

echo "All content files patched; non-md files wrapped into fenced code blocks."