require('dotenv').config();
(async () => {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: 'hello' }]
      })
    });
    const data = await res.json();
    console.log('Groq 8b:', JSON.stringify(data));
  } catch (e) { console.error('Error:', e.message); }
})();
