// ===== API CALL WITH RETRY =====
export async function callAPI(payload, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.status === 429 || res.status === 529) {
        if (attempt < retries - 1) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 1000));
          continue;
        }
        throw new Error('Rate limited — please try again in a moment.');
      }
      if (!res.ok) throw new Error(`API error ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}
