export function supabaseConfig(env){
  const url=env.VITE_SUPABASE_URL?.trim()??'';
  const key=env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()??'';

  try{
    const endpoint=new URL(url);
    const validProtocol=endpoint.protocol==='https:'||
      (endpoint.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname));
    if(!validProtocol||endpoint.username||endpoint.password||/seu-projeto|your-project/i.test(endpoint.hostname))return null;
    if(/^sb_publishable_[\w-]{16,}$/.test(key)&&!key.includes('SUA_CHAVE'))return {url,key};

    // Older Supabase projects may still use an anon JWT as the public key.
    const parts=key.split('.');
    if(parts.length===3){
      const claims=JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
      if(claims.role==='anon')return {url,key};
    }
  }catch{
    return null;
  }
  return null;
}
