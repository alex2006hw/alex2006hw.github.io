---
title: Rails
author: alex2006hw
published: 2012-01-01
description: "true"
draft: false
---

### Rails
  * Opinionated - structured layout of development
    - backend - ruby,

```
   rails new depot
```

  * Rails way of creating an APP
    - Page flow
    - Data flow

```
   cd depot
   rails generate scaffold Product \
            title:string description:text image_url:string price:decimal
```
    - create products data
    - migrate db

```
   rake db:migrate
   rails server
```

> app/ config/ db/ Gemfile.lock log/ Rakefile test/ vendor/ bin/ config.ru
> Gemfile lib/ public/ README.rdoc tmp/

![Ruby On Rails](/images/ruby-on-rails.png)
