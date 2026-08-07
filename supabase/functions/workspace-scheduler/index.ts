// supabase/functions/workspace-scheduler/index.ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{"Content-Type":"application/json"}});
const BASE=Deno.env.get("SUPABASE_URL")!,KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const call=async(fn:string,body:Record<string,unknown>)=>(await fetch(`${BASE}/functions/v1/${fn}`,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${KEY}`},body:JSON.stringify(body)})).ok;

serve(async()=>{
  const sb=createClient(BASE,KEY,{auth:{persistSession:false}});
  const now=new Date(),h=now.getUTCHours(),m=now.getUTCMinutes();
  const half=m<5||(m>=30&&m<35),top=m<5,morn=h===7&&m<5,night=h===0&&m<5;
  const log:string[]=[];
  if(half){
    await call("sales-sequence-engine",{});log.push("sequences ✓");
    await call("appointment-booking",{action:"remind"});log.push("reminders ✓");
    await sb.from("device_approval_requests").update({status:"expired"}).eq("status","pending").lt("expires_at",now.toISOString());
    log.push("approvals-cleanup ✓");
  }
  if(top){
    const{data:ws}=await sb.from("workspaces").select("id").eq("status","active").limit(50);
    for(const w of ws??[]) await call("score-and-rank-leads",{business_id:w.id,trigger:"cron"});
    await call("journey-engine",{action:"batch_update"});
    log.push(`scoring+journey ✓ (${ws?.length??0}ws)`);
  }
  if(morn){
    const{data:pro}=await sb.from("subscriptions").select("user_id").in("plan",["pro","enterprise","ultimate"]).eq("status","active");
    for(const s of pro??[]) await call("agent-orchestrator",{trigger:"CEO morning brief",workspace_id:s.user_id,force_agents:["sales_manager","marketing_manager","customer_success","ceo_assistant"]});
    await call("sync-meta-ads",{});
    log.push(`morning-brief ✓ (${pro?.length??0}ws)`);
  }
  if(night){
    await sb.rpc("decay_memory_confidence");log.push("memory-decay ✓");
    const{data:all}=await sb.from("workspaces").select("id").eq("status","active");
    for(const w of all??[]) await sb.rpc("generate_daily_kpi",{p_workspace_id:w.id}).catch(()=>{});
    await sb.from("audit_log").delete().lt("created_at",new Date(Date.now()-90*86400_000).toISOString());
    log.push(`kpi+audit-cleanup ✓ (${all?.length??0}ws)`);
  }
  await sb.from("audit_log").insert({action:"scheduler_run",resource_type:"system",severity:"info",metadata:{log,h,m}}).catch(()=>{});
  return json({success:true,ts:now.toISOString(),log});
});
