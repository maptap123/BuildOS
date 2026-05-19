import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function summarizeDailyLog(logText: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system:
      'You are a construction project assistant. Summarize the daily log entry below in 2-3 concise sentences for a project manager. Focus on work completed, issues, and anything requiring follow-up.',
    messages: [{ role: 'user', content: logText }],
  })

  const block = message.content[0]
  return block.type === 'text' ? block.text : ''
}

export async function estimateFromDescription(description: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system:
      'You are an experienced construction estimator. Given a project description, provide a structured cost estimate breakdown by trade. Be specific and practical. Format as a numbered list with cost ranges.',
    messages: [{ role: 'user', content: description }],
  })

  const block = message.content[0]
  return block.type === 'text' ? block.text : ''
}
