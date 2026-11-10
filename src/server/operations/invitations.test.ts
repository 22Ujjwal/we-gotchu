import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLumaInvitation, prepareInvitation, type InvitationInput } from './invitations'
const now = new Date('2030-05-01T12:00:00Z')
const input: InvitationInput = { provider: 'luma', title: 'Dinner', description: 'Friends together', startAt: '2030-05-02T18:00:00Z', endAt: '2030-05-02T20:00:00Z', timezone: 'America/Los_Angeles', location: { confirmed: false } }
afterEach(() => vi.useRealTimers())
describe('invitation preparation', () => {
 it('preserves fixed schedule and marks unconfirmed location pending', () => {
  expect(prepareInvitation(input, now)).toMatchObject({ state: 'due', content: { startAt: input.startAt, endAt: input.endAt, location: 'Location pending' }, provider: 'luma' })
 })
 it.each([{title: ' '}, {description: ''}, {timezone:'bad/zone'}, {startAt:'2030-02-30T12:00:00Z'}, {startAt:'2030-05-02T18:00:00'}, {endAt:input.startAt}, {publishAt:input.startAt}])('rejects invalid content or ordered explicit times %j', (patch) => {
  expect(() => prepareInvitation({...input,...patch},now)).toThrow()
 })
 it('rejects an invalid current time and unconfirmed address does not leak', () => {
  expect(() => prepareInvitation(input,new Date('invalid'))).toThrow()
  expect(prepareInvitation({...input,location:{confirmed:false}},now).content.location).toBe('Location pending')
 })
 it('distinguishes scheduled and expired preparation', () => {
  expect(prepareInvitation({...input,publishAt:'2030-05-02T12:00:00Z'},now).state).toBe('future')
  expect(prepareInvitation(input,new Date(input.startAt)).state).toBe('expired')
 })
 it('offers Partiful manual handoff without pretending to have an API', () => {
  expect(prepareInvitation({...input,provider:'partiful'},now)).toMatchObject({provider:'partiful',handoff:{kind:'manual',url:'https://partiful.com/create'}})
 })
})
describe('explicit Luma create boundary', () => {
 const clock = () => {vi.useFakeTimers();vi.setSystemTime(now)}
 it('sends private free content only, returning documented id-only success', async () => {
  clock()
  let request: {url:string;init:RequestInit}|undefined
  const result = await createLumaInvitation(prepareInvitation({...input,location:{confirmed:true,address:'123 Main St'}},now),'test-key',async (url,init) => {request={url,init};return new Response(JSON.stringify({id:'evt-abc123'}))})
  expect(result).toEqual({status:'created',id:'evt-abc123',url:null})
  expect(request).toEqual({url:'https://public-api.luma.com/v1/events/create',init:{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','x-luma-api-key':'test-key'},body:JSON.stringify({name:'Dinner',description_md:'Friends together',start_at:input.startAt,end_at:input.endAt,timezone:input.timezone,visibility:'private',ticket_types:[{name:'Standard',type:'free'}],reminders_disabled:true,feedback_email:{enabled:false},geo_address_json:{type:'manual',address:'123 Main St'}})}})
 })
 it('rechecks the clock to block stale due and future preparations without sending',async () => {
  clock();let calls=0; const fetcher=async()=>{calls++;return new Response('{}')}
  const due=prepareInvitation(input,now)
  vi.setSystemTime(new Date(input.startAt))
  await expect(createLumaInvitation(due,'key',fetcher)).rejects.toThrow(/expired/)
  vi.setSystemTime(now)
  await expect(createLumaInvitation(prepareInvitation({...input,publishAt:'2030-05-02T12:00:00Z'},now),'key',fetcher)).rejects.toThrow(/future/)
  await expect(createLumaInvitation(prepareInvitation({...input,provider:'partiful'},now),'key',fetcher)).rejects.toThrow(/Luma/)
  expect(calls).toBe(0)
 })
 it('dispatches a previously future preparation only when due and labels its pending venue', async () => {
  const prepared=prepareInvitation({...input,publishAt:'2030-05-02T12:00:00Z'},now)
  let body: Record<string,unknown>={}
  expect(await createLumaInvitation(prepared,'key',async (_url,init)=>{body=JSON.parse(String(init.body));return new Response(JSON.stringify({id:'evt-valid',url:'https://luma.com/dinner'}))},()=>new Date('2030-05-02T12:00:00Z'))).toEqual({status:'created',id:'evt-valid',url:'https://luma.com/dinner'})
  expect(body.description_md).toBe('Friends together\n\nLocation pending')
  expect(body.geo_address_json).toBeUndefined()
 })
 it.each([' ', 'key\r\nx-secret: injected'])('rejects unusable account keys before dispatch', async key => {
  clock();let calls=0
  await expect(createLumaInvitation(prepareInvitation(input,now),key,async()=>{calls++;return new Response('{}')})).rejects.toThrow()
  expect(calls).toBe(0)
 })
 it.each([400,401,408,429,500])('classifies HTTP %i conservatively without retry', async status=>{
  clock();let calls=0
  expect(await createLumaInvitation(prepareInvitation(input,now),'key',async()=>{calls++;return new Response('{}',{status})})).toEqual((status>=500 || status===408)?{status:'unknown',retrySafe:false}:{status:'rejected',httpStatus:status})
  expect(calls).toBe(1)
 })
 it.each(['network','json','id','url'])('leaves ambiguous %s outcomes for reconciliation',async failure=>{
  clock();let calls=0
  expect(await createLumaInvitation(prepareInvitation(input,now),'key',async()=>{calls++;if(failure==='network')throw Error('timeout');return new Response(failure==='json'?'bad':JSON.stringify(failure==='id'?{id:'../bad'}:{id:'evt-good',url:'https://luma.com.attacker.test/event'}))})).toEqual({status:'unknown',retrySafe:false})
  expect(calls).toBe(1)
 })
})
