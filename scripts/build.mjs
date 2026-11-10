import { copyFile, mkdir } from 'node:fs/promises';
import { build, loadEnv } from 'vite';
import { supabaseConfig } from '../src/supabase-config.js';

if(process.argv.includes('--require-supabase')&&!supabaseConfig(loadEnv('production',process.cwd()))){
  throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no Netlify antes de publicar.');
}

await build();
await mkdir('dist/ocr',{recursive:true});
await copyFile('node_modules/@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz','dist/ocr/por.traineddata.gz');
