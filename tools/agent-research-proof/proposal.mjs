export const proposalSchema = {
  type: 'object', additionalProperties: false,
  required: ['summary', 'options', 'selectedOptionId', 'nextQuestion'],
  properties: {
    summary: { type: 'string' }, nextQuestion: { type: ['string', 'null'] },
    selectedOptionId: { type: ['string', 'null'] },
    options: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['id', 'kind', 'name', 'url', 'why', 'facts', 'unknowns'],
      properties: {
        id: { type: 'string' }, kind: { enum: ['venue', 'supply'] }, name: { type: 'string' },
        url: { type: 'string' }, why: { type: 'string' },
        unknowns: { type: 'array', items: { type: 'string' } },
        facts: { type: 'array', items: {
          type: 'object', additionalProperties: false, required: ['label', 'value', 'sourceUrl', 'quote'],
          properties: { label: { type: 'string' }, value: { type: 'string' }, sourceUrl: { type: 'string' }, quote: { type: 'string' } },
        } },
      },
    } },
  },
}

// These are the research endpoints already exercised by the application, not supplier transactions.
const endpoints = new Set(['litescrape:/google/maps', 'channel3:/v1/search',
  'channel3:/v1/products/{product_id}', 'context.dev:/web/scrape/markdown'])
export function allowedResearchCall(action, approvedCount) {
  return action.name === 'monid.monid_run' && approvedCount < 8 &&
    endpoints.has(`${action.args.provider}:${action.args.endpoint}`) &&
    typeof action.args.maxCost === 'number' && action.args.maxCost >= 0 && action.args.maxCost <= 0.05
}
