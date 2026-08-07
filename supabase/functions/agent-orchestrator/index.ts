// supabase/functions/agent-orchestrator/index.ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { askAI } from "../_shared/ai-client.ts";

const CORS={"Access-Control-Allow-Origin":Deno.env.get("ALLOWED_ORIGIN")??"","Access-Control-Allow-Headers":"authorization, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...CORS,"Content-Type":"application/json"}});
const DANGEROUS=["bulk_email","delete_contact","issue_refund","send_contract","export_data","delete_data"];

async function classify(trigger:string){
  const d=DANGEROUS.find(a=>trigger.toLowerCase().includes(a.replace("_"," ")));
  if(d) return{agents:[],priority:"urgent",requires_approval:true,approval_action:d};
  try{
    const r=await askAI(
      "Klasifiko trigger-in dhe zgjedh agjentët nga: sales_manager,marketing_manager,customer_success,ceo_assistant,coach. Kthe JSON:{agents:[],priority:urgent|normal|low}",
      `Trigger: ${trigger}`,100);
    const p=JSON.parse(r.replace(/```json|```/g,"").trim());
    return{agents:p.agents??["marketing_manager"],priority:p.priority??"normal",requires_approval:false};
  }catch{
    if(/blerje|deal|çmim/i.test(trigger)) return{agents:["sales_manager"],priority:"normal",requires_approval:false};
    if(/churn|ankesë/i.test(trigger)) return{agents:["customer_success"],priority:"urgent",requires_approval:false};
    return{agents:["marketing_manager"],priority:"low",requires_approval:false};
  }
}

serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response(null,{headers:CORS});
  const auth=req.headers.get("Authorization");
  if(!auth) return json({error:"Unauthorized"},401);
  const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
  const{data:{user}}=await sb.auth.getUser(auth.replace("Bearer ",""));
  if(!user) return json({error:"Unauthorized"},401);
  let body:{trigger:string;workspace_id?:string;force_agents?:string[]};
  try{body=await req.json();}catch{return json({error:"Body invalid"},400);}
  const wsId=body.workspace_id??user.id;
  const{agents,priority,requires_approval,approval_action}=await classify(body.trigger);
  if(requires_approval) return json({requires_approval:true,action:approval_action,message:`Veprimi "${approval_action}" kërkon aprovim.`},202);
  const selected=body.force_agents??agents;
  const PROMPTS:Record<string,string>={
    sales_manager:`Sales Manager AI. Kthe JSON:{actions:[{priority:1,action:"",why:""}],deals_at_risk:[]}`,
    marketing_manager:`Marketing Manager AI. Kthe JSON:{intent:"interest|inquiry|other",recommended_content:"",next_agent:"sales_manager|none"}`,
    customer_success:`CSM AI. Kthe JSON:{risk_level:"high|medium|low",action:"",message_template:""}`,
    ceo_assistant:`CEO Assistant. Kthe JSON:{decision:"",priority_action:"",risks:[]}`,
    coach:`Business Coach. Kthe JSON:{lesson:"",training_point:""}`,
  };
  const results:Record<string,unknown>={};
  for(const k of selected){
    try{
      const{data:t}=await sb.from("ai_agent_tasks").insert({workspace_id:wsId,task_type:k,agent_name:k,input:{trigger:body.trigger},status:"running",started_at:new Date().toISOString()}).select("id").single();
      const r=await askAI(PROMPTS[k]??PROMPTS.marketing_manager,body.trigger,400);
      let out:Record<string,unknown>;try{out=JSON.parse(r.replace(/```json|```/g,"").trim());}catch{out={response:r};}
      await sb.from("ai_agent_tasks").update({output:out,status:"completed",completed_at:new Date().toISOString()}).eq("id",t?.id??"");
      results[k]=out;
      await sb.from("business_memory").insert({business_id:wsId,entity_type:"agent_insight",memory_key:`${k}_${Date.now()}`,memory_value:{agent:k,insight:JSON.stringify(out).slice(0,200)},confidence:0.9,source:"agent_collaboration"}).catch(()=>{});
    }catch(e){results[k]={error:String(e)};}
  }
  await sb.rpc("log_audit",{p_workspace_id:wsId,p_user_id:user.id,p_action:"orchestrator_run",p_resource_type:"ai_orchestrator",p_severity:priority==="urgent"?"warning":"info",p_new_values:{agents:selected}}).catch(()=>{});
  return json({success:true,priority,agents_run:Object.keys(results).length,results});
});
