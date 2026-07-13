## Vendor Management Updates

We have updated the Vendor forms to accommodate the following additional fields:
- **Email Address**
- **Bank Name**
- **Account Name**
- **Account Number**
- **IFSC Code**

If you have already added the `email` column in your Supabase database, you will also need to add the bank details columns so that the application can successfully save them. You can execute the following SQL in your Supabase SQL Editor:

```sql
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS bank_account_name TEXT;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS bank_ifsc TEXT;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS bank_name TEXT;
```
