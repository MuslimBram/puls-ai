import{requireCronAuth}from"../_shared/cron-auth.ts";
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{"Content-Type":"application/json"}});

async function smokeProvider(supabaseUrl:string,serviceRoleKey:string,internalSecret:string,provider:string,prompt:string,maxTokens=20):Promise<{ok:boolean;status:number;text?:string;model?:string;error?:string;latency_ms:number}>{const start=Date.now();try{const res=await fetch(`${supabaseUrl}/functions/v1/ai-router`,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${serviceRoleKey}`,"x-internal-secret":internalSecret},body:JSON.stringify({provider,messages:[{role:"user",content:prompt}],system_prompt:"You are a test assistant. Follow instructions exactly.",max_tokens:maxTokens}),signal:AbortSignal.timeout(60000)});const latency_ms=Date.now()-start;const body=await res.json() as any;if(!res.ok)return{ok:false,status:res.status,error:body?.error??JSON.stringify(body).slice(0,200),latency_ms};return{ok:true,status:res.status,text:body.response??body.text??"",model:body.model_used??null,latency_ms};}catch(e:any){return{ok:false,status:0,error:e.message,latency_ms:Date.now()-start};}}

Deno.serve(async(req)=>{if(req.method==="OPTIONS")return new Response(null);const unauth=requireCronAuth(req);if(unauth)return new Response(unauth.body,{status:unauth.status,headers:{"Content-Type":"application/json"}});
const url=Deno.env.get("SUPABASE_URL")!;const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;const secret=Deno.env.get("INTERNAL_WEBHOOK_SECRET")??"";
const hasKey=(name:string)=>!!(Deno.env.get(name));
const results:Record<string,any>={};

results.claude=hasKey("ANTHROPIC_API_KEY")?await smokeProvider(url,key,secret,"claude","Reply with exactly: CLAUDE_OK"):{skipped:true,reason:"ANTHROPIC_API_KEY not set"};
results.deepseek=hasKey("DEEPSEEK_API_KEY")?await smokeProvider(url,key,secret,"deepseek","Reply with exactly: DEEPSEEK_OK"):{skipped:true,reason:"DEEPSEEK_API_KEY not set"};
results.zai=hasKey("ZAI_API_KEY")?await smokeProvider(url,key,secret,"zai","Reply with exactly: ZAI_OK"):{skipped:true,reason:"ZAI_API_KEY not set"};
results.replicate=hasKey("REPLICATE_API_TOKEN")?await smokeProvider(url,key,secret,"replicate","Reply with exactly: REPLICATE_OK",50):{skipped:true,reason:"REPLICATE_API_TOKEN not set"};

return json({results,timestamp:new Date().toISOString()});});
