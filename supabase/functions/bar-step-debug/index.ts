import{serve}from"https://deno.land/std@0.190.0/http/server.ts";import{createClient}from"npm:@supabase/supabase-js@2.57.2";
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type,x-internal-secret","Access-Control-Allow-Methods":"POST,GET,OPTIONS"};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...CORS,"Content-Type":"application/json"}});

const ADAPTERS={emergent_mcp:{adapter_key:"emergent_mcp",display_name:"Emergent MCP",category:"builder",connection_type:"mcp_oauth",endpoint:"https://mcp.emergent.sh/",auth_mode:"oauth",capabilities:["create_job","wait_for_job","send_message","list_jobs","get_job_status","get_recent_trajectories","get_job_preview","pause_job"],mutating_actions:["create_job","send_message","pause_job"]}};

serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response(null,{headers:CORS});
  try {
    const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
    const isInternal=(()=>{const s=Deno.env.get("INTERNAL_WEBHOOK_SECRET");return!!s&&req.headers.get("x-internal-secret")===s;})();
    if(!isInternal)return json({error:"Unauthorized"},401);
    
    const body=await req.json();
    const{adapter_key,action,idempotency_key,workspace_id}=body;
    
    // Step 1: workspace
    const wsRes=await sb.from("workspaces").select("id,owner_id").eq("id",workspace_id).maybeSingle();
    if(wsRes.error)return json({step:"workspace",error:wsRes.error.message});
    const actorUserId=wsRes.data?.owner_id;
    if(!actorUserId)return json({step:"actor",error:"No owner_id",wsRes});
    
    // Step 2: connection
    const connRes=await sb.from("unified_connections").select("id,status,is_enabled").eq("workspace_id",workspace_id).eq("provider",adapter_key).eq("category","builder").maybeSingle();
    if(connRes.error)return json({step:"connection_select",error:connRes.error.message});
    
    let connId=connRes.data?.id;
    if(!connId){
      const insRes=await sb.from("unified_connections").insert({user_id:actorUserId,workspace_id,provider:adapter_key,category:"builder",connection_type:"mcp_oauth",status:"disconnected",display_name:"Emergent MCP",config_json:{endpoint:"https://mcp.emergent.sh/"},credentials_encrypted:{},is_enabled:false}).select("id").single();
      if(insRes.error)return json({step:"connection_insert",error:insRes.error.message,code:insRes.error.code});
      connId=insRes.data?.id;
    }
    
    // Step 3: claim
    const claimRes=await sb.from("integration_event_logs").insert({integration_id:connId,user_id:actorUserId,event_type:"adapter_idempotency_claim",event_message:`claim for ${action}`,status:"claiming",adapter_key,idempotency_key,metadata:{action}}).select("id").single();
    if(claimRes.error)return json({step:"claim_insert",error:claimRes.error.message,code:claimRes.error.code});
    
    // Step 4: transition to disconnected_skipped (adapter is disconnected)
    const transRes=await sb.from("integration_event_logs").update({status:"disconnected_skipped",metadata:{action,retryable:true,reason:"adapter_not_connected",transitioned_at:new Date().toISOString()}}).eq("id",claimRes.data!.id);
    if(transRes.error)return json({step:"transition",error:transRes.error.message});
    
    // Read final state
    const finalRes=await sb.from("integration_event_logs").select("id,status,metadata").eq("idempotency_key",idempotency_key).maybeSingle();
    
    return json({ok:true,all_steps_passed:true,workspace_id,actor_user_id:actorUserId,connection_id:connId,claim_id:claimRes.data?.id,final_status:finalRes.data?.status,retryable:(finalRes.data?.metadata as any)?.retryable});
  } catch(e:any) {
    return json({step:"unhandled_exception",error:e.message,stack:e.stack?.slice(0,300)},500);
  }
});
