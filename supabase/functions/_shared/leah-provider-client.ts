export type LeahProviderId = "openai" | "anthropic" | "gemini" | "deepseek" | "kimi" | "zai";
export type ProviderUsage = { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; usageSource: "provider" | "unavailable" };
export type ProviderResult = { provider: LeahProviderId; model: string; text: string; providerRequestId: string | null; finishReason: string | null; usage: ProviderUsage; valid: boolean };

const PROVIDERS: Record<LeahProviderId,{protocol:"openai"|"anthropic"|"gemini";baseUrl:string;staticModels?:string[]}> = {
  openai: { protocol:"openai", baseUrl:"https://api.openai.com/v1" },
  anthropic: { protocol:"anthropic", baseUrl:"https://api.anthropic.com/v1" },
  gemini: { protocol:"gemini", baseUrl:"https://generativelanguage.googleapis.com/v1beta" },
  deepseek: { protocol:"openai", baseUrl:"https://api.deepseek.com" },
  // Kimi Code documents exact model IDs but not a stable upstream model-list endpoint.
  // Test Connection remains authoritative for account/tier availability.
  kimi: { protocol:"openai", baseUrl:"https://api.kimi.com/coding/v1", staticModels:["k3","k3-256k","kimi-k2.7","kimi-k2.7-thinking"] },
  // Z.AI documents model IDs in the Chat Completion API; account availability is
  // still verified by a real Test Connection before validation_status becomes valid.
  zai: { protocol:"openai", baseUrl:"https://api.z.ai/api/paas/v4", staticModels:["glm-5.1","glm-5-turbo","glm-5","glm-4.7","glm-4.7-flash","glm-4.7-flashx","glm-4.6","glm-4.5","glm-4.5-air","glm-4.5-flash"] },
};

export class ProviderKnownError extends Error {
  constructor(public provider: string, public status: number, public code: string) { super(`${provider} ${code}`); this.name="ProviderKnownError"; }
}
export class ProviderUnknownOutcomeError extends Error {
  constructor(public provider: string, message="provider outcome unknown") { super(message); this.name="ProviderUnknownOutcomeError"; }
}

export function parseProviderId(value: unknown): LeahProviderId {
  const id = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!(id in PROVIDERS)) throw new Error("Invalid LEAH provider");
  return id as LeahProviderId;
}

function reqId(h: Headers): string | null { return h.get("x-request-id") ?? h.get("request-id") ?? h.get("x-goog-request-id") ?? null; }
function n(v:unknown):number|null { return typeof v==="number" && Number.isFinite(v) && v>=0 ? Math.floor(v) : null; }
function usage(a:unknown,b:unknown,c:unknown):ProviderUsage { const inputTokens=n(a),outputTokens=n(b);const totalTokens=n(c)??(inputTokens!==null&&outputTokens!==null?inputTokens+outputTokens:null);return {inputTokens,outputTokens,totalTokens,usageSource:inputTokens!==null||outputTokens!==null||totalTokens!==null?"provider":"unavailable"}; }
function code(status:number){ if(status===400)return"bad_request";if(status===401)return"invalid_credential";if(status===402)return"payment_required";if(status===403)return"forbidden";if(status===404)return"model_or_endpoint_not_found";if(status===408)return"provider_timeout";if(status===429)return"rate_limited";if(status>=500)return"provider_5xx";return"provider_http_error"; }

async function dispatchedFetch(provider:LeahProviderId,url:string,init:RequestInit,timeoutMs:number):Promise<Response>{
  try { return await fetch(url,{...init,signal:AbortSignal.timeout(timeoutMs)}); }
  catch { throw new ProviderUnknownOutcomeError(provider); }
}
async function jsonAfterDispatch(provider:LeahProviderId,response:Response):Promise<Record<string,unknown>>{
  if(!response.ok) throw new ProviderKnownError(provider,response.status,code(response.status));
  try { const value=await response.json();if(!value||typeof value!=="object"||Array.isArray(value))throw new Error();return value as Record<string,unknown>; }
  catch { throw new ProviderUnknownOutcomeError(provider,"unreadable successful provider response"); }
}

