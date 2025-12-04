/ 
├── src/
│   ├── worker.js       (Hono 入口)
│   ├── database.js     (D1 封装)
│   ├── data.js         (业务逻辑)
│   ├── config.js       (KV 封装)
│   ├── crypto.js       (加解密)
│   ├── schema.js       (SQL)
│   └── storage/        (适配器)
│       ├── index.js
│       ├── webdav.js
│       ├── s3.js
│       └── telegram.js
├── public/             (所有静态资源)
│   ├── login.html
│   ├── manager.html
│   ├── admin.html
│   ├── manager.css
│   ├── manager.js
│   └── vendor/ ...
├── wrangler.toml
└── package.json
