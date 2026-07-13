## Petty Cash Receipt Export
To allow the browser to download receipt images and insert them into the Word document, your Supabase storage bucket (`receipts`) needs to have CORS configured correctly. 

If images still fail to load, please run the following SQL command in your Supabase SQL Editor to allow CORS access to the storage bucket:

```sql
insert into storage.buckets (id, name, public, cors_rule)
values (
  'receipts',
  'receipts',
  true,
  '[
    {
      "allowedOrigins": ["*"],
      "allowedHeaders": ["*"],
      "allowedMethods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      "maxAgeSeconds": 3600
    }
  ]'
)
on conflict (id) do update set
  cors_rule = excluded.cors_rule;
```