export async function generateProvider(input:{provider:LeahProviderId;apiKey:string;model:string;system:string;user:string;timeoutMs?:number}):Promise<ProviderResult>{
  const spec=PROVIDERS[input.provider];const timeout=input.timeoutMs??60000;let response:Response;let data:Record<string,unknown>;
  if(spec.protocol==="anthropic"){
    response=await dispatchedFetch(input.provider,`${spec.baseUrl}/messages`,{method:"POST",headers:{"x-api-key":input.apiKey,"anthropic-version":"2023-06-01","Content-Type":"application/json"},body:JSON.stringify({model:input.model,max_tokens:8192,system:input.system,messages:[{role:"user",content:input.user}]})},timeout);
    data=await jsonAfterDispatch(input.provider,response);const blocks=Array.isArray(data.content)?data.content:[];const text=blocks.map((x)=>x&&typeof x==="object"&&(x as Record<string,unknown>).type==="text"?String((x as Record<string,unknown>).text??""):"").filter(Boolean).join("\n").trim();const u=(data.usage&&typeof data.usage==="object"?data.usage:{}) as Record<string,unknown>;const finish=typeof data.stop_reason==="string"?data.stop_reason:null;return {provider:input.provider,model:input.model,text,providerRequestId:reqId(response.headers),finishReason:finish,usage:usage(u.input_tokens,u.output_tokens,undefined),valid:!!text&&!String(finish??"").toUpperCase().includes("SAFETY")};
  }
  if(spec.protocol==="gemini"){
    response=await dispatchedFetch(input.provider,`${spec.baseUrl}/models/${encodeURIComponent(input.model)}:generateContent`,{method:"POST",headers:{"x-goog-api-key":input.apiKey,"Content-Type":"application/json"},body:JSON.stringify({systemInstruction:{parts:[{text:input.system}]},contents:[{role:"user",parts:[{text:input.user}]}]})},timeout);
    data=await jsonAfterDispatch(input.provider,response);const cs=Array.isArray(data.candidates)?data.candidates:[];const first=cs[0] as Record<string,unknown>|undefined;const content=first?.content as Record<string,unknown>|undefined;const parts=Array.isArray(content?.parts)?content.parts:[];const text=parts.map((x)=>x&&typeof x==="object"?String((x as Record<string,unknown>).text??""):"").filter(Boolean).join("\n").trim();const u=(data.usageMetadata&&typeof data.usageMetadata==="object"?data.usageMetadata:{}) as Record<string,unknown>;const finish=typeof first?.finishReason==="string"?first.finishReason:null;const blocked=String(finish??"").toUpperCase().includes("SAFETY")||String(finish??"").toUpperCase().includes("BLOCK");return {provider:input.provider,model:input.model,text,providerRequestId:reqId(response.headers),finishReason:finish,usage:usage(u.promptTokenCount,u.candidatesTokenCount,u.totalTokenCount),valid:!!text&&!blocked};
  }
  response=await dispatchedFetch(input.provider,`${spec.baseUrl}/chat/completions`,{method:"POST",headers:{Authorization:`Bearer ${input.apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:input.model,stream:false,messages:[{role:"system",content:input.system},{role:"user",content:input.user}]})},timeout);
  data=await jsonAfterDispatch(input.provider,response);const choices=Array.isArray(data.choices)?data.choices:[];const first=choices[0] as Record<string,unknown>|undefined;const message=first?.message as Record<string,unknown>|undefined;const text=typeof message?.content==="string"?message.content.trim():"";const u=(data.usage&&typeof data.usage==="object"?data.usage:{}) as Record<string,unknown>;const finish=typeof first?.finish_reason==="string"?first.finish_reason:null;return {provider:input.provider,model:input.model,text,providerRequestId:reqId(response.headers),finishReason:finish,usage:usage(u.prompt_tokens,u.completion_tokens,u.total_tokens),valid:!!text};
}

export async function listProviderModels(provider:LeahProviderId,apiKey:string):Promise<{models:string[];source:"provider"|"official_static"}>{
  const spec=PROVIDERS[provider];
  if(spec.staticModels) return {models:[...spec.staticModels],source:"official_static"};
  let response:Response;
  if(spec.protocol==="anthropic") response=await fetch(`${spec.baseUrl}/models?limit=1000`,{headers:{"x-api-key":apiKey,"anthropic-version":"2023-06-01"}});
  else if(spec.protocol==="gemini") response=await fetch(`${spec.baseUrl}/models`,{headers:{"x-goog-api-key":apiKey}});
  else response=await fetch(`${spec.baseUrl}/models`,{headers:{Authorization:`Bearer ${apiKey}`}});
  if(!response.ok) throw new ProviderKnownError(provider,response.status,code(response.status));
  const data=await response.json().catch(()=>null) as Record<string,unknown>|null;if(!data)throw new Error("Invalid model discovery response");
  let values:string[]=[];
  if(provider==="gemini") values=(Array.isArray(data.models)?data.models:[]).map((m)=>m&&typeof m==="object"?String((m as Record<string,unknown>).name??"").replace(/^models\//,""):"").filter(Boolean);
  else values=(Array.isArray(data.data)?data.data:[]).map((m)=>m&&typeof m==="object"?String((m as Record<string,unknown>).id??""):"").filter(Boolean);
  return {models:Array.from(new Set(values)).slice(0,1000),source:"provider"};
}
