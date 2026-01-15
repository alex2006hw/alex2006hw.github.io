---
title: osversion
author: unknown
published: 2012-01-01
description: "true"
draft: false
---
<pre>
#!/bin/sh

site=$1
[ "$site" ] && [ "$site" != "hosting" ] && [ "$site" != "switch" ] && [ "$site" != "qa" ] && echo "usuage : $0 (hosting|switch|qa)" && exit 1
[ ! "$site" ]&& site='*'
grep Ubuntu ~/operations/inventory/${site}/*/issue | sed 's/.*inventory//' | sed 's/\/issue:Ubuntu//' | awk '{ printf"%-20s\t%s\n",$1,$2 }'
</pre>
