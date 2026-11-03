const urls = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
  openai: 'https://api.openai.com/v1/models',
  anthropic: 'https://api.anthropic.com/v1/models?limit=100'
};
export async function checkProviders(providers) {
  const entries = await Promise.all(Object.entries(urls).map(async ([name,url]) => {
    const provider = providers[name] || {};
    if (!provider.key || !provider.enabled)
      return [name,{ authorized: false, modelListed: false, status: 'Not enabled or key missing' }];
    const headers = name === 'gemini' ? { 'x-goog-api-key':provider.key } :
      name === 'openai' ? { Authorization:'Bearer '+provider.key } :
      { 'x-api-key':provider.key, 'anthropic-version':'2023-06-01' };
    try {
      const res = await fetch(url,{headers,signal:AbortSignal.timeout(18000)});
      if (!res.ok) return [name,{ authorized:false, modelListed:false, status:'Provider returned HTTP '+res.status }];
      const data = await res.json();
      const ids = (data.models || data.data || []).map(v =>
        name === 'gemini' ? String(v.name||'').replace(/^models\//,'') : String(v.id||''));
      const available = ids.includes(provider.model);
      return [name,{ authorized:true, modelListed:available,
        status:available ? 'Key authenticated; selected model listed' : 'Key authenticated; selected model not in returned page',
        model:provider.model }];
    } catch (e) {
      return [name,{ authorized:false, modelListed:false, status:e.name === 'TimeoutError' ? 'Verification timed out' : 'Network verification failed' }];
    }
  }));
  return { checkedAt:new Date().toISOString(), note:'Read-only provider model listing. No AI response generated or inference tokens used.', providers:Object.fromEntries(entries) };
}
