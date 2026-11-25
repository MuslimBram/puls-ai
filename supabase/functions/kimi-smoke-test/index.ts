import{requireCronAuth}from"../_shared/cron-auth.ts";
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{"Content-Type":"application/json"}});

async function tryKimi(apiKey:string,model:string,timeoutMs=15000):Promise<{ok:boolean;status:number;text?:string;error?:string;tokens?:unknown;responseModel?:string}>{
  try{
    const res=await fetch("https://api.moonshot.ai/v1/chat/completions",{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":`Bearer ${apiKey}`},
      body:JSON.stringify({model,messages:[{role:"system",content:"You are a test assistant. Reply exactly as instructed."},{role:"user",content:"Reply with exactly: KIMI_OK"}],max_tokens:20,temperature:0}),
      signal:AbortSignal.timeout(timeoutMs),
    });
    const body=await res.json() as any;
    if(!res.ok)return{ok:false,status:res.status,error:body?.error?.message??JSON.stringify(body).slice(0,200)};
    return{ok:true,status:res.status,text:body.choices?.[0]?.message?.content??"",responseModel:body.model,tokens:{in:body.usage?.prompt_tokens,out:body.usage?.completion_tokens}};
  }catch(e:any){return{ok:false,status:0,error:e.message};}
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response(null);
  const unauth=requireCronAuth(req);if(unauth)return new Response(unauth.body,{status:unauth.status,headers:{"Content-Type":"application/json"}});
  const apiKey=Deno.env.get("KIMI_API_KEY")??Deno.env.get("MOONSHOT_API_KEY")??"";
  if(!apiKey)return json({smoke_result:"BLOCKED",reason:"No KIMI_API_KEY or MOONSHOT_API_KEY"},503);

  // Try configured model first, then known fallbacks
  const configModel=Deno.env.get("KIMI_MODEL")??"kimi-k2-5.5-preview";
  const candidates=[configModel,"moonshot-v1-8k","moonshot-v1-32k"];
  const results:Record<string,unknown>={kimi_key_present:true,endpoint:"https://api.moonshot.ai/v1/chat/completions"};

  for(const model of candidates){
    const r=await tryKimi(apiKey,model);
    results[model]={ok:r.ok,status:r.status,error:r.error};
    if(r.ok){
      return json({smoke_result:"PASS",http_status:r.status,provider:"Kimi (Moonshot AI)",provider_key:"KIMI",model_used:r.responseModel??model,configured_model:configModel,response_text:r.text,tokens:r.tokens,kimi_key_present:true,fallback_used:model!==configModel,endpoint:"https://api.moonshot.ai/v1/chat/completions",router_version:"v17",per_model_results:results});
    }
    // 401/403 = permanent auth failure — stop trying
    if(r.status===401||r.status===403)break;
    // Small delay between attempts
    await new Promise(res=>setTimeout(res,500));
  }

  return json({smoke_result:"FAIL",reason:"All candidate models returned errors",candidates_tried:candidates,per_model_results:results,kimi_key_present:true,endpoint:"https://api.moonshot.ai/v1/chat/completions",router_version:"v17"},503);
});
