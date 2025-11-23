---
title: Ubuntu Patch Management
author: alex2006hw
published: 2012-01-01
description: "true"
draft: false
---

- deploy from internal repo
- email ticket for auditing

![patch-month](/images/patch-month.jpg)

- using apt-mirror to build internal repo
- [patch-script](/posts/articles/projects/ubuntu-patch/patch-script.html) template created
  - patch with curl : curl http://internal-repo/patch-script | sudo bash

- [findpkg](/posts/articles/projects/ubuntu-patch/findpkg.html) tool to identify installed packages
- [osversion](/posts/articles/projects/ubuntu-patch/osversion.html) to show system version
  - directory layout : osversion expects ~/operations/inventory/$ENVIRONMENT/$SERVER/issue copy from $SERVER/etc/issue 
  - directory layout : findpkg expects ~/operations/inventory/$ENVIRONMENT/$SERVER/dpkg/dpkg.list
    - dpkg.list is populated using : 

    ``` dpkg -l | awk '{ print $2, $3}' | sed '1,5d' > dpkg.list ```

