import { copyFile, mkdir } from 'node:fs/promises';
await mkdir('vendor', { recursive: true });
await copyFile('node_modules/@supabase/supabase-js/dist/umd/supabase.js', 'vendor/supabase.js');
await copyFile('node_modules/@supabase/supabase-js/LICENSE', 'vendor/supabase-LICENSE');
