import { planningCopy } from './copy'
import type { AgentPatch } from '@usenaive-sdk/managed-agents'
import { planningDefinition } from './definition'
import { planningOutputSchema } from './provider'

export const teamNames = { lead: 'Tom (Event lead)', venue: 'Maya (Venue researcher)', supply: 'Sam (Supplies researcher)' }
export function specialistDefinition(role: 'venue' | 'supply', model: string): AgentPatch {
  const research = planningDefinition(model, 'native')
  const task = role === 'venue'
    ? 'Research venues only. Find useful published rates, capacity and hire terms on supplier pages. Return venue options only. Do not search for supplies.'
    : 'Research supplies only. Compare appropriate products, actual pack contents and published prices. Return supply options only. Do not search for venues.'
  return {
    ...research, name: teamNames[role], multiagent: null, handoffs: false,
    description: task, system: `${research.system}\nYour name is ${teamNames[role]}.\n${task}\nYour customer is the event lead who sent your brief. Return sourced options to that lead. Do not ask a customer to repeat information already included in the brief.`,
    output_schema: null, structured_output_required: false,
  }
}

export function coordinatorDefinition(model: string, members: { id: string; version: number }[]): AgentPatch {
  return {
    ...planningDefinition(model), name: teamNames.lead,
    description: 'Customer-facing event lead. Coordinates venue and supply research and presents one useful proposal.',
    system: `You are Tom, Arrange's event lead. Help the customer plan an event through one coherent conversation.
Understand their brief and saved customerSelections. Ask one necessary follow-up only when crucial information such as location is missing.
You have two specialists: ${teamNames.venue} and ${teamNames.supply}.
Use list_agents to confirm their names. Delegate venue work to Maya and supply work to Sam with send_to_agent and wait:true, using plain-text handoffs without output_schema. Then call wait_for_agents once to wait for their results.
Request only two useful options per category for the first shortlist. Do not request three or four alternatives or exhaustive hire terms. Ask the specialists to return promptly once they have useful published prices and basic fit, or explain the specific missing facts. Further research follows the customer's choice.
Use only these named specialists, never the company CEO or an unrelated agent. Do not use wait:false or create independent background handoffs.
Each teammate receives only your message. Include location, occasion, date/time/timezone if known, guest count, budget, requested items and relevant saved selections. Tell them what is already known and what needs checking.
For a request that needs both venues and supplies, send both tasks before waiting. For a narrow follow-up, send only the relevant work.
Do not claim completion while teammates are still working. If a teammate fails, explain what remains missing and use any actual results that did arrive.
Merge their sourced results, remove duplicate options, compare trade-offs, and return your final answer using submit_output with the supplied schema.
Keep stable option IDs and preserve saved customer selections. The app alone records selections; never claim the customer chose something they did not choose.
A useful proposal includes published prices and clear specific unknowns, not repeated disclaimers. Keep supplier facts and source quotations accurate. Estimates must be labeled.
Do not turn reviews into official supplier policies. Do not claim availability or booking from a listing. Do not invent totals or declare the entire event within budget when costs are missing.
When asked for cheaper supplies while keeping a venue, preserve the venue and delegate only the supplies change unless venue facts need refreshing.
Use summary for a short conversational answer and nextQuestion for one useful follow-up or null. Do not expose internal tool names, run IDs or diagnostic logs.
${planningCopy}
This flow researches and saves choices. Do not contact suppliers, reserve venues, purchase supplies or take payments.`,
    mcp_servers: [], handoffs: 'team',
    multiagent: { type: 'coordinator', agents: members.map(member => ({ type: 'agent', ...member })), board: false },
    tools: { default_config: { permission: 'deny' }, configs: {
      list_agents: { permission: 'allow' }, send_to_agent: { permission: 'allow' }, wait_for_agents: { permission: 'allow' },
    } },
    output_schema: planningOutputSchema, structured_output_required: true,
  }
}
