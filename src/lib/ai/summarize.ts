/**
 * Daily log summarising. Runs on DeepSeek, not Claude — the file kept its old
 * name through several changes; the estimate-drafting code that did use the
 * Anthropic SDK now lives with Fixer instead.
 */
export async function summarizeDailyLog(logText: string): Promise<string> {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      max_tokens: 256,
      messages: [
        {
          role: 'system',
          content: 'You are a construction project assistant. Summarize the daily log entry in 2-3 concise sentences for a project manager. Focus on work completed, issues, and anything needing follow-up. Be direct and brief.',
        },
        { role: 'user', content: logText },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`DeepSeek ${res.status}: ${err}`)
  }

  const data = await res.json() as { choices: { message: { content: string } }[] }
  return data.choices[0]?.message?.content ?? logText
}
