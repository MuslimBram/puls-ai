// supabase/functions/agent-orchestrator/index.ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { askAI } from "../_shared/ai-client.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const CORS={"Access-Control-Allow-Origin":Deno.env.get("ALLOWED_ORIGIN")??"","Access-Control-Allow-Headers":"authorization, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...CORS,"Content-Type":"application/json"}});
const DANGEROUS=["bulk_email","delete_contact","issue_refund","send_contract","export_data","delete_data"];

async function classify(
  trigger:string,
  workspaceId:string,
  authHeader:string,
  userId:string,
){
  const d=DANGEROUS.find(a=>trigger.toLowerCase().includes(a.replace("_"," ")));
  if(d) return{agents:[],priority:"urgent",requires_approval:true,approval_action:d};
  try{
    const r=await askAI(
      "Classify the trigger and pick agents from: sales_manager,marketing_manager,customer_success,ceo_assistant,coach. Return JSON:{agents:[],priority:urgent|normal|low}",
      `Trigger: ${trigger}`,100,{taskType:"text_classification",workspaceId,authHeader,userId});
    const p=JSON.parse(r.replace(/```json|```/g,"").trim());
    return{agents:p.agents??["marketing_manager"],priority:p.priority??"normal",requires_approval:false};
  }catch{
    if(/buy|purchase|deal|price|pricing/i.test(trigger)) return{agents:["sales_manager"],priority:"normal",requires_approval:false};
    if(/churn|complaint|refund/i.test(trigger)) return{agents:["customer_success"],priority:"urgent",requires_approval:false};
    return{agents:["marketing_manager"],priority:"low",requires_approval:false};
  }
}

serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response(null,{headers:CORS});
  const auth=req.headers.get("Authorization");
  if(!auth) return json({error:"Unauthorized"},401);
  const sb=createClient(Deno.env.get("SUPABASE_URL")!,getServiceKey()!,{auth:{persistSession:false}});
  const{data:{user}}=await sb.auth.getUser(auth.replace("Bearer ",""));
  if(!user) return json({error:"Unauthorized"},401);
  let body:{trigger:string;workspace_id?:string;force_agents?:string[]};
  try{body=await req.json();}catch{return json({error:"Body invalid"},400);}
  const wsId=await (async()=>{
    if(body.workspace_id){
      const { data: member } = await sb.rpc("is_workspace_member",{ _user_id:user.id,_workspace_id:body.workspace_id });
      const { data: owned } = await sb.from("workspaces").select("id").eq("id",body.workspace_id).eq("owner_id",user.id).maybeSingle();
      return (member || owned) ? body.workspace_id : null;
    }
    const { data: ownedWs } = await sb.from("workspaces").select("id").eq("owner_id",user.id).order("created_at",{ascending:true}).limit(1).maybeSingle();
    if(ownedWs?.id) return ownedWs.id;
    const { data: memWs } = await sb.from("workspace_members").select("workspace_id").eq("user_id",user.id).order("created_at",{ascending:true}).limit(1).maybeSingle();
    return memWs?.workspace_id ?? null;
  })();
  if(!wsId) return json({error:"Forbidden: no workspace context"},403);
  const{agents,priority,requires_approval,approval_action}=await classify(body.trigger,wsId,auth,user.id);
  if(requires_approval) return json({requires_approval:true,action:approval_action,message:`The action "${approval_action}" requires approval.`},202);
  const selected=body.force_agents??agents;
  const PROMPTS:Record<string,string>={
    sales_manager:`Sales Manager AI. Return JSON:{actions:[{priority:1,action:"",why:""}],deals_at_risk:[]}`,
    marketing_manager:`Marketing Manager AI. Return JSON:{intent:"interest|inquiry|other",recommended_content:"",next_agent:"sales_manager|none"}`,
    customer_success:`CSM AI. Return JSON:{risk_level:"high|medium|low",action:"",message_template:""}`,
    ceo_assistant:`CEO Assistant. Return JSON:{decision:"",priority_action:"",risks:[]}`,
    coach:`Business Coach. Return JSON:{lesson:"",training_point:""}`,
  };
  const results:Record<string,unknown>={};
  for(const k of selected){
    try{
      const{data:t}=await sb.from("ai_agent_tasks").insert({workspace_id:wsId,task_type:k,agent_name:k,input:{trigger:body.trigger},status:"running",started_at:new Date().toISOString()}).select("id").single();
      const r=await askAI(PROMPTS[k]??PROMPTS.marketing_manager,body.trigger,400,{workspaceId:wsId,authHeader:auth,taskType:"complex_reasoning",userId:user.id});
      let out:Record<string,unknown>;try{out=JSON.parse(r.replace(/```json|```/g,"").trim());}catch{out={response:r};}
      await sb.from("ai_agent_tasks").update({output:out,status:"completed",completed_at:new Date().toISOString()}).eq("id",t?.id??"");
      results[k]=out;
      await sb.from("business_memory").insert({business_id:wsId,entity_type:"agent_insight",memory_key:`${k}_${Date.now()}`,memory_value:{agent:k,insight:JSON.stringify(out).slice(0,200)},confidence:0.9,source:"agent_collaboration"}).catch(()=>{});
    }catch(e){results[k]={error:String(e)};}
  }
  await sb.rpc("log_audit",{p_workspace_id:wsId,p_user_id:user.id,p_action:"orchestrator_run",p_resource_type:"ai_orchestrator",p_severity:priority==="urgent"?"warning":"info",p_new_values:{agents:selected}}).catch(()=>{});
  return json({success:true,priority,agents_run:Object.keys(results).length,results});
});
